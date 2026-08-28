/** Linha "Esperado hoje: X% · ↓/↑ Yp.p. abaixo/acima do esperado" —
 * compara progresso real com `progressoEsperado` (metas-engine.ts).
 * Compartilhada entre `ObjetivoSummaryCard` e `ObjetivoPage` pra não
 * duplicar a formatação/cor. Não renderiza nada quando falta progresso
 * real ou esperado (nunca inventa o valor). */
export function ExpectedProgressLine({
  progresso,
  esperado,
}: {
  progresso: number | null;
  esperado: number | null;
}) {
  if (progresso == null || esperado == null) return null;
  const diff = Math.round(progresso - esperado);
  const esperadoRounded = Math.round(esperado);

  if (diff === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Esperado hoje: {esperadoRounded}% · no ritmo esperado
      </p>
    );
  }

  const acima = diff > 0;
  return (
    <p
      className={`text-xs ${acima ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
    >
      Esperado hoje: {esperadoRounded}%{" "}
      <span className="text-muted-foreground">
        · {acima ? "↑" : "↓"} {Math.abs(diff)} p.p. {acima ? "acima" : "abaixo"} do esperado
      </span>
    </p>
  );
}
