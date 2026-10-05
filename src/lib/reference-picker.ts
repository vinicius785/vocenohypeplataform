import { matchScore, type MentionKind, type MentionOption } from "./mention-kinds";

/** Visão do seletor `#` (puro e testável). Três modos:
 *  - `home`: só `#` digitado → RECENTES (poucas) + CATEGORIAS; sem recentes, só categorias;
 *  - `search`: texto digitado → resultados agrupados por categoria, poucos por grupo;
 *  - `category`: uma categoria escolhida → itens dela (ordenados pelo contexto). */
export type ReferenceKind = Exclude<MentionKind, "user">;
export const REFERENCE_KINDS: ReferenceKind[] = ["task", "project", "campaign", "client"];
export const REFERENCE_KIND_LABEL: Record<ReferenceKind, string> = {
  task: "Tarefas",
  project: "Projetos",
  campaign: "Campanhas",
  client: "Clientes",
};

export type RecentRef = { kind: ReferenceKind; id: string };
export type ReferenceRow =
  | { type: "item"; option: MentionOption }
  | { type: "category"; kind: ReferenceKind; count: number };
export type ReferenceSection = { key: string; label: string; rows: ReferenceRow[] };
export type ReferenceView = {
  mode: "home" | "search" | "category";
  sections: ReferenceSection[];
  /** Linhas na ordem visual — é o que a navegação por teclado percorre. */
  rows: ReferenceRow[];
};

const MAX_RECENTS = 5;
const PER_GROUP = 3;
const PER_CATEGORY = 8;

const isRef = (o: MentionOption): o is MentionOption & { kind: ReferenceKind } => o.kind !== "user";

/** Nome pesa mais que o contexto (hint): achar "Você no Hype" também traz as tarefas dele. */
function score(o: MentionOption, query: string): number {
  const byName = matchScore(o.label, query);
  if (byName > 0) return byName + 1;
  return o.hint && matchScore(o.hint.replace(/^[^:·]*[:·]\s*/, ""), query) > 0 ? 1 : 0;
}

export function buildReferenceView(args: {
  references: readonly MentionOption[];
  query: string;
  recents?: readonly RecentRef[];
  kind?: ReferenceKind | null;
}): ReferenceView {
  const refs = args.references.filter(isRef);
  const query = args.query.trim();
  const boost = (o: MentionOption) => o.boost ?? 0;
  const finish = (mode: ReferenceView["mode"], sections: ReferenceSection[]): ReferenceView => {
    const kept = sections.filter((s) => s.rows.length > 0);
    return { mode, sections: kept, rows: kept.flatMap((s) => s.rows) };
  };

  if (args.kind) {
    const pool = refs.filter((o) => o.kind === args.kind);
    const items = query
      ? pool
          .map((o) => ({ o, s: score(o, query) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s || boost(b.o) - boost(a.o))
          .map((x) => x.o)
      : [...pool].sort((a, b) => boost(b) - boost(a));
    return finish("category", [
      {
        key: args.kind,
        label: REFERENCE_KIND_LABEL[args.kind],
        rows: items.slice(0, PER_CATEGORY).map((option) => ({ type: "item", option })),
      },
    ]);
  }

  if (query) {
    const sections = REFERENCE_KINDS.map((k) => ({
      key: k,
      label: REFERENCE_KIND_LABEL[k],
      rows: refs
        .filter((o) => o.kind === k)
        .map((o) => ({ o, s: score(o, query) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || boost(b.o) - boost(a.o))
        .slice(0, PER_GROUP)
        .map((x): ReferenceRow => ({ type: "item", option: x.o })),
    }));
    return finish("search", sections);
  }

  const byKey = new Map(refs.map((o) => [o.kind + ":" + o.id, o]));
  const recent: ReferenceRow[] = [];
  for (const r of args.recents ?? []) {
    const o = byKey.get(r.kind + ":" + r.id);
    if (o && recent.length < MAX_RECENTS) recent.push({ type: "item", option: o });
  }
  const categories: ReferenceRow[] = REFERENCE_KINDS.map((k) => ({
    type: "category" as const,
    kind: k,
    count: refs.filter((o) => o.kind === k).length,
  })).filter((c) => c.count > 0);
  return finish("home", [
    { key: "recents", label: "Recentes", rows: recent },
    { key: "categories", label: "Categorias", rows: categories },
  ]);
}

/** Recentes: o mais recente primeiro, sem repetir, no máximo `MAX_RECENTS * 2` guardados. */
export function pushRecent(list: readonly RecentRef[], ref: RecentRef): RecentRef[] {
  return [ref, ...list.filter((r) => !(r.kind === ref.kind && r.id === ref.id))].slice(
    0,
    MAX_RECENTS * 2,
  );
}

const RECENTS_KEY = "chat:reference-recents";
export function loadRecents(): RecentRef[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((r) => r && REFERENCE_KINDS.includes(r.kind) && typeof r.id === "string")
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
