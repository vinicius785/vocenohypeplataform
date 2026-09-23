import { normalizePortugueseWord } from "../shared/normalize";
import { ALLOWED_GUESSES, DAILY_ANSWERS } from "./dictionary";
import { todayIsoInBrasilia } from "@/lib/timezone";

/**
 * Motor puro do Termo — sem React, sem Supabase. Recebe estado + ação,
 * devolve o novo estado/resultado. Nenhuma regra de jogo mora em
 * `onClick`/`useEffect`/JSX — os componentes só chamam estas funções.
 */

export const TERMO_WORD_LENGTH = 5;
export const TERMO_MAX_ATTEMPTS = 6;
/** Sobe quando a MECÂNICA de avaliação muda de um jeito que invalidaria
 * sessões salvas sob a regra anterior (não é o tamanho do dicionário —
 * trocar/ampliar palavras não quebra sessões existentes). */
export const TERMO_ENGINE_VERSION = 1;

const NORMALIZED_ANSWERS = DAILY_ANSWERS.map(normalizePortugueseWord);
const ALLOWED_GUESS_SET: ReadonlySet<string> = new Set(
  ALLOWED_GUESSES.map(normalizePortugueseWord),
);

export function isAcceptedGuess(word: string): boolean {
  return ALLOWED_GUESS_SET.has(normalizePortugueseWord(word));
}

function hashStringToSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Palavra do dia (forma ORIGINAL, com acentuação correta pra exibição
 * ao revelar) — determinística a partir da data, mesma resposta pra
 * todo mundo no mesmo dia, nunca `Math.random()`. */
export function todayTermoAnswer(dateKey: string = todayIsoInBrasilia()): string {
  const idx = hashStringToSeed(`termo:${dateKey}`) % DAILY_ANSWERS.length;
  return DAILY_ANSWERS[idx];
}

export function todayTermoKey(): string {
  return todayIsoInBrasilia();
}

export type LetterState = "correct" | "present" | "absent";

/**
 * Avaliação em duas passagens — única fonte de verdade, usada pelo
 * servidor (autoridade) e, com o mesmo resultado, pelos testes do
 * cliente. 1ª passagem: marca posições exatas e consome essas
 * ocorrências da resposta. 2ª passagem: distribui o que sobrou como
 * "present" só enquanto houver ocorrência restante; excedente vira
 * "absent". Nunca marca mais ocorrências de uma letra do que ela
 * realmente tem na resposta.
 */
export function evaluateGuess(answer: string, guess: string): LetterState[] {
  const a = normalizePortugueseWord(answer);
  const g = normalizePortugueseWord(guess);
  const len = a.length;
  const result: LetterState[] = new Array(len).fill("absent");

  const remaining = new Map<string, number>();
  for (const ch of a) remaining.set(ch, (remaining.get(ch) ?? 0) + 1);

  for (let i = 0; i < len; i++) {
    if (g[i] === a[i]) {
      result[i] = "correct";
      remaining.set(g[i], (remaining.get(g[i]) ?? 0) - 1);
    }
  }
  for (let i = 0; i < len; i++) {
    if (result[i] === "correct") continue;
    const left = remaining.get(g[i]) ?? 0;
    if (left > 0) {
      result[i] = "present";
      remaining.set(g[i], left - 1);
    }
  }
  return result;
}

export function isWin(result: LetterState[]): boolean {
  return result.length > 0 && result.every((s) => s === "correct");
}

const STATE_RANK: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };

/** Estado do teclado — o melhor estado já visto vence; uma tecla verde
 * nunca é rebaixada por uma tentativa posterior. */
export function keyboardLetterStates(
  guesses: { word: string; result: LetterState[] }[],
): Record<string, LetterState> {
  const best: Record<string, LetterState> = {};
  for (const g of guesses) {
    const word = normalizePortugueseWord(g.word);
    for (let i = 0; i < word.length; i++) {
      const letter = word[i];
      const state = g.result[i];
      if (!best[letter] || STATE_RANK[state] > STATE_RANK[best[letter]]) {
        best[letter] = state;
      }
    }
  }
  return best;
}

export function buildShareText(
  guessesResults: LetterState[][],
  won: boolean,
  dayNumber: number,
): string {
  const attemptsLabel = won
    ? `${guessesResults.length}/${TERMO_MAX_ATTEMPTS}`
    : `X/${TERMO_MAX_ATTEMPTS}`;
  const lines = guessesResults.map((row) =>
    row.map((s) => (s === "correct" ? "🟩" : s === "present" ? "🟨" : "⬛")).join(""),
  );
  return [`Termo Você no Hype #${dayNumber} — ${attemptsLabel}`, "", ...lines].join("\n");
}

/** Sanidade do dicionário — chamada por um teste de build/CI (seção 8 do
 * pedido): garante que a importação não falhou silenciosamente e que os
 * dados fazem sentido antes de o jogo confiar neles. */
export type DictionaryHealth = { ok: true; totalWords: number } | { ok: false; reason: string };

export function checkDictionaryHealth(): DictionaryHealth {
  if (DAILY_ANSWERS.length === 0) return { ok: false, reason: "dicionário vazio" };
  if (DAILY_ANSWERS.length < 100) {
    return { ok: false, reason: `dicionário pequeno demais (${DAILY_ANSWERS.length} palavras)` };
  }
  const invalidLength = DAILY_ANSWERS.find(
    (w) => normalizePortugueseWord(w).length !== TERMO_WORD_LENGTH,
  );
  if (invalidLength) {
    return {
      ok: false,
      reason: `palavra com tamanho inválido após normalizar: "${invalidLength}"`,
    };
  }
  const seen = new Set<string>();
  for (const w of NORMALIZED_ANSWERS) {
    if (seen.has(w)) return { ok: false, reason: `palavra duplicada: "${w}"` };
    seen.add(w);
  }
  const missingFromGuesses = DAILY_ANSWERS.find((w) => !isAcceptedGuess(w));
  if (missingFromGuesses) {
    return {
      ok: false,
      reason: `resposta ausente das tentativas aceitas: "${missingFromGuesses}"`,
    };
  }
  return { ok: true, totalWords: DAILY_ANSWERS.length };
}
