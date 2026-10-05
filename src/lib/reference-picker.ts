import { matchScore, type MentionOption } from "./mention-kinds";

/** Visão do seletor `#` — referência de TAREFAS (puro e testável).
 *  - sem texto: RECENTES (as últimas usadas) + SUGERIDAS (as minhas/ativas, pelo `boost`);
 *  - com texto: tarefas cujo título (ou projeto/contexto) casa, melhores primeiro. */
export type RecentRef = { kind: "task"; id: string };
export type ReferenceSection = { key: string; label: string; items: MentionOption[] };
export type ReferenceView = {
  mode: "home" | "search";
  sections: ReferenceSection[];
  /** Itens na ordem visual — é o que a navegação por teclado percorre. */
  items: MentionOption[];
};

const MAX_RECENTS = 4;
const MAX_HOME = 8;
const MAX_SEARCH = 10;

/** Título pesa mais que o contexto: o nome do projeto só entra como desempate/achado secundário. */
function score(o: MentionOption, query: string): number {
  const byName = matchScore(o.label, query);
  if (byName > 0) return byName + 1;
  return o.hint && matchScore(o.hint.replace(/^[^:·]*[:·]\s*/, ""), query) > 0 ? 1 : 0;
}

export function buildReferenceView(args: {
  references: readonly MentionOption[];
  query: string;
  recents?: readonly RecentRef[];
}): ReferenceView {
  const tasks = args.references.filter((o) => o.kind === "task");
  const query = args.query.trim();
  const boost = (o: MentionOption) => o.boost ?? 0;
  const finish = (mode: ReferenceView["mode"], sections: ReferenceSection[]): ReferenceView => {
    const kept = sections.filter((s) => s.items.length > 0);
    return { mode, sections: kept, items: kept.flatMap((s) => s.items) };
  };

  if (query) {
    const found = tasks
      .map((o) => ({ o, s: score(o, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || boost(b.o) - boost(a.o))
      .slice(0, MAX_SEARCH)
      .map((x) => x.o);
    return finish("search", [{ key: "results", label: "Resultados", items: found }]);
  }

  const byId = new Map(tasks.map((o) => [o.id, o]));
  const recent: MentionOption[] = [];
  for (const r of args.recents ?? []) {
    const o = byId.get(r.id);
    if (o && recent.length < MAX_RECENTS) recent.push(o);
  }
  const used = new Set(recent.map((o) => o.id));
  const suggested = tasks
    .filter((o) => !used.has(o.id))
    .sort((a, b) => boost(b) - boost(a))
    .slice(0, Math.max(0, MAX_HOME - recent.length));
  return finish("home", [
    { key: "recents", label: "Recentes", items: recent },
    { key: "suggested", label: recent.length ? "Sugeridas" : "Tarefas", items: suggested },
  ]);
}

/** Recentes: a mais recente primeiro, sem repetir. */
export function pushRecent(list: readonly RecentRef[], ref: RecentRef): RecentRef[] {
  return [ref, ...list.filter((r) => r.id !== ref.id)].slice(0, MAX_RECENTS * 2);
}

const RECENTS_KEY = "chat:reference-recents";
export function loadRecents(): RecentRef[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw
          .filter((r) => r && typeof r.id === "string")
          .map((r) => ({ kind: "task" as const, id: r.id as string }))
      : [];
  } catch {
    return [];
  }
}
export function rememberRecent(ref: RecentRef) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(pushRecent(loadRecents(), ref)));
  } catch {
    /* sem storage: só não lembra */
  }
}
