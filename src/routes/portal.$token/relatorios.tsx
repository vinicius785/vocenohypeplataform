import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePortalData } from "@/components/portal/portal-context";
import { fmtDate } from "@/components/portal/portal-widgets";
import { mesLabel } from "@/lib/relatorio-mensal";
import { t } from "@/lib/portal-i18n";

export const Route = createFileRoute("/portal/$token/relatorios")({
  component: PortalRelatoriosPage,
});

/**
 * `/portal/$token/relatorios` — agregado read-only de todos os relatórios
 * mensais de todas as campanhas, cada um linkando pra campanha (onde já
 * existe visualização inline do PDF + fluxo de NPS, hoje sem duplicar).
 * Etapa 2: só a URL/lista mínima; padronização de nomes de ação
 * ("Ver métricas"/"Visualizar relatório"/"Baixar relatório") é Etapa 7.
 */
function PortalRelatoriosPage() {
  const { token, data, lang } = usePortalData();
  const all = data.campanhas.flatMap((c) =>
    c.relatorios.map((r) => ({ campanhaId: c.id, campanhaNome: c.nome, relatorio: r })),
  );

  if (all.length === 0) {
    return <EmptyState icon={<BarChart3 className="h-5 w-5" />} title={t(lang, "semConteudo")} />;
  }

  return (
    <div className="space-y-2.5">
      {all
        .sort((a, b) => b.relatorio.mes.localeCompare(a.relatorio.mes))
        .map(({ campanhaId, campanhaNome, relatorio }) => (
          <Link
            key={relatorio.id}
            to="/portal/$token/campanhas/$campanhaId"
            params={{ token, campanhaId }}
            search={{ relatorio: relatorio.id, tab: "relatorios" }}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {mesLabel(relatorio.mes)} · {campanhaNome}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Enviado em {fmtDate(relatorio.uploadedAt.slice(0, 10))}
              </p>
            </div>
          </Link>
        ))}
    </div>
  );
}
