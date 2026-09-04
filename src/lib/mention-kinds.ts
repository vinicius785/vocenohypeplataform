import {
  Building2,
  FolderKanban,
  ListChecks,
  Megaphone,
  User,
  type LucideIcon,
} from "lucide-react";

/** Categorias mencionáveis hoje. Adicionar uma nova (ex. "creator",
 * "documento") no futuro é só: 1 valor novo aqui, 1 entrada em
 * `MENTION_KIND_CONFIG`/`MENTION_KIND_ORDER`, e um array de `MentionOption`
 * novo montado em `ChatSection` — nada no menu/composer precisa mudar. */
export type MentionKind = "user" | "task" | "project" | "campaign" | "client";

/** Sentinel de "@Todos" — menciona todos os participantes da conversa de
 * uma vez, sem precisar mencionar um por um. Nunca corresponde a uma
 * pessoa real: é oferecido como mais um `MentionOption` (kind "user") no
 * picker, e expandido em menções individuais reais no momento do envio
 * (ver `expandEveryoneMention` em `ChatSection.tsx`) — assim a notificação/
 * badge de menção de cada pessoa (`AppShell.tsx`, `triggerChatPush`)
 * funciona sem nenhuma mudança, exatamente como se cada uma tivesse sido
 * @mencionada à parte. */
export const EVERYONE_MENTION_ID = "__everyone__";
export const EVERYONE_MENTION_LABEL = "Todos";

export const MENTION_KIND_ORDER: MentionKind[] = ["user", "task", "project", "campaign", "client"];

export const MENTION_KIND_CONFIG: Record<
  MentionKind,
  { label: string; Icon: LucideIcon; badgeClass: string }
> = {
  user: {
    label: "Pessoas",
    Icon: User,
    badgeClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  task: {
    label: "Tarefas",
    Icon: ListChecks,
    badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  project: {
    label: "Projetos",
    Icon: FolderKanban,
    badgeClass: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  campaign: {
    label: "Campanhas",
    Icon: Megaphone,
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  client: {
    label: "Clientes",
    Icon: Building2,
    badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
};

/** Uma opção mencionável — mesma forma pros 5 tipos, o que muda é só o
 * conteúdo de cada campo. `campanhaId`/`projectId`/`clienteId` são só sinais
 * de contexto (pra ranking), não fazem parte do que é persistido na
 * mensagem — isso continua sendo `{kind, id, label}` (`ChatMention`). */
export type MentionOption = {
  kind: MentionKind;
  id: string;
  label: string;
  hint?: string;
  photo?: string;
  campanhaId?: string;
  projectId?: string;
  clienteId?: string;
  boost?: number;
};

export type MentionContext = {
  dmPartnerId?: string;
  campanhaId?: string;
  projetoId?: string;
  clienteId?: string;
  /** ids de pessoas mencionadas recentemente nesta conversa, mais recente primeiro. */
  recentUserIds?: string[];
  /** ids de pessoas que aparecem como responsáveis em tarefas do canal ativo. */
  contextAssigneeIds?: string[];
};

export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 3 = prefixo do label inteiro, 2 = prefixo de alguma palavra dentro do
 * label (ex. "prod" bate em "Playbook-Produtos"), 1 = substring solto em
 * qualquer posição, 0 = não bate. Tolerante a acento/case (compara sempre
 * normalizado). */
export function matchScore(label: string, query: string): number {
  const q = normalizeForSearch(query.trim());
  if (!q) return 0;
  const l = normalizeForSearch(label);
  if (l.startsWith(q)) return 3;
  if (new RegExp(`\\b${escapeRegExp(q)}`).test(l)) return 2;
  if (l.includes(q)) return 1;
  return 0;
}

/** Contexto altera ranking, nunca disponibilidade — toda entidade é sempre
 * pesquisável; isso só decide a ORDEM quando não há busca (ou empate de
 * busca). Sem tabela de "recentes"/"membros do canal" nova: usa só sinais
 * reais já disponíveis (parceiro de DM, tarefas/pessoas do canal ativo,
 * menções recentes na própria conversa). */
export function contextBoost(opt: MentionOption, ctx: MentionContext): number {
  let score = 0;
  if (opt.kind === "user") {
    if (ctx.dmPartnerId && opt.id === ctx.dmPartnerId) score += 100;
    if (ctx.recentUserIds?.includes(opt.id)) score += 20;
    if (ctx.contextAssigneeIds?.includes(opt.id)) score += 15;
  } else if (opt.kind === "task") {
    if (ctx.campanhaId && opt.campanhaId === ctx.campanhaId) score += 30;
    if (ctx.projetoId && opt.projectId === ctx.projetoId) score += 30;
  } else if (opt.kind === "project") {
    if (ctx.projetoId && opt.id === ctx.projetoId) score += 50;
  } else if (opt.kind === "campaign") {
    if (ctx.campanhaId && opt.id === ctx.campanhaId) score += 50;
  } else if (opt.kind === "client") {
    if (ctx.clienteId && opt.id === ctx.clienteId) score += 30;
  }
  return score;
}
