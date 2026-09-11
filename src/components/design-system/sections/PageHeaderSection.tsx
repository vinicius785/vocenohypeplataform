import { Download } from "lucide-react";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { PageHeader } from "@/components/shared/PageHeader";

export function PageHeaderSection() {
  return (
    <section id="page-header" className="space-y-4">
      <h2 className={TYPOGRAPHY.sectionTitle}>PageHeader</h2>
      <p className={TYPOGRAPHY.bodySecondary}>
        Componente canônico (`components/shared/PageHeader.tsx`), promovido nesta rodada corretiva —
        mas nenhuma tela real importa ainda, não substitui `SectionHeader.tsx` até a migração. Sem
        prop de tabs: navegação, filtro e alternância de visualização são conceitos separados.
      </p>
      <div className="rounded-xl border border-border bg-card p-5 md:p-6">
        <PageHeader
          breadcrumb={["Financeiro", "Movimentações"]}
          title="Movimentações"
          description="Todos os lançamentos do período selecionado."
          primaryAction={{ label: "Novo lançamento", onClick: () => {} }}
          secondaryActions={[{ label: "Exportar", onClick: () => {} }]}
          searchPlaceholder="Buscar lançamento..."
          filters={
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground">
              <Download className="h-3 w-3" /> Este mês
            </span>
          }
          indicators={[
            { label: "Entradas", value: "R$ 42.900", tone: "success", delta: { value: 12 } },
            { label: "Saídas", value: "R$ 18.200", tone: "danger" },
            { label: "Resultado", value: "R$ 24.700", tone: "brand" },
            { label: "Saldo atual", value: null },
          ]}
        />
      </div>
    </section>
  );
}
