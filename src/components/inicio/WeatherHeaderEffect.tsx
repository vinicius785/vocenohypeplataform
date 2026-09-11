import { useEffect, useRef } from "react";
import type { WeatherCondition } from "@/lib/weather-condition";

/** Camada atmosférica do cabeçalho da Home — implementação PRÓPRIA,
 * independente do motor de chuva do Modo Foco
 * (`src/components/focus/RainOverlay.tsx`): mesma convenção geral
 * (Canvas, `pointer-events-none`, DPR limitado, pausa em aba oculta,
 * respeita `prefers-reduced-motion`), mas densidade/área/intensidade
 * próprias e restritas ao próprio cabeçalho.
 *
 * Sempre atrás do conteúdo (`absolute inset-0`, z abaixo do texto), sem
 * nenhum áudio, sem relâmpagos/flashes mesmo em tempestade. Nunca
 * recebe nem exibe localização — só `condition`/`isDay`, os únicos dois
 * dados que a interface tem permissão de conhecer sobre o clima (a
 * localização fixa vive só em `weather-location.ts`, usada apenas pelo
 * serviço que busca o dado).
 *
 * Sempre tem uma composição válida, mesmo em "unknown" (ainda sem
 * clima carregado, ou provedor fora do ar) — uma base neutra cobre o
 * cabeçalho inteiro, e o tratamento específico de cada condição fica
 * concentrado numa faixa do lado direito, preservando uma área limpa
 * atrás da saudação (a saudação fica na metade esquerda do cabeçalho). */
export function WeatherHeaderEffect({
  condition,
  isDay,
}: {
  condition: WeatherCondition;
  isDay: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const precipitation = isPrecipitation(condition);

  useEffect(() => {
    if (!precipitation) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const mode = condition === "snow" ? "snow" : "rain";
    const densityFactor =
      condition === "drizzle"
        ? 0.35
        : condition === "rain"
          ? 0.55
          : condition === "heavy-rain"
            ? 0.8
            : condition === "thunderstorm"
              ? 0.85
              : condition === "snow"
                ? 0.5
                : 0;

    // "opacityFactor" (não um valor final já pronto) porque o tema pode
    // trocar com a tela aberta (item 10: "a troca de tema não deve
    // reiniciar animações") — o brilho-base é recalculado A CADA FRAME a
    // partir do tema atual, sem regenerar as partículas.
    type Particle = { x: number; y: number; len: number; speed: number; opacityFactor: number };
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let paused = document.hidden;

    const makeParticle = (): Particle => ({
      x: Math.random() * width,
      y: Math.random() * height,
      len: mode === "snow" ? 2.5 + Math.random() * 2 : 10 + Math.random() * 12,
      speed:
        mode === "snow" ? 14 + Math.random() * 12 : (60 + Math.random() * 50) * densityFactor + 30,
      opacityFactor: 0.6 + Math.random() * 0.7,
    });

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Menos partículas em telas estreitas (mobile).
      const widthFactor = Math.min(1, width / 900);
      const count = Math.round(Math.max(6, (width / 40) * densityFactor * widthFactor));
      particles = Array.from({ length: count }, makeParticle);
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
      // Lido a cada frame (não capturado uma vez no início do efeito) —
      // reagir na hora a uma troca de tema sem reiniciar a animação.
      const dark = document.documentElement.classList.contains("dark");
      // Mais visível no claro que no escuro: um traço translúcido soma
      // pouco contra um fundo quase branco, então precisa de bem mais
      // opacidade pra ficar igualmente perceptível.
      const baseOpacity = dark ? 0.22 : 0.4;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = dark ? "rgba(215, 224, 238, 1)" : "rgba(51, 65, 96, 1)";
      ctx.fillStyle = dark ? "rgba(225, 232, 244, 1)" : "rgba(51, 65, 96, 1)";
      ctx.lineCap = "round";
      for (const p of particles) {
        p.y += p.speed * dt;
        if (p.y > height + p.len) {
          p.y = -p.len;
          p.x = Math.random() * width;
        }
        ctx.globalAlpha = Math.min(1, baseOpacity * p.opacityFactor);
        if (mode === "snow") {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.len, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.len * 0.1, p.y + p.len);
          ctx.stroke();
        }
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
  }, [condition, precipitation]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Base sempre presente, cabeçalho inteiro — nunca deixa a tela
       * parecer um retângulo vazio/quebrado, nem em "unknown" nem antes
       * do primeiro clima carregar. Deliberadamente quase imperceptível
       * (a composição de verdade fica na faixa da direita, abaixo). */}
      <div
        className={`absolute inset-0 ${isDay ? "bg-foreground/[0.012]" : "bg-foreground/[0.03]"}`}
      />

      {/* Faixa de efeitos — só do lado direito/bordas, preservando uma
       * região limpa atrás da saudação (que ocupa a metade esquerda do
       * cabeçalho). */}
      <div className="absolute inset-y-0 right-0 w-[64%] sm:w-[58%] md:w-[52%]">
        <AtmosphereTint condition={condition} isDay={isDay} />
        {precipitation && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />}
      </div>
    </div>
  );
}

