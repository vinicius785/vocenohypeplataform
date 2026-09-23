/**
 * Estado de sessão de jogo diário — tipo e regras de compatibilidade
 * compartilhados por ZIP e Termo. Módulo puro: sem React, sem Supabase,
 * sem `Date.now()` implícito fora de onde é passado explicitamente —
 * testável isoladamente.
 *
 * Motivo de existir: a rodada anterior guardava só `path`/`guesses` soltos
 * e inferia "em andamento" pelo tamanho de um array. Quando a MECÂNICA
 * mudou (paredes adicionadas ao ZIP), sessões antigas salvas sob a regra
 * anterior podiam violar a regra nova sem que nada detectasse isso — o
 * cliente simplesmente tentava desenhar um caminho que não é mais válido
 * pelo motor atual. Este módulo formaliza "essa sessão ainda é
 * compatível?" como uma pergunta explícita, respondida ANTES de
 * qualquer tentativa de restaurar/renderizar.
 */

export type GameType = "zip" | "termo";
export type GameStatus = "not_started" | "in_progress" | "won" | "lost";

export type GameSession<TState = unknown> = {
  gameType: GameType;
  challengeId: string;
  challengeVersion: number;
  engineVersion: number;
  status: GameStatus;
  state: TState;
  startedAt: string | null;
  completedAt: string | null;
  /** Segundos efetivamente jogados, acumulados — nunca uma diferença de
   * timestamps calculada ingenuamente contra "agora" (isso é o que
   * produzia o cronômetro absurdo tipo "21:47": diferença entre o
   * horário do dia e um `started_at` de uma sessão errada/antiga). */
  accumulatedSeconds: number;
};

export type SessionIncompatibilityReason =
  | "challenge_id_mismatch"
  | "challenge_version_mismatch"
  | "engine_version_mismatch"
  | "invalid_state_shape"
  | "invalid_game_rules";

export type SessionCompatibility =
  | { compatible: true }
  | { compatible: false; reason: SessionIncompatibilityReason; detail: string };

/** Linha crua como vem do banco (`daily_game_sessions`) — o shape de
 * armazenamento, não o `GameSession` de domínio. */
export type StoredSessionRow = {
  challenge_id: string;
  challenge_version: number | null;
  engine_version: number | null;
  state: unknown;
  started_at: string | null;
  completed_at: string | null;
  elapsed_seconds: number | null;
  attempts: number;
};

/**
 * Decide se uma linha salva ainda pode ser restaurada para o desafio e a
 * versão do motor ATUAIS. Compara SEMPRE `challenge_id` e as duas
 * versões antes de qualquer outra coisa — nunca tenta validar as regras
 * do jogo em cima de um estado que já sabemos ser de outra versão
 * (evita falso-positivo "regras batem por coincidência").
 */
export function checkSessionCompatibility(
  row: Pick<StoredSessionRow, "challenge_id" | "challenge_version" | "engine_version">,
  expected: { challengeId: string; challengeVersion: number; engineVersion: number },
): SessionCompatibility {
  if (row.challenge_id !== expected.challengeId) {
    return {
      compatible: false,
      reason: "challenge_id_mismatch",
      detail: `sessão referencia challenge_id=${row.challenge_id}, esperado=${expected.challengeId}`,
    };
  }
  if ((row.challenge_version ?? 0) !== expected.challengeVersion) {
    return {
      compatible: false,
      reason: "challenge_version_mismatch",
      detail: `sessão na versão de desafio ${row.challenge_version ?? 0}, esperado ${expected.challengeVersion}`,
    };
  }
  if ((row.engine_version ?? 0) !== expected.engineVersion) {
    return {
      compatible: false,
      reason: "engine_version_mismatch",
      detail: `sessão na versão de motor ${row.engine_version ?? 0}, esperado ${expected.engineVersion}`,
    };
  }
  return { compatible: true };
}

/**
 * Cronômetro — única fonte de cálculo de tempo decorrido, usada tanto no
 * servidor quanto no cliente. NUNCA deriva duração de um timestamp de
 * "agora" sozinho: soma o tempo já acumulado (persistido) com o trecho
 * em andamento desde `resumedAt`, só quando a sessão está realmente
 * `in_progress`. Uma sessão `not_started` ou sem `resumedAt` tem
 * elapsed = accumulatedSeconds (nunca inventa um trecho em andamento).
 */
export function computeElapsedSeconds(params: {
  status: GameStatus;
  accumulatedSeconds: number;
  resumedAt: string | null;
  now: number;
}): number {
  const { status, accumulatedSeconds, resumedAt, now } = params;
  if (status !== "in_progress" || !resumedAt) {
    return Math.max(0, accumulatedSeconds);
  }
  const resumedMs = new Date(resumedAt).getTime();
  if (Number.isNaN(resumedMs) || resumedMs > now) {
    // Timestamp absurdo (relógio do servidor divergente, dado corrompido)
    // — nunca produz um valor negativo nem um salto giant; cai pro que já
    // estava acumulado, documentado como limitação de segurança, não
    // "corrigido silenciosamente para um número bonito".
    return Math.max(0, accumulatedSeconds);
  }
  const liveSeconds = Math.floor((now - resumedMs) / 1000);
  return Math.max(0, accumulatedSeconds + liveSeconds);
}
