import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LOAD_LEVEL_LABEL, type LoadAssessment } from "./member-metrics";

const TONE: Record<LoadAssessment["level"], string> = {
  normal: "border-border text-text-secondary",
  atencao: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  alta: "border-destructive/40 text-destructive",
};

/** Classificação visual da carga — cor só no contorno/texto, nunca fundo
 * forte; o motivo SEMPRE acompanha (tooltip aqui, texto corrido no perfil). */
export function LoadBadge({
  load,
  withTooltip = true,
}: {
  load: LoadAssessment;
  withTooltip?: boolean;
}) {
  const badge = (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TONE[load.level]}`}
    >
      {LOAD_LEVEL_LABEL[load.level]}
    </span>
  );
  if (!withTooltip) return badge;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`Carga ${LOAD_LEVEL_LABEL[load.level]}: ${load.reasons.join("; ")}`}
        >
          {badge}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] text-xs">
        {load.reasons.join(" · ")}
      </TooltipContent>
    </Tooltip>
  );
}