function isPrecipitation(c: WeatherCondition): boolean {
  return (
    c === "drizzle" || c === "rain" || c === "heavy-rain" || c === "thunderstorm" || c === "snow"
  );
}

/** Posições fixas (não `Math.random()` a cada render, senão as
 * "estrelas" pulariam de lugar a cada atualização de estado) das poucos
 * pontos discretos da noite de céu limpo. */
const NIGHT_DOTS = [
  { top: "18%", left: "12%", size: 2 },
  { top: "30%", left: "38%", size: 1.5 },
  { top: "14%", left: "58%", size: 1.5 },
  { top: "44%", left: "22%", size: 1.5 },
  { top: "24%", left: "78%", size: 2 },
  { top: "52%", left: "64%", size: 1.5 },
  { top: "62%", left: "40%", size: 1.5 },
];

/** Fundo/nuvens/neblina — tudo CSS (sem canvas, sem centenas de nós),
 * movimento lento e opcional via `motion-reduce:animate-none`. Cores só
 * dos tokens do design system (`bg-foreground`), nunca ilustração
 * literal de nuvem. Escopada à faixa direita definida pelo componente
 * pai — todo `absolute` aqui é relativo a essa faixa, não ao cabeçalho
 * inteiro. */
function AtmosphereTint({ condition, isDay }: { condition: WeatherCondition; isDay: boolean }) {
  // "unknown" não precisa de tratamento próprio — a base neutra do
  // componente pai (sempre presente) já cobre esse caso.
  if (condition === "unknown") return null;

  if (condition === "clear") {
    if (!isDay) {
      // Céu limpo à noite: fundo mais profundo + poucos pontos
      // discretos, estáticos (não depende de movimento pra comunicar
      // nada).
      return (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-foreground/[0.09] via-transparent to-transparent" />
          {NIGHT_DOTS.map((d, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-foreground/25"
              style={{ top: d.top, left: d.left, width: d.size, height: d.size }}
            />
          ))}
        </>
      );
    }
    // Céu limpo de dia: luminosidade neutra e suave.
    return (
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-foreground/[0.045] via-transparent to-transparent" />
    );
  }

  if (condition === "partly-cloudy" || condition === "cloudy") {
    // Duas classes estáticas completas (não interpoladas) por opção —
    // necessário pro scanner do Tailwind conseguir gerar as classes de
    // opacidade arbitrária em build; um template string com a
    // intensidade interpolada dentro do valor nunca seria reconhecido.
    const blobClass = condition === "cloudy" ? "bg-foreground/[0.06]" : "bg-foreground/[0.04]";
    return (
      <>
        <div
          className={`absolute -top-[20%] left-[5%] h-[120%] w-2/3 rounded-full blur-3xl motion-reduce:animate-none animate-[weather-drift_60s_linear_infinite] ${blobClass}`}
        />
        <div
          className={`absolute -top-[10%] right-[-10%] h-[110%] w-2/3 rounded-full blur-3xl motion-reduce:animate-none animate-[weather-drift-reverse_75s_linear_infinite] ${blobClass}`}
        />
        {/* Áreas limpas entre os volumes (item 4: "volumes suaves com
         * áreas limpas") — só no parcialmente nublado, pra distingui-lo
         * visualmente do nublado fechado. */}
        {condition === "partly-cloudy" && (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-transparent via-transparent to-foreground/[0.02]" />
        )}
      </>
    );
  }

  if (condition === "fog") {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-y-0 -left-1/3 w-2/3 bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent motion-reduce:animate-none animate-[weather-drift_40s_linear_infinite]" />
        <div className="absolute inset-y-0 -right-1/3 w-2/3 bg-gradient-to-l from-transparent via-foreground/[0.05] to-transparent motion-reduce:animate-none animate-[weather-drift-reverse_50s_linear_infinite]" />
      </div>
    );
  }

  // Precipitação (garoa/chuva/chuva forte/tempestade/neve): mantém só um
  // tom neutro por trás das gotas/flocos desenhados no canvas, sem
  // escurecer nem esconder o conteúdo.
  return <div className="absolute inset-0 bg-foreground/[0.025]" />;
}
