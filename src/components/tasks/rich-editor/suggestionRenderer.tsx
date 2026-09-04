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
        const el = renderer.element as HTMLElement;
        // `props.mount` anexa o elemento em `document.body`, fora da
        // stacking context do `Dialog` (que usa `z-50`) — sem um z-index
        // explícito aqui, o popup fica correto em posição mas escondido
        // ATRÁS do diálogo (mesmo bug de empilhamento já visto outras vezes
        // nesta plataforma com Popover dentro de Dialog).
        el.style.zIndex = "9999";
        // Com o `Dialog` aberto, o Radix põe `pointer-events: none` no
        // `<body>` inteiro (só reabilita no próprio `DialogContent`) —
        // como este popup é montado direto no `<body>` (fora da árvore do
        // Dialog), ele HERDA esse `none` e fica visualmente por cima mas
        // completamente inerte a mouse: clique e scroll nunca chegam nele
        // (achado ao vivo: "o scroll não funciona na lista de comandos").
        el.style.pointerEvents = "auto";
        // Reforço: mesmo com pointer-events corrigido, o scroll-lock do
        // Radix ainda pode interceptar o wheel nativo fora da área que ele
        // reconhece como rolável — rola a lista na mão pra não depender
        // disso.
        const scroller = () => el.querySelector<HTMLElement>(".overflow-y-auto");
        const onWheel = (e: WheelEvent) => {
          const target = scroller();
          if (!target) return;
          target.scrollTop += e.deltaY;
          e.preventDefault();
          e.stopPropagation();
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        const baseUnmount = props.mount(el);
        unmount = () => {
          el.removeEventListener("wheel", onWheel);
          baseUnmount();
        };
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
