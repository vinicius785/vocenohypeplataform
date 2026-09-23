import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  getDailyPuzzle,
  validateZipPath,
  validateZipPartialPath,
  nextExpectedCell,
  todayZipKey,
  type ZipCell,
  type ZipPuzzle,
} from "./zip-game";

/**
 * ZIP — sessão diária persistida em `daily_game_sessions`
 * (`game_type='zip'`), única por `user_id + game_type + challenge_date`
 * (constraint do banco). Correção desta rodada: a sessão só é CRIADA na
 * primeira jogada real (`saveZipProgress`/`submitZipCompletion`) — nunca
 * mais no simples GET (`getZipSession`), que antes inseria uma linha só
 * por o modal ter sido aberto. O estado (`not_started`/`in_progress`/
 * `won`) é sempre um campo explícito da resposta, nunca inferido só pela
 * linha existir.
 */

export type ZipStatus = "not_started" | "in_progress" | "won";

export type ZipSessionPublic = {
  puzzle: ZipPuzzle;
  status: ZipStatus;
  path: ZipCell[];
  /** Timestamp ISO persistido do início real — fonte de verdade do
   * cronômetro (nunca um contador local que reseta ao reabrir). */
  startedAt: string | null;
  completedAt: string | null;
  elapsedSeconds: number | null;
  hintsUsed: number;
};

const DEV = process.env.NODE_ENV !== "production";
function devLog(...args: unknown[]) {
  if (DEV) console.info("[zip]", ...args);
}

function toPublic(
  puzzle: ZipPuzzle,
  row: {
    state: unknown;
    started_at: string | null;
    completed_at: string | null;
    elapsed_seconds: number | null;
    hints_used: number;
  } | null,
): ZipSessionPublic {
  if (!row) {
    return {
      puzzle,
      status: "not_started",
      path: [],
      startedAt: null,
      completedAt: null,
      elapsedSeconds: null,
      hintsUsed: 0,
    };
  }
  const path = ((row.state as { path?: ZipCell[] } | null)?.path ?? []) as ZipCell[];
  const status: ZipStatus = row.completed_at
    ? "won"
    : path.length > 0
      ? "in_progress"
      : "not_started";
  return {
    puzzle,
    status,
    path,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    elapsedSeconds: row.elapsed_seconds,
    hintsUsed: row.hints_used,
  };
}

const cellSchema = z.object({ r: z.number().int().min(0), c: z.number().int().min(0) });

/** Só LÊ — nunca cria linha no banco. Abrir e fechar o modal sem jogar
 * nunca gera uma partida "em andamento". */
export const getZipSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const challengeDate = todayZipKey();
    const puzzle = getDailyPuzzle(challengeDate);

    const { data: existing, error } = await context.supabase
      .from("daily_game_sessions")
      .select("state, started_at, completed_at, elapsed_seconds, hints_used")
      .eq("game_type", "zip")
      .eq("challenge_date", challengeDate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    devLog("getZipSession", { challengeDate, hasRow: !!existing });
    return toPublic(puzzle, existing ?? null);
  });

const saveProgressSchema = z.object({ path: z.array(cellSchema) });

/** Grava o caminho em progresso — só aqui (e em `submitZipCompletion`) a
 * linha é criada, na primeira vez que `path.length > 0`. Valida o
 * caminho recebido no servidor (`validateZipPartialPath`) antes de
 * aceitar — nunca confia cegamente no array mandado pelo cliente. */
export const saveZipProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof saveProgressSchema>) => saveProgressSchema.parse(input))
  .handler(async ({ data, context }) => {
    const challengeDate = todayZipKey();
    const puzzle = getDailyPuzzle(challengeDate);
    if (!validateZipPartialPath(puzzle, data.path)) {
      devLog("saveZipProgress: caminho parcial inválido rejeitado", data.path);
      throw new Error("Movimento inválido.");
    }

    const { data: existing, error: fetchErr } = await context.supabase
      .from("daily_game_sessions")
      .select("id, started_at, completed_at")
      .eq("game_type", "zip")
      .eq("challenge_date", challengeDate)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (existing?.completed_at) return { ok: true };

    if (!existing) {
      if (data.path.length === 0) return { ok: true }; // nada a persistir ainda
      const { error } = await context.supabase.from("daily_game_sessions").insert({
        user_id: context.userId,
        game_type: "zip",
        challenge_date: challengeDate,
        challenge_id: challengeDate,
        state: { path: data.path } as never,
        started_at: new Date().toISOString(),
      } as never);
      // 23505 = corrida (outra aba criou entre o SELECT e este INSERT) —
      // idempotente, só tenta o UPDATE em seguida.
      if (error && error.code !== "23505") throw new Error(error.message);
      if (!error) {
        devLog("saveZipProgress: sessão criada na primeira jogada", { challengeDate });
        return { ok: true };
      }
    }

    const patch: Record<string, unknown> = { state: { path: data.path } };
    if (!existing?.started_at && data.path.length > 0) patch.started_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("daily_game_sessions")
      .update(patch as never)
      .eq("game_type", "zip")
      .eq("challenge_date", challengeDate)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    devLog("saveZipProgress", { challengeDate, pathLength: data.path.length });
    return { ok: true };
  });

