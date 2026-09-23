import { normalizeWord } from "./termo-words";

/**
 * Avaliação de tentativa do Termo — pura, sem estado, usada tanto pelo
 * servidor (`termo.functions.ts`, fonte de verdade) quanto pelo cliente
 * (feedback/teclado). Duas passagens, exatamente pra tratar letras
 * repetidas corretamente (pedido explícito, seção 11): a 1ª marca as
 * posições exatas e retira essas ocorrências da contagem da resposta; a
 * 2ª distribui as ocorrências QUE SOBRARAM pras posições erradas — nunca
 * marca mais "amarelo"/"verde" de uma letra do que ela realmente aparece
 * na resposta.
 */

export const TERMO_WORD_LENGTH = 5;
export const TERMO_MAX_ATTEMPTS = 6;

export type LetterState = "correct" | "present" | "absent";

export function evaluateGuess(guessRaw: string, answerRaw: string): LetterState[] {
  const guess = normalizeWord(guessRaw);
  const answer = normalizeWord(answerRaw);
  const len = answer.length;
  const result: LetterState[] = new Array(len).fill("absent");

  // Contagem de letras da resposta ainda "disponíveis" pra virar amarelo —
  // decrementada conforme cada ocorrência é consumida por um acerto exato
  // (1ª passagem) ou por uma posição errada (2ª passagem).
  const remaining = new Map<string, number>();
  for (const ch of answer) remaining.set(ch, (remaining.get(ch) ?? 0) + 1);

  // 1ª passagem — posições exatas.
  for (let i = 0; i < len; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
      remaining.set(guess[i], (remaining.get(guess[i]) ?? 0) - 1);
    }
  }

  // 2ª passagem — sobra de ocorrências vira "present", nunca mais do que
  // o que realmente restou depois da 1ª passagem.
  for (let i = 0; i < len; i++) {
    if (result[i] === "correct") continue;
    const left = remaining.get(guess[i]) ?? 0;
    if (left > 0) {
      result[i] = "present";
      remaining.set(guess[i], left - 1);
    }
  }

  return result;
}

/** Estado do teclado — "o melhor estado já visto vence", nunca rebaixa uma
 * tecla verde pra amarelo/cinza numa tentativa posterior (ex.: acertar a
 * posição de um "A" numa tentativa não pode ser desfeito por uma
 * tentativa seguinte que usa "A" numa posição errada). */
const STATE_RANK: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };

export function keyboardLetterStates(
  guesses: { word: string; result: LetterState[] }[],
): Record<string, LetterState> {
  const best: Record<string, LetterState> = {};
  for (const g of guesses) {
    const word = normalizeWord(g.word);
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

export function isWin(result: LetterState[]): boolean {
  return result.every((s) => s === "correct");
}

/** Texto de compartilhamento sem revelar a palavra — grade de quadrados
 * coloridos, mesmo padrão do jogo de referência mas com o nome da
 * plataforma, nunca a marca original. */
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
