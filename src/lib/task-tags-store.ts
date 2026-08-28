import { createTableArrayStore } from "@/lib/table-array-store";

/**
 * Registro compartilhado de etiquetas de tarefa (estilo ClickUp) — antes
 * cada tarefa só guardava `tags: string[]` como texto livre, sem lugar
 * nenhum pra saber "essa etiqueta já existe" ou pra editar a cor dela pra
 * todo mundo de uma vez. A tarefa continua guardando só o NOME da
 * etiqueta (`tags: string[]`) — a cor é sempre resolvida daqui na hora de
 * exibir, então mudar a cor aqui já reflete em toda tarefa que usa aquele
 * nome, sem precisar reescrever tarefa nenhuma.
 */
export type TaskTag = {
  id: string;
  name: string;
  /** Classes Tailwind prontas (bg + text), mesmo formato de AVATAR_COLORS
   * em TaskBoard.tsx — reaproveita a mesma paleta em vez de inventar uma
   * nova linguagem de cor. */
  color: string;
  createdAt: string;
};

/** Mesma paleta de `AVATAR_COLORS` (TaskBoard.tsx) — reaproveitada aqui
 * como as opções de cor ao criar/editar uma etiqueta, pra manter as
 * cores do app consistentes em vez de uma paleta nova só pra tags. */
export const TASK_TAG_COLORS: { value: string; label: string }[] = [
  { value: "bg-rose-500 text-white", label: "Rosa" },
  { value: "bg-sky-500 text-white", label: "Azul" },
  { value: "bg-emerald-500 text-white", label: "Verde" },
  { value: "bg-amber-500 text-white", label: "Amarelo" },
  { value: "bg-violet-500 text-white", label: "Roxo" },
  { value: "bg-teal-500 text-white", label: "Verde-água" },
  { value: "bg-fuchsia-500 text-white", label: "Magenta" },
  { value: "bg-orange-500 text-white", label: "Laranja" },
];

const store = createTableArrayStore<TaskTag>("task_tags");

export function initTaskTagsSync(): Promise<void> {
  const p = store.init();
  store.subscribeRealtime();
  return p;
}

export function loadTaskTags(): TaskTag[] {
  return store.get();
}

export function onTaskTagsChange(cb: () => void): () => void {
  return store.subscribe(cb);
}

/** Cria uma etiqueta nova no registro — chamado só quando o nome digitado
 * não bate (sem diferenciar maiúsculas) com nenhuma etiqueta já existente. */
export function createTaskTag(name: string, color: string): TaskTag {
  const tag: TaskTag = {
    id: crypto.randomUUID(),
    name: name.trim(),
    color,
    createdAt: new Date().toISOString(),
  };
  store.set((prev) => [...prev, tag]);
  return tag;
}

/** Só cor (não nome) é editável por enquanto — renomear exigiria
 * reescrever `tags: string[]` em toda tarefa de todo projeto/campanha/
 * Marketing que já usa aquele nome, o que é um escopo bem maior do que
 * "a cor reflete pra todo mundo" pedido. */
export function updateTaskTagColor(id: string, color: string): void {
  store.set((prev) => prev.map((t) => (t.id === id ? { ...t, color } : t)));
}

export function deleteTaskTag(id: string): void {
  store.set((prev) => prev.filter((t) => t.id !== id));
}
