import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getDailyZipChallenge, validateZipChallenge, ZIP_CHALLENGE_VERSION } from "./zip/challenge";
import { applyZipMove, undoZipMove, nextHintCell, ZIP_ENGINE_VERSION } from "./zip/engine";
import { ZIP_INITIAL_STATE, type Cell, type ZipChallenge, type ZipState } from "./zip/types";
import { checkSessionCompatibility, computeElapsedSeconds } from "./shared/session";
import { todayIsoInBrasilia } from "@/lib/timezone";

/**
 * ZIP — sessão diária persistida em `daily_game_sessions`
 * (`game_type='zip'`), única por `user_id + game_type + challenge_date`.
 * Reconstrução desta rodada: `challenge_version`/`engine_version` são
 * comparados a CADA leitura (`checkSessionCompatibility`) antes de
 * restaurar qualquer coisa — uma sessão de uma versão anterior nunca é
 * renderizada, é tratada como inexistente e uma nova (`not_started`)
 * é oferecida no lugar. `applyZipMove`/`undoZipMove`/`nextHintCell`
 * (motor puro) são o ÚNICO caminho de mudança de estado — o servidor
 * nunca aceita um `path` inteiro arbitrário do cliente sem revalidar
 * jogada a jogada a partir do estado anterior conhecido.
 */

export type ZipSessionPublic = {
  challenge: ZipChallenge;
  state: ZipState;
  startedAt: string | null;
  completedAt: string | null;
  elapsedSeconds: number;
  hintsUsed: number;
};

const DEV = process.env.NODE_ENV !== "production";
function devLog(...args: unknown[]) {
  if (DEV) console.info("[zip]", ...args);
}

function todayChallenge(): ZipChallenge {
  const dateKey = todayIsoInBrasilia();
  const challenge = getDailyZipChallenge(dateKey);
  const validation = validateZipChallenge(challenge);
  if (!validation.valid) {
    // Nunca deveria acontecer (a geração garante solubilidade por
    // construção), mas se acontecer nunca abrimos uma partida quebrada —
    // registra o erro e falha alto a barulho em vez de servir um
    // tabuleiro inválido.
    console.error("[zip] desafio do dia reprovado na validação", dateKey, validation.errors);
    throw new Error("Não foi possível carregar o desafio de hoje.");
  }
  return challenge;
}

type SessionRow = {
  id: string;
  state: unknown;
  started_at: string | null;
  completed_at: string | null;
  elapsed_seconds: number | null;
  resumed_at: string | null;
  hints_used: number;
  challenge_id: string;
  challenge_version: number | null;
  engine_version: number | null;
};

function rowToState(row: SessionRow | null): ZipState {
  if (!row) return ZIP_INITIAL_STATE;
  const state = row.state as Partial<ZipState> | null;
  if (!state || !Array.isArray(state.path)) return ZIP_INITIAL_STATE;
  return {
    path: state.path as Cell[],
    expectedNumber: typeof state.expectedNumber === "number" ? state.expectedNumber : 1,
    status: row.completed_at ? "won" : state.path.length > 0 ? "in_progress" : "not_started",
  };
}

export const getZipSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const challenge = todayChallenge();
    const { data: row, error } = await context.supabase
      .from("daily_game_sessions")
      .select(
        "id, state, started_at, completed_at, elapsed_seconds, resumed_at, hints_used, challenge_id, challenge_version, engine_version",
      )
      .eq("game_type", "zip")
      .eq("challenge_date", challenge.id)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (row) {
      const compat = checkSessionCompatibility(row, {
        challengeId: challenge.id,
        challengeVersion: ZIP_CHALLENGE_VERSION,
        engineVersion: ZIP_ENGINE_VERSION,
      });
      if (!compat.compatible) {
        devLog("sessão incompatível — tratada como inexistente", compat);
        // Nunca tenta renderizar; nunca deixa o usuário preso em "em
        // andamento" com um estado que o motor atual não reconhece.
        return {
          challenge,
          state: ZIP_INITIAL_STATE,
          startedAt: null,
          completedAt: null,
          elapsedSeconds: 0,
          hintsUsed: 0,
        } satisfies ZipSessionPublic;
      }
    }

    const state = rowToState(row as SessionRow | null);
    const elapsedSeconds = computeElapsedSeconds({
      status: state.status,
      accumulatedSeconds: row?.elapsed_seconds ?? 0,
      resumedAt: row?.resumed_at ?? null,
      now: Date.now(),
    });
    devLog("getZipSession", { challengeId: challenge.id, status: state.status, elapsedSeconds });
    return {
      challenge,
      state,
      startedAt: row?.started_at ?? null,
      completedAt: row?.completed_at ?? null,
      elapsedSeconds,
      hintsUsed: row?.hints_used ?? 0,
    } satisfies ZipSessionPublic;
  });

const cellSchema = z.object({ row: z.number().int().min(0), column: z.number().int().min(0) });

