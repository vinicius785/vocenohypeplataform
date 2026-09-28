import type { ChatMessage } from "@/lib/chat-store";

/**
 * Lógica pura da Timeline do Chat V2 (agrupamento de mensagens, separadores
 * de data, rascunhos por conversa) — extraída em funções puras pra poder
 * testar sem precisar de um harness de DOM (este projeto não tem um; ver
 * `campanha-ui.test.ts` pro mesmo padrão).
 */

export type MessageGroup = {
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  isSystem: boolean;
  messages: ChatMessage[];
};

/** Mensagens consecutivas do mesmo autor, em até 5 minutos uma da outra e no
 * mesmo dia, viram um grupo (avatar/nome só na primeira). Mensagens de
 * sistema (authorId "system") nunca agrupam com nada. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const m of messages) {
    const isSystem = m.authorId === "system";
    const last = groups[groups.length - 1];
    const lastMsg = last?.messages[last.messages.length - 1];
    const sameAuthor = !!last && !isSystem && !last.isSystem && last.authorId === m.authorId;
    const withinWindow = !!lastMsg && m.createdAt - lastMsg.createdAt < GROUP_WINDOW_MS;
    const sameDay = !!lastMsg && isSameDay(lastMsg.createdAt, m.createdAt);
    if (sameAuthor && withinWindow && sameDay) {
      last.messages.push(m);
    } else {
      groups.push({
        authorId: m.authorId,
        authorName: m.authorName,
        authorPhoto: m.authorPhoto,
        isSystem,
        messages: [m],
      });
    }
  }
  return groups;
}

export function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "Hoje" / "Ontem" / "Sexta-feira, 25 de setembro" (sem ano quando é o ano
 * corrente, pra não poluir o separador). */
export function dateDividerLabel(ts: number, now: number = Date.now()): string {
  if (isSameDay(ts, now)) return "Hoje";
  const yesterday = now - 24 * 60 * 60 * 1000;
  if (isSameDay(ts, yesterday)) return "Ontem";
  const d = new Date(ts);
  const base = `${capitalize(WEEKDAYS[d.getDay()])}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  const nowYear = new Date(now).getFullYear();
  return d.getFullYear() === nowYear ? base : `${base} de ${d.getFullYear()}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Índice (na lista já ordenada por data) da primeira mensagem não lida de
 * outra pessoa — usado pra posicionar o divisor "Novas mensagens" e o
 * scroll inicial. `null` quando não há nenhuma (abre no final). */
export function firstUnreadIndex(
  messages: ChatMessage[],
  lastReadAt: number,
  meId: string,
): number | null {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.authorId !== meId && m.createdAt > lastReadAt) return i;
  }
  return null;
}

// ---------- Rascunhos por conversa (client-side only, sem tabela nova) ----------
// Decisão de escopo: rascunho é puramente uma conveniência de digitação, não
// precisa sincronizar entre dispositivos/abas nem sobreviver a troca de
// navegador — por isso fica em localStorage (mesmo padrão de `chat-store.ts`
// pra `chat:me`/`chat:active`), em vez de criar uma tabela `chat_drafts`.
const DRAFT_PREFIX = "chat-v2:draft:";

export function getDraft(convoId: string): string {
  if (!convoId || typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(DRAFT_PREFIX + convoId) ?? "";
  } catch {
    return "";
  }
}

export function setDraft(convoId: string, text: string): void {
  if (!convoId || typeof localStorage === "undefined") return;
  try {
    if (text) localStorage.setItem(DRAFT_PREFIX + convoId, text);
    else localStorage.removeItem(DRAFT_PREFIX + convoId);
  } catch {
    /* ignore */
  }
}

/** Conta menções não lidas endereçadas a `meId` em qualquer conversa —
 * alimenta o atalho "Menções" da navegação (`ChatV2Shortcuts`). Não conta
 * a própria mensagem da pessoa (não faz sentido se automencionar) nem
 * menções já lidas (mensagem mais antiga que `lastReadByConvo` daquela
 * conversa). */
export function countUnreadMentions(
  messages: ChatMessage[],
  meId: string,
  lastReadByConvo: Record<string, number>,
): number {
  let n = 0;
  for (const m of messages) {
    if (m.authorId === meId) continue;
    const lastRead = lastReadByConvo[m.convoId] ?? 0;
    if (m.createdAt <= lastRead) continue;
    if ((m.mentions ?? []).some((mention) => mention.kind === "user" && mention.id === meId)) n++;
  }
  return n;
}

// ---------- Última conversa aberta (restaurada ao entrar em /chat-v2) ----------
export type LastConvoRoute = { kind: "dm" | "channel" | "campaign"; id: string };
const LAST_CONVO_KEY = "chat-v2:last-convo";

export function getLastConvoRoute(): LastConvoRoute | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_CONVO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastConvoRoute;
    if (
      parsed &&
      (parsed.kind === "dm" || parsed.kind === "channel" || parsed.kind === "campaign") &&
      parsed.id
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setLastConvoRoute(route: LastConvoRoute): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAST_CONVO_KEY, JSON.stringify(route));
  } catch {
    /* ignore */
  }
}

// ---------- Preferências de recolhimento da sidebar (por seção) ----------
const SIDEBAR_COLLAPSE_PREFIX = "chat-v2:sidebar-collapsed:";

export function isSidebarSectionCollapsed(section: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSE_PREFIX + section) === "1";
  } catch {
    return false;
  }
}

export function setSidebarSectionCollapsed(section: string, collapsed: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (collapsed) localStorage.setItem(SIDEBAR_COLLAPSE_PREFIX + section, "1");
    else localStorage.removeItem(SIDEBAR_COLLAPSE_PREFIX + section);
  } catch {
    /* ignore */
  }
}
