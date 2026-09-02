import type { BlogPost, BlogStatus } from "@/lib/projetos";

export const STATUS: { key: BlogStatus; label: string; cls: string }[] = [
  {
    key: "rascunho",
    label: "Rascunho",
    cls: "bg-muted text-muted-foreground",
  },
  {
    key: "agendado",
    label: "Agendado",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  {
    key: "publicado",
    label: "Publicado",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  {
    key: "despublicado",
    label: "Despublicado",
    cls: "bg-muted text-muted-foreground",
  },
];

export function statusInfo(status: BlogStatus) {
  return STATUS.find((s) => s.key === status) ?? STATUS[0];
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export function destinoLabel(p: Pick<BlogPost, "audience" | "portalClienteIds">): string {
  const parts: string[] = [];
  if (p.audience?.includes("site")) parts.push("Site");
  if (p.audience?.includes("mural")) parts.push("Mural interno");
  if ((p.portalClienteIds?.length ?? 0) > 0) parts.push("Portal do cliente");
  return parts.length > 0 ? parts.join(" + ") : "Sem destino";
}

export type ChecklistItem = {
  key: "title" | "content" | "author" | "cover" | "destino" | "portalClientes";
  label: string;
  done: boolean;
  required: boolean;
};

/** Checklist "pronto pra publicar" — considera as regras do destino
 * selecionado (ex.: Portal do cliente exige ao menos 1 cliente marcado).
 * Capa é sempre opcional, nunca bloqueia publicação. */
export function buildChecklist(post: BlogPost): ChecklistItem[] {
  const hasPortal = (post.portalClienteIds?.length ?? 0) > 0;
  const hasDestino = (post.audience?.length ?? 0) > 0 || hasPortal;
  const items: ChecklistItem[] = [
    {
      key: "title",
      label: "Título",
      done: post.title.trim().length > 0 && post.title.trim() !== "Novo artigo",
      required: true,
    },
    {
      key: "content",
      label: "Conteúdo",
      done: (post.content ?? "").trim().length > 0,
      required: true,
    },
    {
      key: "author",
      label: "Autor",
      done: !!post.authorId || !!(post.authorName ?? "").trim(),
      required: true,
    },
    {
      key: "cover",
      label: "Capa",
      done: !!post.cover,
      required: false,
    },
    {
      key: "destino",
      label: "Destino",
      done: hasDestino,
      required: true,
    },
  ];
  // "Portal do cliente" marcado sem nenhum cliente escolhido ainda não
  // conta como destino resolvido — item extra só aparece nesse caso, pra
  // não confundir quem nem marcou o portal.
  const portalTouched =
    (post.portalClienteIds !== undefined && post.portalClienteIds.length === 0) || hasPortal;
  if (portalTouched) {
    items.push({
      key: "portalClientes",
      label: "Cliente(s) do portal",
      done: hasPortal,
      required: true,
    });
  }
  return items;
}

export function pendingRequired(items: ChecklistItem[]): ChecklistItem[] {
  return items.filter((i) => i.required && !i.done);
}
