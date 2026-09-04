import Mention from "@tiptap/extension-mention";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { normalizeForSearch, type MentionOption } from "@/lib/mention-kinds";
import { createSuggestionRender } from "./suggestionRenderer";
import { MentionMenu } from "./MentionMenu";

/** Menção estruturada (@Pessoa / @Tarefa) — guarda `id`/`kind` reais no node
 * (não só o texto "@Nome" como o sistema antigo de `TaskBoard.tsx`), pra
 * nunca depender de casar substring com o nome de alguém depois. A busca é
 * alimentada por `MentionOption[]` (`@/lib/mention-kinds`, o mesmo tipo já
 * usado pelo Chat) — sem duplicar tipos/lógica de ranking. */
export function createMentionExtension(getOptions: () => MentionOption[]) {
  const suggestion: Omit<SuggestionOptions<MentionOption>, "editor"> = {
    items: ({ query }) => {
      const q = normalizeForSearch(query);
      const all = getOptions();
      if (!q) return all.slice(0, 30);
      return all.filter((o) => normalizeForSearch(o.label).includes(q)).slice(0, 30);
    },
    render: createSuggestionRender(MentionMenu),
  };

  return Mention.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        kind: {
          default: "user",
          parseHTML: (el: HTMLElement) => el.getAttribute("data-kind"),
          renderHTML: (attrs: { kind?: string }) => ({ "data-kind": attrs.kind }),
        },
      };
    },
  }).configure({
    HTMLAttributes: { class: "rte-mention" },
    // Menção de tarefa fica visualmente distinta (▣ Título, item 9 do
    // pedido) — nunca só a URL/texto cru.
    renderText: ({ node }) =>
      node.attrs.kind === "task" ? `▣ ${node.attrs.label}` : `@${node.attrs.label}`,
    renderHTML: ({ options, node }) => [
      "span",
      options.HTMLAttributes,
      node.attrs.kind === "task" ? `▣ ${node.attrs.label}` : `@${node.attrs.label}`,
    ],
    suggestion,
  });
}
