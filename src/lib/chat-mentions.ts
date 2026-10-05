import type { ChatChannel, ChatMember, ChatMention } from "@/lib/chat-store";
import {
  EVERYONE_MENTION_ID,
  EVERYONE_MENTION_LABEL,
  normalizeForSearch,
} from "@/lib/mention-kinds";

/** Regras PURAS de menção de pessoas no Chat. `@` = mencionar uma PESSOA, e só em conversa
 * coletiva; conversa direta (1↔1) não tem menção. Referências a tarefa/projeto/campanha/cliente
 * são outro mecanismo (`#`) e não passam por aqui. */
export type ConversationKind = "dm" | "channel" | "project" | "campaign";

/** `dm:a|b` direta · `c:<uuid>` canal · `proj:<id>` projeto · `camp:<id>` campanha. */
export function conversationKind(convoId: string): ConversationKind {
  if (convoId.startsWith("dm:")) return "dm";
  if (convoId.startsWith("proj:")) return "project";
  if (convoId.startsWith("camp:")) return "campaign";
  return "channel";
}

/** Só conversas coletivas têm menção de pessoas. */
export function canMentionPeople(convoId: string): boolean {
  return conversationKind(convoId) !== "dm";
}

/** Quem pode ser mencionado nesta conversa (nunca o próprio autor). Canal privado: só os membros
 * permitidos; canal público, projeto e campanha: o time (a visibilidade desses já é regra atual do
 * Chat). Direta: ninguém. */
export function eligibleMentionMembers(args: {
  convoId: string;
  members: readonly ChatMember[];
  channels: readonly ChatChannel[];
  meId: string;
}): ChatMember[] {
  const { convoId, members, channels, meId } = args;
  if (!canMentionPeople(convoId)) return [];
  let pool = members.filter((m) => m.id !== meId);
  if (conversationKind(convoId) === "channel") {
    const ch = channels.find((c) => c.id === convoId);
    if (ch?.private && ch.allowedMemberIds && ch.allowedMemberIds.length > 0) {
      const allowed = new Set(ch.allowedMemberIds);
      pool = pool.filter((m) => allowed.has(m.id));
    }
  }
  return pool;
}

/** Normalização ÚNICA de menções na hora de gravar: em conversa direta nenhuma menção de pessoa
 * sobrevive (referências a entidades continuam). Também remove duplicatas. */
export function sanitizeMentionsForConversation(
  convoId: string,
  mentions: readonly ChatMention[] | undefined,
): ChatMention[] {
  const dm = !canMentionPeople(convoId);
  const seen = new Set<string>();
  const out: ChatMention[] = [];
  for (const m of mentions ?? []) {
    if (dm && m.kind === "user") continue;
    const key = `${m.kind}:${m.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/** "@Todos" vira uma menção individual por participante elegível (menos o autor), reaproveitando a
 * notificação/badge de menção individual. Sem o sentinela, devolve a lista como está. */
export function expandEveryoneMention(
  mentions: readonly ChatMention[],
  eligibleIds: readonly string[],
): ChatMention[] {
  if (!mentions.some((m) => m.kind === "user" && m.id === EVERYONE_MENTION_ID)) {
    return [...mentions];
  }
  const rest = mentions.filter((m) => !(m.kind === "user" && m.id === EVERYONE_MENTION_ID));
  const already = new Set(rest.filter((m) => m.kind === "user").map((m) => m.id));
  const extra: ChatMention[] = eligibleIds
    .filter((id) => !already.has(id))
    .map((id) => ({ kind: "user", id, label: EVERYONE_MENTION_LABEL }));
  return [...rest, ...extra];
}

export type PersonResult = { member: ChatMember; score: number };

const usernameOf = (m: ChatMember) => (m.email ?? "").split("@")[0] ?? "";

function fieldScore(value: string, q: string): number {
  if (!value) return 0;
  const v = normalizeForSearch(value);
  if (v.startsWith(q)) return 3;
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(v)) return 2;
  return v.includes(q) ? 1 : 0;
}

/** Pessoas para o autocomplete: com busca, filtra por nome (peso maior), usuário (parte do e-mail)
 * e cargo; sem busca, prioriza quem participou/foi mencionado há pouco. Limitado a `limit`. */
export function rankPeople(
  members: readonly ChatMember[],
  query: string,
  opts: { recentIds?: readonly string[]; limit?: number } = {},
): PersonResult[] {
  const { recentIds = [], limit = 6 } = opts;
  const q = normalizeForSearch(query.trim());
  const recentRank = new Map(recentIds.map((id, i) => [id, recentIds.length - i]));
  const scored = members
    .map((member) => {
      const base = q
        ? Math.max(
            fieldScore(member.name, q) * 3,
            fieldScore(usernameOf(member), q) * 2,
            fieldScore(member.role ?? "", q),
          )
        : 1;
      return { member, score: base, recent: recentRank.get(member.id) ?? 0 };
    })
    .filter((r) => !q || r.score > 0);
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.recent - a.recent ||
      a.member.name.localeCompare(b.member.name, "pt-BR"),
  );
  return scored.slice(0, limit).map(({ member, score }) => ({ member, score }));
}

export type HighlightSegment = { text: string; match: boolean };

/** Quebra `label` em trechos para destacar a busca (sem diferenciar acento/maiúscula). */
export function highlightSegments(label: string, query: string): HighlightSegment[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return [{ text: label, match: false }];
  // Mapeia cada caractere original ao seu equivalente normalizado (1:1 por code point simples).
  const chars = Array.from(label);
  const norm = chars.map((c) => normalizeForSearch(c));
  const flat = norm.join("");
  const at = flat.indexOf(q);
  if (at < 0) return [{ text: label, match: false }];
  let start = -1;
  let end = -1;
  let pos = 0;
  for (let i = 0; i < chars.length; i++) {
    const next = pos + norm[i].length;
    if (start < 0 && at < next) start = i;
    if (start >= 0 && at + q.length <= next && end < 0) end = i + 1;
    pos = next;
  }
  if (start < 0) return [{ text: label, match: false }];
  if (end < 0) end = chars.length;
  const seg = (a: number, b: number, match: boolean) => ({
    text: chars.slice(a, b).join(""),
    match,
  });
  return [seg(0, start, false), seg(start, end, true), seg(end, chars.length, false)].filter(
    (s) => s.text !== "",
  );
}

export type MentionTrigger = { char: "@" | "#"; start: number; query: string };

/** Detecta se o cursor está dentro de um gatilho de menção:
 * - `@` só em conversa coletiva (`mentionsEnabled`); em DM nunca abre nada;
 * - `#` (referência a tarefa/projeto/campanha/cliente) só depois de ao menos 1 caractere, para não
 *   atrapalhar títulos de markdown ("# Título").
 * O gatilho vale no início do texto ou depois de espaço/quebra de linha, e a consulta não pode ter
 * espaços. */
export function detectMentionTrigger(
  text: string,
  caret: number,
  mentionsEnabled: boolean,
): MentionTrigger | null {
  const before = text.slice(0, caret);
  const at = Math.max(before.lastIndexOf("@"), before.lastIndexOf("#"));
  if (at < 0) return null;
  const char = before[at] as "@" | "#";
  if (char === "@" && !mentionsEnabled) return null;
  const prev = at === 0 ? " " : before[at - 1];
  if (prev !== " " && prev !== "\n") return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  if (char === "#" && query.length === 0) return null;
  return { char, start: at, query };
}
