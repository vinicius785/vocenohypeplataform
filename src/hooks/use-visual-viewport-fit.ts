import { useEffect } from "react";

/**
 * Ajusta a altura do app à área REALMENTE visível no celular.
 *
 * No Safari do iOS o teclado virtual NÃO redimensiona o layout viewport: `100vh`/`100dvh` continuam com a
 * altura total e o Safari "empurra" (pan) a página para revelar o campo em foco — o cabeçalho sobe para fora
 * da tela e o compositor fica no meio. O `visualViewport` é o único que reflete o teclado. Esta função expõe
 * dois CSS vars no `<html>`: `--app-h` (altura visível) e `--app-top` (deslocamento do pan), usados só no
 * mobile pelo contêiner raiz do `AppShell`. Só liga os listeners em telas estreitas e limpa tudo ao sair.
 */
export function useVisualViewportFit() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const root = document.documentElement;
    let frame = 0;

    const apply = () => {
      frame = 0;
      root.style.setProperty("--app-h", `${Math.round(vv.height)}px`);
      root.style.setProperty("--app-top", `${Math.round(vv.offsetTop)}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const clear = () => {
      root.style.removeProperty("--app-h");
      root.style.removeProperty("--app-top");
    };

    const attach = () => {
      vv.addEventListener("resize", schedule);
      vv.addEventListener("scroll", schedule);
      apply();
    };
    const detach = () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      clear();
    };
    const onBreakpoint = () => {
      detach();
      if (mq.matches) attach();
    };

    if (mq.matches) attach();
    mq.addEventListener("change", onBreakpoint);
    return () => {
      mq.removeEventListener("change", onBreakpoint);
      detach();
    };
  }, []);
}
