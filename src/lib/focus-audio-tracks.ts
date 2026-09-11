/** Registro centralizado de faixas/sons ambiente do Modo Foco (item 11:
 * "preparar um registro centralizado pra que novos áudios possam ser
 * adicionados futuramente"). Único ponto que soma ou remove categorias —
 * ao adicionar arquivos reais em `public/sounds/ambient/`, basta
 * acrescentar entradas `kind: "file"` aqui, nada mais no app precisa
 * mudar.
 *
 * Hoje o repositório não tem nenhum arquivo de música ambiente
 * licenciado (só existe `public/sounds/notification.mp3`, usado pra
 * avisos, não como trilha de fundo) — por isso não há categorias tipo
 * "Piano"/"Café"/"Natureza" com arquivo de verdade (item 11: "se não
 * houver arquivos musicais disponíveis, manter ocultas as categorias sem
 * conteúdo"). Lo-fi, Música clássica e Chuva são geradas inteiramente ao
 * vivo por síntese (osciladores/ruído filtrado) em `use-ambient-audio.ts`
 * — nunca reproduzem nem reconstroem uma obra de terceiros, só timbres e
 * padrões originais no estilo de cada categoria, sem depender de nenhum
 * serviço externo. Silêncio é uma opção real e sempre disponível. */

export type FocusAmbientCategory = "silencio" | "lofi" | "classica" | "chuva";

export type FocusTrack = {
  id: string;
  title: string;
  category: FocusAmbientCategory;
  kind: "silence" | "generated" | "file";
  /** Só usado quando `kind === "generated"` — qual gerador de
   * `use-ambient-audio.ts` produz esta faixa. */
  generator?: "lofi" | "classical" | "rain";
  /** Só usado quando `kind === "file"` — caminho em `public/`. */
  src?: string;
};

export const FOCUS_TRACKS: FocusTrack[] = [
  { id: "silencio", title: "Silêncio", category: "silencio", kind: "silence" },
  { id: "lofi", title: "Lo-fi", category: "lofi", kind: "generated", generator: "lofi" },
  {
    id: "classica",
    title: "Música clássica",
    category: "classica",
    kind: "generated",
    generator: "classical",
  },
  { id: "chuva", title: "Chuva", category: "chuva", kind: "generated", generator: "rain" },
];

export const FOCUS_CATEGORY_LABEL: Record<FocusAmbientCategory, string> = {
  silencio: "Silêncio",
  lofi: "Lo-fi",
  classica: "Música clássica",
  chuva: "Chuva",
};

/** Só categorias com pelo menos uma faixa realmente disponível aparecem
 * na interface — nunca uma categoria vazia (item 11). Com o registro
 * atual, todas já têm conteúdo; a checagem existe pra continuar válida
 * automaticamente se alguém remover uma faixa no futuro. */
export function availableCategories(): FocusAmbientCategory[] {
  const set = new Set(FOCUS_TRACKS.map((t) => t.category));
  return Array.from(set);
}

export function tracksForCategory(category: FocusAmbientCategory): FocusTrack[] {
  return FOCUS_TRACKS.filter((t) => t.category === category);
}

export function findTrack(id: string | null): FocusTrack | null {
  if (!id) return null;
  return FOCUS_TRACKS.find((t) => t.id === id) ?? null;
}
