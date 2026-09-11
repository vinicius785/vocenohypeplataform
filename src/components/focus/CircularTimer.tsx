/** Cronômetro circular com progresso real (item 15) — SVG puro, sem lib
 * externa. `progress` de 0 a 1. Compreensível por leitor de tela via
 * `role="timer"`/`aria-label` no texto central (item 16: não anuncia a
 * cada segundo — quem usa isso decide quando atualizar o `aria-label`,
 * este componente só recebe o texto já formatado). Respeita
 * `prefers-reduced-motion` via `motion-reduce:transition-none` na
 * transição do traço. */
export function CircularTimer({
  progress,
  label,
  timeLabel,
  size = 280,
  tone = "brand",
}: {
  progress: number;
  label: string;
  timeLabel: string;
  size?: number;
  tone?: "brand" | "success" | "danger";
}) {
  const strokeWidth = size * 0.035;
  const radius = size / 2 - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));
  const dashOffset = circumference * (1 - clamped);

  const strokeClass =
    tone === "success" ? "stroke-success" : tone === "danger" ? "stroke-danger" : "stroke-brand";

  return (
    <div
      role="timer"
      aria-label={`${label}: ${timeLabel} restantes`}
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={`motion-reduce:transition-none transition-[stroke-dashoffset] duration-300 ease-linear ${strokeClass}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
        <span className="text-4xl font-semibold tabular-nums tracking-tight text-white md:text-5xl">
          {timeLabel}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-white/50">{label}</span>
      </div>
    </div>
  );
}
