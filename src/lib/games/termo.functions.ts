import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { todayTermoAnswer, todayTermoKey, isAcceptedGuess, normalizeWord } from "./termo-words";
import {
  evaluateGuess,
  isWin,
  TERMO_MAX_ATTEMPTS,
  TERMO_WORD_LENGTH,
  type LetterState,
} from "./termo-game";

/**
 * Termo — a resposta do dia NUNCA é enviada ao cliente antes do fim da
 * partida (vitória ou 6ª tentativa esgotada). Toda avaliação de tentativa
 * acontece aqui, no servidor. Correção desta rodada: a sessão só é
 * CRIADA na primeira tentativa real (`submitTermoGuess`) — antes disso
 * `getTermoSession` só LÊ, nunca insere; abrir o modal sem digitar nada
 * nunca marca a partida como iniciada.
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

function statusOf(finished: boolean, won: boolean, attempts: number): TermoStatus {
  if (!finished) return attempts > 0 ? "in_progress" : "not_started";
  return won ? "won" : "lost";
}

function toPublic(
  row: {
    state: unknown;
    attempts: number;
    completed_at: string | null;
  } | null,
): TermoSessionPublic {
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

/** Só LÊ — nunca cria linha no banco. */
export const getTermoSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const challengeDate = todayTermoKey();
    const { data: existing, error } = await context.supabase
      .from("daily_game_sessions")
      .select("state, attempts, completed_at")
      .eq("game_type", "termo")
      .eq("challenge_date", challengeDate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    devLog("getTermoSession", { challengeDate, hasRow: !!existing });
    return toPublic(existing ?? null);
  });

const guessSchema = z.object({
  word: z
    .string()
    .trim()
    .refine((v) => normalizeWord(v).length === TERMO_WORD_LENGTH, "A palavra precisa ter 5 letras"),
});

export const submitTermoGuess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof guessSchema>) => guessSchema.parse(input))
  .handler(async ({ data, context }) => {
    const challengeDate = todayTermoKey();
    const word = normalizeWord(data.word);
    if (!isAcceptedGuess(word)) {
      devLog("tentativa rejeitada (fora do dicionário)", word);
      throw new Error("Palavra não encontrada.");
    }

    const { data: existing, error: fetchErr } = await context.supabase
      .from("daily_game_sessions")
      .select("id, state, attempts, completed_at")
      .eq("game_type", "termo")
      .eq("challenge_date", challengeDate)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (existing?.completed_at) throw new Error("Esta partida já terminou.");

    const state = (existing?.state ?? { guesses: [] }) as TermoState;
    if (state.guesses.length >= TERMO_MAX_ATTEMPTS) {
      throw new Error("Limite de tentativas já atingido.");
    }

    const answer = todayTermoAnswer(challengeDate);
    const result = evaluateGuess(word, answer);
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
      };
      if (finished) patch.completed_at = nowIso;
      const { error } = await context.supabase
        .from("daily_game_sessions")
        .update(patch as never)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    }

    return {
      guesses: nextGuesses,
      attempts,
      status: statusOf(finished, won, attempts),
      answer: finished ? answer : undefined,
    } satisfies TermoSessionPublic;
  });
