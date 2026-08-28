/** Linha curta comparando progresso real com o ritmo esperado
 * (`progressoEsperado`, metas-engine.ts) — só aparece quando a
 * comparação agrega. Compartilhada entre `ObjetivoSummaryCard` e
 * `ObjetivoPage` pra não duplicar formatação/cor. O valor "esperado"
 * numérico fica só no `title` (tooltip nativo), não precisa virar texto
 * sempre-visível pra a linha continuar curta. */
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

  // Início do período (esperado ainda ~0%): qualquer progresso já
  // pareceria "muito acima do ritmo", mas isso não é sinal nenhum tão
  // cedo — evita destacar artificialmente um "+20 p.p." como se fosse
  // uma conquista no dia 1.
  if (esperadoRounded <= 0 && diff > 0) return null;

  if (diff === 0) {
    return (
      <p className="text-xs text-muted-foreground" title={`Esperado hoje: ${esperadoRounded}%`}>
        No ritmo
      </p>
    );
  }

  const acima = diff > 0;
  return (
    <p
      className={`text-xs font-medium ${acima ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
      title={`Esperado hoje: ${esperadoRounded}%`}
    >
      {acima ? "↑" : "↓"} {Math.abs(diff)} p.p. {acima ? "acima" : "abaixo"} do ritmo
    </p>
  );
}
