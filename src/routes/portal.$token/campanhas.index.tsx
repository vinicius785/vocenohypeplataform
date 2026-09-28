import { createFileRoute, Link } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { usePortalData } from "@/components/portal/portal-context";
import { pendingReason } from "@/components/portal/portal-widgets";
import { t } from "@/lib/portal-i18n";

export const Route = createFileRoute("/portal/$token/campanhas/")({
  component: PortalCampanhasIndexPage,
});

/**
 * `/portal/$token/campanhas` — destino do "Ver todas" da sidebar
 * (Seção 11 do pedido: precisa de `PageHeader` + cards completos, não
 * uma lista mínima de texto). `data.campanhas` já vem pré-filtrada pelo
 * servidor pra só "active"/"completed" (nunca "negotiation"/"archived" —
 * ver `buildClienteLinkData`) — mostra as duas juntas, com selo pra
 * diferenciar a concluída; a sidebar já esconde a concluída por padrão.
 */
function PortalCampanhasIndexPage() {
  const { token, data, lang } = usePortalData();

  if (data.campanhas.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Campanhas" />
        <div className="mt-6">
          <EmptyState icon={<Megaphone className="h-5 w-5" />} title={t(lang, "navNoCampanhas")} />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Campanhas" />
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.campanhas.map((c) => {
          const planejado = c.planejado || 0;
          const publicadas = c.influencers.reduce(
            (s, i) => s + i.entregas.filter((e) => e.status === "publicado").length,
            0,
          );
          const proximaEtapa =
            c.influencers.map((i) => pendingReason(i, lang)).find((r) => !!r) ?? null;
          return (
            <div
              key={c.id}
              className="group relative rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20"
            >
              <Link
                to="/portal/$token/campanhas/$campanhaId"
                params={{ token, campanhaId: c.id }}
                className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                aria-label={`Abrir campanha ${c.nome}`}
              />
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-semibold text-foreground">{c.nome}</p>
                {c.status === "completed" && (
                  <Badge variant="secondary" className="shrink-0">
                    Concluída
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(lang, "influenciadoresCount", { n: c.influencers.length })}
              </p>
              {planejado > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {publicadas}/{planejado} entregas publicadas
                </p>
              )}
              {proximaEtapa && (
                <p className="mt-2 truncate text-xs font-medium text-amber-700 dark:text-amber-400">
                  {proximaEtapa}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </PageContainer>
  );
}
