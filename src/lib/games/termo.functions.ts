import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  todayTermoAnswer,
  todayTermoKey,
  isAcceptedGuess,
  evaluateGuess,
  isWin,
  TERMO_MAX_ATTEMPTS,
  TERMO_WORD_LENGTH,
  TERMO_ENGINE_VERSION,
  checkDictionaryHealth,
  type LetterState,
} from "./termo/engine";
import { normalizePortugueseWord } from "./shared/normalize";
import { checkSessionCompatibility } from "./shared/session";

/**
 * Termo — a resposta do dia NUNCA é enviada ao cliente antes do fim da
 * partida. Reconstrução desta rodada: dicionário real (996+ palavras,
 * ver `termo/dictionary.ts`) em vez da lista mínima anterior;
 * `engine_version` comparado a cada leitura — uma sessão salva sob uma
 * versão de avaliação antiga nunca é restaurada sem revalidação.
 */

type StoredGuess = { word: string; result: LetterState[] };
type TermoState = { guesses: StoredGuess[]; won?: boolean };

export type TermoStatus = "not_started" | "in_progress" | "won" | "lost";

export type TermoSessionPublic = {
  guesses: StoredGuess[];
  attempts: number;
  status: TermoStatus;
  /** Só preenchido quando `status` é `won`/`lost` — nunca antes. */
  answer?: string;
};

const DEV = process.env.NODE_ENV !== "production";
function devLog(...args: unknown[]) {
  if (DEV) console.info("[termo]", ...args);
}

function assertDictionaryHealthy() {
  const health = checkDictionaryHealth();
  if (!health.ok) {
    console.error("[termo] dicionário reprovado na checagem de integridade", health.reason);
    throw new Error("Não foi possível carregar o jogo agora.");
  }
}

function statusOf(finished: boolean, won: boolean, attempts: number): TermoStatus {
  if (!finished) return attempts > 0 ? "in_progress" : "not_started";
  return won ? "won" : "lost";
}

type SessionRow = {
  id: string;
  state: unknown;
  attempts: number;
  completed_at: string | null;
  challenge_id: string;
  challenge_version: number | null;
  engine_version: number | null;
};

function toPublic(row: SessionRow | null): TermoSessionPublic {
  if (!row) return { guesses: [], attempts: 0, status: "not_started" };
  const state = (row.state ?? { guesses: [] }) as TermoState;
  const finished = !!row.completed_at;
  const won = !!state.won;
  return {
    guesses: state.guesses ?? [],
    attempts: row.attempts,
    status: statusOf(finished, won, row.attempts),
    answer: finished ? todayTermoAnswer(todayTermoKey()) : undefined,
  };
}

/** Só LÊ — nunca cria linha no banco. Uma sessão de versão incompatível
 * (dicionário/motor mudou) é tratada como inexistente, nunca restaurada. */
export const getTermoSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertDictionaryHealthy();
    const challengeDate = todayTermoKey();
    const { data: existing, error } = await context.supabase
      .from("daily_game_sessions")
      .select("id, state, attempts, completed_at, challenge_id, challenge_version, engine_version")
      .eq("game_type", "termo")
      .eq("challenge_date", challengeDate)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (existing) {
      const compat = checkSessionCompatibility(existing, {
        challengeId: challengeDate,
        challengeVersion: 1,
        engineVersion: TERMO_ENGINE_VERSION,
      });
      if (!compat.compatible) {
        devLog("sessão incompatível — tratada como inexistente", compat);
        return toPublic(null);
      }
    }
    devLog("getTermoSession", { challengeDate, hasRow: !!existing });
    return toPublic(existing as SessionRow | null);
  });

const guessSchema = z.object({
  word: z
    .string()
    .trim()
    .refine(
      (v) => normalizePortugueseWord(v).length === TERMO_WORD_LENGTH,
      "A palavra precisa ter 5 letras",
    ),
});

export const submitTermoGuess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof guessSchema>) => guessSchema.parse(input))
  .handler(async ({ data, context }) => {
    assertDictionaryHealthy();
    const challengeDate = todayTermoKey();
    const word = normalizePortugueseWord(data.word);
    if (!isAcceptedGuess(word)) {
      devLog("tentativa rejeitada (fora do dicionário)", word);
      return { accepted: false as const, reason: "not_in_dictionary" as const };
    }

    const { data: existingRaw, error: fetchErr } = await context.supabase
      .from("daily_game_sessions")
      .select("id, state, attempts, completed_at, challenge_id, challenge_version, engine_version")
      .eq("game_type", "termo")
      .eq("challenge_date", challengeDate)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);

    let existing = existingRaw as SessionRow | null;
    if (existing) {
      const compat = checkSessionCompatibility(existing, {
        challengeId: challengeDate,
        challengeVersion: 1,
        engineVersion: TERMO_ENGINE_VERSION,
      });
      if (!compat.compatible) existing = null; // trata como nova sessão
    }
    if (existing?.completed_at) throw new Error("Esta partida já terminou.");

    const state = (existing?.state ?? { guesses: [] }) as TermoState;
    if (state.guesses.length >= TERMO_MAX_ATTEMPTS) {
      throw new Error("Limite de tentativas já atingido.");
    }

    const answer = todayTermoAnswer(challengeDate);
    const result = evaluateGuess(answer, word);
    const won = isWin(result);
    const nextGuesses = [...state.guesses, { word, result }];
    const attempts = nextGuesses.length;
    const finished = won || attempts >= TERMO_MAX_ATTEMPTS;
    devLog("tentativa avaliada", { word, result, won, attempts, finished });

    const nowIso = new Date().toISOString();
    if (!existing) {
      const { error } = await context.supabase.from("daily_game_sessions").insert({
        user_id: context.userId,
        game_type: "termo",
        challenge_date: challengeDate,
        challenge_id: challengeDate,
        challenge_version: 1,
        engine_version: TERMO_ENGINE_VERSION,
        state: { guesses: nextGuesses, won } as never,
        attempts,
        started_at: nowIso,
        completed_at: finished ? nowIso : null,
      } as never);
      if (error) throw new Error(error.message);
    } else {
      const patch: Record<string, unknown> = {
        state: { guesses: nextGuesses, won } as TermoState,
        attempts,
        challenge_version: 1,
        engine_version: TERMO_ENGINE_VERSION,
      };
      if (finished) patch.completed_at = nowIso;
      const { error } = await context.supabase
        .from("daily_game_sessions")
        .update(patch as never)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    }

    return {
      accepted: true as const,
      guesses: nextGuesses,
      attempts,
      status: statusOf(finished, won, attempts),
      answer: finished ? answer : undefined,
    };
  });
