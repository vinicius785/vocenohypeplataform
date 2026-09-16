import { useEffect, useRef, useState } from "react";

/**
 * Largura real (em px) de um elemento, via `ResizeObserver` — diferente de
 * `useIsMobile` (que só olha a largura da viewport inteira via
 * `matchMedia`), isso reflete a largura do CONTAINER em si. Necessário pra
 * toolbar do editor recalcular quando a coluna do formulário muda de
 * largura (abrir/fechar um painel lateral, redimensionar a janela, etc.),
 * não só quando o breakpoint mobile muda.
 */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
