import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getDailyPuzzle, validateZipPath, todayZipKey, type ZipCell } from "./zip-game";

/**
 * ZIP — sessão diária persistida em `daily_game_sessions`
 * (`game_type='zip'`), única por `user_id + game_type + challenge_date`
 * (constraint do banco, nunca confiada só no cliente). A solução é
 * validada aqui (`validateZipPath`), nunca só no navegador — um cliente
 * malicioso mandando um `path` qualquer não consegue marcar a partida
 * como concluída sem um caminho realmente válido. Sem leaderboard: cada
 * linha é só do próprio usuário, `zip_daily_results` (tabela antiga,
 * reaproveitada) guarda só o tempo final da própria pessoa.
 */

type ZipState = { path: ZipCell[]; startedAtMs?: number };

const cellSchema = z.object({ r: z.number().int().min(0), c: z.number().int().min(0) });

export const getZipSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const challengeDate = todayZipKey();
    const puzzle = getDailyPuzzle(challengeDate);

    const { data: existing, error: fetchErr } = await context.supabase
      .from("daily_game_sessions")
      .select("*")
      .eq("game_type", "zip")
      .eq("challenge_date", challengeDate)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);

    if (existing) return { session: existing, puzzle };

    const { data: inserted, error: insertErr } = await context.supabase
      .from("daily_game_sessions")
      .insert({
        user_id: context.userId,
        game_type: "zip",
        challenge_date: challengeDate,
        challenge_id: challengeDate,
        state: { path: [] } as never,
      } as never)
      .select("*")
      .single();
    // 23505 = já existe (corrida de dois cliques/abas) — busca a que já foi
    // criada em vez de falhar, idempotente.
    if (insertErr) {
      if (insertErr.code === "23505") {
        const { data: raced, error: racedErr } = await context.supabase
          .from("daily_game_sessions")
          .select("*")
          .eq("game_type", "zip")
          .eq("challenge_date", challengeDate)
          .single();
        if (racedErr) throw new Error(racedErr.message);
        return { session: raced, puzzle };
      }
      throw new Error(insertErr.message);
    }
    return { session: inserted, puzzle };
  });

const saveProgressSchema = z.object({ path: z.array(cellSchema) });

export const saveZipProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof saveProgressSchema>) => saveProgressSchema.parse(input))
  .handler(async ({ data, context }) => {
    const challengeDate = todayZipKey();
    const { data: existing, error: fetchErr } = await context.supabase
      .from("daily_game_sessions")
      .select("id, state, started_at, completed_at")
      .eq("game_type", "zip")
      .eq("challenge_date", challengeDate)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing || existing.completed_at) return { ok: true };

    const state: ZipState = { path: data.path };
    const patch: Record<string, unknown> = { state };
    if (!existing.started_at && data.path.length > 0) patch.started_at = new Date().toISOString();

    const { error } = await context.supabase
      .from("daily_game_sessions")
      .update(patch as never)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
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

    return { ok: true, alreadyCompleted: false };
  });

const hintSchema = z.object({ path: z.array(cellSchema) });

/** Dica — revela só o próximo movimento esperado, nunca a solução
 * inteira. Incrementa `hints_used` (registrado, não limitado nesta
 * versão — decisão simples: o jogo não é avaliação de desempenho, então
 * um limite rígido não é essencial agora). */
export const useZipHint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof hintSchema>) => hintSchema.parse(input))
  .handler(async ({ data, context }) => {
    const challengeDate = todayZipKey();
    const puzzle = getDailyPuzzle(challengeDate);
    const { nextExpectedCell } = await import("./zip-game");
    const hint = nextExpectedCell(puzzle, data.path);

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
    return { hint };
  });
