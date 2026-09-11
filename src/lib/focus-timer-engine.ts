/** Motor puro do cronômetro do Modo Foco — nenhum React, nenhum
 * localStorage aqui dentro (isso é `focus-mode-store.ts`); só funções
 * que recebem uma `FocusSession` e devolvem a próxima, ou derivam o
 * tempo restante a partir do relógio real. Separado da interface e da
 * persistência de propósito (item 18 do pedido: "separe motor do timer,
 * interface, tarefas, áudio e persistência").
 *
 * Precisão (item 7): nunca decrementamos um contador. Ao iniciar/retomar,
 * gravamos `endsAt` (horário final); o restante é sempre
 * `endsAt - Date.now()`. Isso garante o valor certo mesmo depois de a
 * aba passar minutos em segundo plano, o SO suspender timers, ou a
 * página recarregar — o `setInterval` do hook (`use-focus-session.ts`)
 * só força um re-render, nunca é a fonte do valor. */

import type { FocusSelectedTask, FocusSession, FocusSessionKind } from "@/lib/focus-mode-store";

export function remainingMs(session: FocusSession, now: number = Date.now()): number {
  if (session.status === "pausado" || session.status === "ocioso") {
    return session.remainingMsAtPause ?? session.plannedMs;
  }
  if (!session.endsAt) return 0;
  return Math.max(0, Date.parse(session.endsAt) - now);
}

/** Verdadeiro quando a etapa já deveria ter terminado, esteja ela ainda
 * "em_andamento" (caso comum) OU já "pausado" com o restante salvo em
 * zero — este segundo caso é o que produzia o estado inválido "0:00
 * pausado com Continuar disponível" (nunca deveria existir, item 8):
 * pausar bem no instante em que o tempo acaba, ou restaurar uma sessão
 * pausada cujo restante já era zero, deixava a sessão presa em
 * "pausado" pra sempre. Tratando os dois casos aqui, uma única
 * verificação (`isDue`) cobre completar tanto ao vivo quanto ao
 * restaurar. */
export function isDue(session: FocusSession, now: number = Date.now()): boolean {
  if (session.status === "em_andamento") return remainingMs(session, now) <= 0;
  if (session.status === "pausado") return (session.remainingMsAtPause ?? 0) <= 0;
  return false;
}

export function createSession(params: {
  kind: FocusSessionKind;
  durationMs: number;
  task: FocusSelectedTask | null;
  returnTo: string;
  cycleIndex: number;
}): FocusSession {
  const now = Date.now();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    kind: params.kind,
    status: "em_andamento",
    task: params.task,
    plannedMs: params.durationMs,
    endsAt: new Date(now + params.durationMs).toISOString(),
    remainingMsAtPause: null,
    focusedMs: 0,
    startedAt: new Date(now).toISOString(),
    cycleIndex: params.cycleIndex,
    returnTo: params.returnTo,
    registeredAt: null,
  };
}

/** "Focado até agora" é sempre `plannedMs - remaining` — nunca acumulado
 * por soma incremental a cada pausa/retomada, o que arriscaria drift ou
 * dupla-contagem. Como `remainingMs` já lê `remainingMsAtPause` quando
 * pausado, isso funciona igual em ambos os estados. */
export function focusedSoFarMs(session: FocusSession, now: number = Date.now()): number {
  return Math.max(0, session.plannedMs - remainingMs(session, now));
}

export function pauseSession(session: FocusSession, now: number = Date.now()): FocusSession {
  if (session.status !== "em_andamento") return session;
  const remaining = remainingMs(session, now);
  // Pausar bem no instante em que o tempo acaba nunca deve produzir um
  // "pausado em 0:00" (item 8/9: "Continuar só pode aparecer se o tempo
  // restante for maior que zero") — conclui em vez de pausar.
  if (remaining <= 0) return completeSession(session);
  return {
    ...session,
    status: "pausado",
    remainingMsAtPause: remaining,
    endsAt: null,
  };
}

export function resumeSession(session: FocusSession, now: number = Date.now()): FocusSession {
  if (session.status !== "pausado") return session;
  const remaining = session.remainingMsAtPause ?? session.plannedMs;
  // Defensivo: uma sessão pausada com restante zero (não deveria existir
  // depois do guard em `pauseSession`, mas pode vir de um dado antigo já
  // persistido) nunca deve "continuar" — conclui direto.
  if (remaining <= 0) return completeSession(session);
  return {
    ...session,
    status: "em_andamento",
    endsAt: new Date(now + remaining).toISOString(),
    remainingMsAtPause: null,
  };
}

export function restartSession(session: FocusSession, now: number = Date.now()): FocusSession {
  return {
    ...session,
    status: "em_andamento",
    endsAt: new Date(now + session.plannedMs).toISOString(),
    remainingMsAtPause: null,
    focusedMs: 0,
    registeredAt: null,
  };
}

export function completeSession(session: FocusSession): FocusSession {
  return {
    ...session,
    status: "concluido",
    endsAt: null,
    remainingMsAtPause: 0,
    focusedMs: session.plannedMs,
  };
}

export function endSessionEarly(session: FocusSession, now: number = Date.now()): FocusSession {
  return {
    ...session,
    status: "encerrado",
    endsAt: null,
    remainingMsAtPause: 0,
    focusedMs: focusedSoFarMs(session, now),
  };
}
