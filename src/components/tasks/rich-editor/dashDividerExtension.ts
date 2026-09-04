import { Extension } from "@tiptap/core";

/** "--" + Enter numa linha vazia (exceto pelo próprio "--") vira um divisor
 * horizontal (item 5 do pedido). É um atalho de TECLA (Enter), não de input
 * rule por espaço — por isso um `addKeyboardShortcuts` em vez de
 * `addInputRules` (que só dispara em digitação de texto, não em Enter). */
export const DashDivider = Extension.create({
  name: "dashDivider",
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state } = this.editor;
        const { $from } = state.selection;
        if ($from.parent.type.name !== "paragraph") return false;
        if ($from.parent.textContent !== "--") return false;
        // `setHorizontalRule` já garante um parágrafo vazio depois quando
        // não existe um a seguir — reaproveita a lógica pronta da extensão
        // em vez de recalcular posições na mão.
        const start = $from.start();
        const end = $from.end();
        return this.editor.chain().deleteRange({ from: start, to: end }).setHorizontalRule().run();
      },
    };
  },
});