/** "Reiniciar" — só permitido enquanto não concluído (o desafio diário
 * nunca é reiniciável depois de vencido). Apaga a linha em vez de
 * zerá-la: o próximo movimento real recria do zero, mesma regra de
 * "sessão só nasce na primeira jogada" usada em todo o resto. */
export const resetZipProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const challengeDate = todayZipKey();
    const { error } = await context.supabase
      .from("daily_game_sessions")
      .delete()
      .eq("game_type", "zip")
      .eq("challenge_date", challengeDate)
      .eq("user_id", context.userId)
      .is("completed_at", null);
    if (error) throw new Error(error.message);
    devLog("resetZipProgress", { challengeDate });
    return { ok: true };
  });

const submitSchema = z.object({
  path: z.array(cellSchema),
  elapsedSeconds: z.number().int().min(0),
});

export const submitZipCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof submitSchema>) => submitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const challengeDate = todayZipKey();
    const puzzle = getDailyPuzzle(challengeDate);
    const valid = validateZipPath(puzzle, data.path);
    devLog("submitZipCompletion: validação", {
      challengeDate,
      valid,
      pathLength: data.path.length,
    });
    if (!valid) throw new Error("Caminho inválido — a solução não confere.");

    const { data: existing, error: fetchErr } = await context.supabase
      .from("daily_game_sessions")
      .select("id, completed_at, attempts")
      .eq("game_type", "zip")
      .eq("challenge_date", challengeDate)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (existing?.completed_at) return { ok: true, alreadyCompleted: true };

    const nowIso = new Date().toISOString();
    if (existing) {
      const { error } = await context.supabase
        .from("daily_game_sessions")
        .update({
          state: { path: data.path } as never,
          completed_at: nowIso,
          elapsed_seconds: data.elapsedSeconds,
          attempts: (existing.attempts ?? 0) + 1,
        } as never)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("daily_game_sessions").insert({
        user_id: context.userId,
        game_type: "zip",
        challenge_date: challengeDate,
        challenge_id: challengeDate,
        state: { path: data.path } as never,
        started_at: nowIso,
        completed_at: nowIso,
        elapsed_seconds: data.elapsedSeconds,
        attempts: 1,
      } as never);
      if (error && error.code !== "23505") throw new Error(error.message);
    }

    // Resultado final (tempo) — reaproveita a tabela antiga, já com RLS e
    // unique(user_id, date_key). Falha silenciosa em duplicata (corrida),
    // nunca quebra a conclusão do jogo por causa disso.
    const { error: resultErr } = await context.supabase.from("zip_daily_results").insert({
      user_id: context.userId,
      date_key: challengeDate,
      time_ms: data.elapsedSeconds * 1000,
      moves: data.path.length,
    } as never);
    if (resultErr && resultErr.code !== "23505") {
      console.warn("[zip] falha ao salvar resultado final", resultErr);
    }

    devLog("submitZipCompletion: concluído", {
      challengeDate,
      elapsedSeconds: data.elapsedSeconds,
    });
    return { ok: true, alreadyCompleted: false };
  });

const hintSchema = z.object({ path: z.array(cellSchema) });

/** Dica — revela só o próximo movimento esperado, nunca a solução
 * inteira. Incrementa `hints_used` só quando já existe uma sessão real
 * (pedir dica antes do primeiro movimento não conta como jogada e não
 * cria sessão sozinha). */
export const useZipHint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof hintSchema>) => hintSchema.parse(input))
  .handler(async ({ data, context }) => {
    const challengeDate = todayZipKey();
    const puzzle = getDailyPuzzle(challengeDate);
    if (!validateZipPartialPath(puzzle, data.path)) {
      throw new Error("Caminho atual inválido.");
    }
    const hint = nextExpectedCell(puzzle, data.path);
    devLog("useZipHint", { challengeDate, hint, pathLength: data.path.length });

    if (data.path.length > 0) {
      const { data: existing } = await context.supabase
        .from("daily_game_sessions")
        .select("id, hints_used")
        .eq("game_type", "zip")
        .eq("challenge_date", challengeDate)
        .maybeSingle();
      if (existing) {
        await context.supabase
          .from("daily_game_sessions")
          .update({ hints_used: (existing.hints_used ?? 0) + 1 } as never)
          .eq("id", existing.id);
      }
    }
    return { hint };
  });
