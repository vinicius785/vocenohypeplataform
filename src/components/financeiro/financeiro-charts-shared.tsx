/** Números grandes abreviados pro eixo/rótulo do gráfico — o valor
 * completo sempre aparece no tooltip, isso aqui é só pra não lotar o
 * espaço com "R$ 28.500,00" por extra. */
export function abbreviateBRL(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000)
    return `${sign}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000)
    return `${sign}R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${sign}R$ ${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

export function ChartEmptyState({ message }: { message: string }) {
  return (
    <p className="flex h-full min-h-[160px] items-center justify-center text-center text-xs text-muted-foreground">
      {message}
    </p>
  );
}

export function ChartLoadingState() {
  return (
    <div className="flex h-full min-h-[160px] animate-pulse items-center justify-center rounded-md bg-muted/30 text-xs text-muted-foreground">
      Carregando...
    </div>
  );
}

export function ChartCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}
