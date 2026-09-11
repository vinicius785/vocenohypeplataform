import { TYPOGRAPHY } from "@/lib/design-tokens";
import { SkeletonMetric } from "@/components/shared/SkeletonPatterns";
import { EmptyState } from "@/components/shared/EmptyState";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  return <EmptyState compact icon={<BarChart3 className="h-5 w-5" />} title={message} />;
}

export function ChartLoadingState() {
  return <SkeletonMetric />;
}

/** Card com raio generoso (Etapa 5 — linguagem visual do conceito bento
 * aplicada de verdade) — cada gráfico/tabela do Financeiro vira sua
 * própria superfície, em vez de título solto direto na página. */
export function ChartCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // `flex h-full flex-col` (correção cirúrgica): quando este card está
    // dentro de uma célula de grid esticada (Resumo — gráfico ao lado da
    // coluna direita), ele passa a preencher a altura da linha em vez de
    // deixar um vazio abaixo do card. `h-full` só tem efeito quando o
    // ancestral já tem altura definida (grid `items-stretch`, o padrão);
    // nos outros consumidores (Relatórios/Campanhas, dentro de `space-y-6`
    // sem stretch) o ancestral é `auto`, então isso não muda nada lá.
    <div className="flex h-full flex-col rounded-[24px] bg-card p-5 dark:shadow-none md:p-6">
      <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[20px] font-semibold leading-tight text-foreground md:text-[22px]">
            {title}
          </h3>
          {description && <p className={cn(TYPOGRAPHY.caption, "mt-1")}>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
