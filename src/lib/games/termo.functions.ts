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
 * acontece aqui, no servidor — o cliente só recebe o resultado por letra
 * (`correct`/`present`/`absent`), nunca a palavra certa antecipadamente.
 * Sessão em `daily_game_sessions` (`game_type='termo'`), única por
 * usuário+dia (constraint do banco).
 */

type StoredGuess = { word: string; result: LetterState[] };
type TermoState = { guesses: StoredGuess[]; won?: boolean };

export type TermoSessionPublic = {
  guesses: StoredGuess[];
  attempts: number;
  finished: boolean;
  won: boolean;
  /** Só preenchido quando `finished` — nunca antes. */
  answer?: string;
};

function toPublic(row: {
  state: unknown;
  attempts: number;
  completed_at: string | null;
}): TermoSessionPublic {
  const state = (row.state ?? { guesses: [] }) as TermoState;
  const finished = !!row.completed_at;
  return {
    guesses: state.guesses ?? [],
    attempts: row.attempts,
    finished,
    won: !!state.won,
    answer: finished ? todayTermoAnswer(todayTermoKey()) : undefined,
  };
}

export const getTermoSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const challengeDate = todayTermoKey();
    const { data: existing, error } = await context.supabase
      .from("daily_game_sessions")
      .select("*")
      .eq("game_type", "termo")
      .eq("challenge_date", challengeDate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (existing) return toPublic(existing);

    const { data: inserted, error: insertErr } = await context.supabase
      .from("daily_game_sessions")
      .insert({
        user_id: context.userId,
        game_type: "termo",
        challenge_date: challengeDate,
        challenge_id: challengeDate,
        state: { guesses: [] } as never,
        started_at: new Date().toISOString(),
      } as never)
      .select("*")
      .single();
    if (insertErr) {
      if (insertErr.code === "23505") {
        const { data: raced, error: racedErr } = await context.supabase
          .from("daily_game_sessions")
          .select("*")
          .eq("game_type", "termo")
          .eq("challenge_date", challengeDate)
          .single();
        if (racedErr) throw new Error(racedErr.message);
        return toPublic(raced);
      }
      throw new Error(insertErr.message);
    }
    return toPublic(inserted);
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
      throw new Error("Palavra não reconhecida.");
    }

    const { data: existing, error: fetchErr } = await context.supabase
      .from("daily_game_sessions")
      .select("id, state, attempts, completed_at")
      .eq("game_type", "termo")
      .eq("challenge_date", challengeDate)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing) throw new Error("Sessão do dia não encontrada — recarregue a página.");
    if (existing.completed_at) throw new Error("Esta partida já terminou.");

    const state = (existing.state ?? { guesses: [] }) as TermoState;
    if (state.guesses.length >= TERMO_MAX_ATTEMPTS) {
      throw new Error("Limite de tentativas já atingido.");
    }

    const answer = todayTermoAnswer(challengeDate);
    const result = evaluateGuess(word, answer);
    const won = isWin(result);
    const nextGuesses = [...state.guesses, { word, result }];
    const attempts = nextGuesses.length;
    const finished = won || attempts >= TERMO_MAX_ATTEMPTS;

    const patch: Record<string, unknown> = {
      state: { guesses: nextGuesses, won } as TermoState,
      attempts,
    };
    if (finished) patch.completed_at = new Date().toISOString();

    const { data: updated, error } = await context.supabase
      .from("daily_game_sessions")
      .update(patch as never)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return toPublic(updated);
  });