async function fetchCompatibleRow(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  challengeId: string,
): Promise<SessionRow | null> {
  const { data: row, error } = await supabase
    .from("daily_game_sessions")
    .select(
      "id, state, started_at, completed_at, elapsed_seconds, resumed_at, hints_used, challenge_id, challenge_version, engine_version, attempts",
    )
    .eq("game_type", "zip")
    .eq("challenge_date", challengeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const compat = checkSessionCompatibility(row as SessionRow, {
    challengeId,
    challengeVersion: ZIP_CHALLENGE_VERSION,
    engineVersion: ZIP_ENGINE_VERSION,
  });
  return compat.compatible ? (row as SessionRow) : null;
}

const moveSchema = z.object({ target: cellSchema });

/**
 * Um único movimento por chamada — nunca um `path` inteiro mandado pelo
 * cliente. O servidor sempre revalida a partir do ÚLTIMO ESTADO
 * CONHECIDO DELE MESMO (nunca do que o cliente afirma ser o estado
 * atual), então uma chamada fora de ordem/duplicada nunca corrompe o
 * caminho — na pior hipótese, é rejeitada como movimento inválido contra
 * o estado real.
 */
export const applyZipMoveAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof moveSchema>) => moveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const challenge = todayChallenge();
    const existing = await fetchCompatibleRow(context.supabase, challenge.id);
    const currentState = rowToState(existing);
    const result = applyZipMove(challenge, currentState, data.target);
    devLog("applyZipMoveAction", { target: data.target, result });
    if (!result.ok) {
      return { ok: false as const, error: result.error, state: currentState };
    }

    const nowIso = new Date().toISOString();
    if (!existing) {
      const { error } = await context.supabase.from("daily_game_sessions").insert({
        user_id: context.userId,
        game_type: "zip",
        challenge_date: challenge.id,
        challenge_id: challenge.id,
        challenge_version: ZIP_CHALLENGE_VERSION,
        engine_version: ZIP_ENGINE_VERSION,
        state: result.state as never,
        started_at: nowIso,
        resumed_at: nowIso,
        elapsed_seconds: 0,
        completed_at: result.state.status === "won" ? nowIso : null,
        attempts: result.state.status === "won" ? 1 : 0,
      } as never);
      if (error) throw new Error(error.message);
    } else {
      const patch: Record<string, unknown> = {
        state: result.state,
        challenge_version: ZIP_CHALLENGE_VERSION,
        engine_version: ZIP_ENGINE_VERSION,
      };
      if (!existing.started_at) patch.started_at = nowIso;
      if (!existing.resumed_at) patch.resumed_at = nowIso; // retomou de uma pausa
      if (result.state.status === "won") {
        const accumulated = computeElapsedSeconds({
          status: "in_progress",
          accumulatedSeconds: existing.elapsed_seconds ?? 0,
          resumedAt: existing.resumed_at ?? nowIso,
          now: Date.now(),
        });
        patch.elapsed_seconds = accumulated;
        patch.resumed_at = null;
        patch.completed_at = nowIso;
      }
      const { error } = await context.supabase
        .from("daily_game_sessions")
        .update(patch as never)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    }

    if (result.state.status === "won") {
      const { error: resultErr } = await context.supabase.from("zip_daily_results").insert({
        user_id: context.userId,
        date_key: challenge.id,
        time_ms:
          computeElapsedSeconds({
            status: "won",
            accumulatedSeconds: existing?.elapsed_seconds ?? 0,
            resumedAt: existing?.resumed_at ?? nowIso,
            now: Date.now(),
          }) * 1000,
        moves: result.state.path.length,
      } as never);
      if (resultErr && resultErr.code !== "23505") {
        console.warn("[zip] falha ao salvar resultado final", resultErr);
      }
    }

    return { ok: true as const, state: result.state };
  });

/** Pausa o cronômetro (chamado ao fechar o modal) — soma o trecho corrente
 * ao acumulado e limpa `resumed_at`. Idempotente: chamar de novo sem
 * `resumed_at` setado não faz nada. */
export const pauseZipTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const challenge = todayChallenge();
    const existing = await fetchCompatibleRow(context.supabase, challenge.id);
    if (!existing || !existing.resumed_at || existing.completed_at) return { ok: true };
    const accumulated = computeElapsedSeconds({
      status: "in_progress",
      accumulatedSeconds: existing.elapsed_seconds ?? 0,
      resumedAt: existing.resumed_at,
      now: Date.now(),
    });
    const { error } = await context.supabase
      .from("daily_game_sessions")
      .update({ elapsed_seconds: accumulated, resumed_at: null } as never)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    devLog("pauseZipTimer", { accumulated });
    return { ok: true };
  });

/** "Reiniciar" — só permitido enquanto não concluído. Apaga a linha; o
 * próximo movimento real recria do zero. */
export const resetZipProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const challenge = todayChallenge();
    const { error } = await context.supabase
      .from("daily_game_sessions")
      .delete()
      .eq("game_type", "zip")
      .eq("challenge_date", challenge.id)
      .eq("user_id", context.userId)
      .is("completed_at", null);
    if (error) throw new Error(error.message);
    devLog("resetZipProgress", { challengeId: challenge.id });
    return { ok: true };
  });

/** Dica — revela só o próximo movimento esperado (via o mesmo motor de
 * jogada, nunca uma segunda lógica de adjacência), incrementa
 * `hints_used`. */
export const useZipHint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const challenge = todayChallenge();
    const existing = await fetchCompatibleRow(context.supabase, challenge.id);
    const state = rowToState(existing);
    const hint = nextHintCell(challenge, state);
    devLog("useZipHint", { hint });
    if (existing) {
      await context.supabase
        .from("daily_game_sessions")
        .update({ hints_used: (existing.hints_used ?? 0) + 1 } as never)
        .eq("id", existing.id);
    }
    return { hint };
  });

/** Desfazer — recalcula o estado a partir do último conhecido pelo
 * servidor (`undoZipMove`), nunca aceita um `path` alternativo do
 * cliente. */
export const undoZipMoveAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const challenge = todayChallenge();
    const existing = await fetchCompatibleRow(context.supabase, challenge.id);
    if (!existing) return { state: ZIP_INITIAL_STATE };
    const currentState = rowToState(existing);
    const nextState = undoZipMove(challenge, currentState);
    const { error } = await context.supabase
      .from("daily_game_sessions")
      .update({ state: nextState } as never)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    devLog("undoZipMoveAction", { nextState });
    return { state: nextState };
  });
