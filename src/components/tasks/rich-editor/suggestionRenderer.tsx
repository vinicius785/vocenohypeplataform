import { ReactRenderer } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion";

/** Componentes de popup de sugestão (menu "/" e menu "@") expõem essa
 * interface via `ref` — permite que o teclado (setas/Enter/Esc) seja
 * repassado de dentro do plugin do TipTap pro componente React sem que o
 * componente precise saber nada sobre ProseMirror. */
export interface SuggestionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

/** Fábrica de `render()` pro utilitário `Suggestion` do TipTap — usada tanto
 * pelo menu "/" quanto pelo menu "@", só troca o componente React. TipTap v3
 * já resolve o posicionamento sozinho via `props.mount()` (Floating UI por
 * baixo) — não precisa de tippy.js nem de lógica de posição manual. */
export function createSuggestionRender<Item>(
  Component: React.ComponentType<SuggestionProps<Item> & { ref?: React.Ref<SuggestionListHandle> }>,
): SuggestionOptions<Item>["render"] {
  return () => {
    let renderer: ReactRenderer<SuggestionListHandle, SuggestionProps<Item>> | null = null;
    let unmount: (() => void) | null = null;

    return {
      onStart: (props) => {
        renderer = new ReactRenderer(Component, { props, editor: props.editor });
        // `props.mount` anexa o elemento em `document.body`, fora da
        // stacking context do `Dialog` (que usa `z-50`) — sem um z-index
        // explícito aqui, o popup fica correto em posição mas escondido
        // ATRÁS do diálogo (mesmo bug de empilhamento já visto outras vezes
        // nesta plataforma com Popover dentro de Dialog).
        (renderer.element as HTMLElement).style.zIndex = "9999";
        unmount = props.mount(renderer.element as HTMLElement);
      },
      onUpdate: (props) => {
        renderer?.updateProps(props);
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          unmount?.();
          return true;
        }
        return renderer?.ref?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        unmount?.();
        renderer?.destroy();
      },
    };
  };
}
