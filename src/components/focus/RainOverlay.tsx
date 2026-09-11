import { useEffect, useRef } from "react";

/** Efeito visual de chuva do Modo Foco (item 2 da rodada de refinamento)
 * — camada exclusiva, `pointer-events: none`, atrás do conteúdo/
 * controles (nunca sobre eles). Gotas finas, lentas, baixa opacidade e
 * baixa densidade — "como chuva vista através de uma janela escura", não
 * uma tempestade. Renderizado em Canvas (não centenas de elementos DOM),
 * sem WebGL nem dependência externa, sem baixar nenhum vídeo/imagem.
 *
 * Independente do áudio: este componente nunca toca nem controla som —
 * só desenha. `enabled` (persistido em `FocusPrefs.visual.rainEnabled`)
 * é a única coisa que liga/desliga esta camada; quando `false`, nada é
 * montado e a tela mantém só o fundo escuro. */
export function RainOverlay({ enabled }: { enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Movimento reduzido (item 3): nenhuma animação — só o fundo escuro
    // já pintado pela tela por trás. Nenhuma funcionalidade do timer
    // depende disso, é puramente decorativo.
    if (reduceMotion) return;

    // Limita o devicePixelRatio (item 2: "evitar consumo excessivo") —
    // em telas 3x isso já corta 2/3 dos pixels desenhados por frame sem
    // diferença perceptível numa camada tão sutil.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    type Drop = { x: number; y: number; len: number; speed: number; opacity: number };
    let drops: Drop[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let paused = document.hidden;

    const DENSITY_PER_100K_PX2 = 1.1; // poucas gotas — baixa densidade de propósito

    const makeDrop = (): Drop => ({
      x: Math.random() * width,
      y: Math.random() * height,
      len: 14 + Math.random() * 18,
      speed: 90 + Math.random() * 70,
      opacity: 0.03 + Math.random() * 0.06,
    });

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const targetCount = Math.min(
        90,
        Math.round(((width * height) / 100_000) * DENSITY_PER_100K_PX2 * 10),
      );
      drops = Array.from({ length: Math.max(20, targetCount) }, makeDrop);
    };

    let lastT = performance.now();
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (paused) {
        lastT = t;
        return;
      }
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(210, 220, 235, 1)";
      ctx.lineCap = "round";
      for (const d of drops) {
        d.y += d.speed * dt;
        d.x -= d.speed * 0.12 * dt; // leve inclinação, vento discreto
        if (d.y > height + d.len) {
          d.y = -d.len;
          d.x = Math.random() * width;
        }
        if (d.x < -10) d.x = width + 10;
        ctx.globalAlpha = d.opacity;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * 0.12, d.y + d.len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const onVisibility = () => {
      paused = document.hidden;
    };

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
