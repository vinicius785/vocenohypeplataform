/** Cabeçalho de etapa reutilizado pelos formulários passo-a-passo de
 * Objetivo e Indicador — barra de progresso + título da etapa + uma frase
 * explicando o que ela pede e por quê. */
export function StepHeader({
  step,
  total,
  title,
  description,
}: {
  step: number;
  total: number;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= step ? "bg-foreground" : "bg-muted"}`}
          />
        ))}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Etapa {step + 1} de {total} · {title}
        </p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
