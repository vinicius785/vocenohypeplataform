import { createFileRoute, Link } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { usePortalData } from "@/components/portal/portal-context";
import { t } from "@/lib/portal-i18n";

export const Route = createFileRoute("/portal/$token/campanhas/")({
  component: PortalCampanhasIndexPage,
});

/**
 * `/portal/$token/campanhas` — hoje o portal não tem uma tela "todas as
 * campanhas" separada da sidebar (a lista já vive lá). Etapa 2 entrega só
 * uma lista mínima aqui pra a URL existir e ser navegável; o conteúdo real
 * desta página (se vier a precisar de mais que a sidebar já mostra) é
 * decisão de etapa futura, não desta.
 */
function PortalCampanhasIndexPage() {
  const { token, data, lang } = usePortalData();

  if (data.campanhas.length === 0) {
    return (
      <PageContainer>
        <EmptyState icon={<Megaphone className="h-5 w-5" />} title={t(lang, "navNoCampanhas")} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {data.campanhas.map((c) => (
          <Link
            key={c.id}
            to="/portal/$token/campanhas/$campanhaId"
            params={{ token, campanhaId: c.id }}
            className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            {c.nome}
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
