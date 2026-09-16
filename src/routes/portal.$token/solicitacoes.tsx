import { createFileRoute } from "@tanstack/react-router";
import { MessageSquareText } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { PortalDemandButton } from "@/components/PortalDemandButton";
import { usePortalData } from "@/components/portal/portal-context";
import { t } from "@/lib/portal-i18n";

export const Route = createFileRoute("/portal/$token/solicitacoes")({
  component: PortalSolicitacoesPage,
});

/**
 * `/portal/$token/solicitacoes` — `submitClientDemand` (o backend real por
 * trás do botão "Nova solicitação") é sempre escopado a UMA campanha (vira
 * uma tarefa marcada "Cliente" no board interno daquela campanha — ver
 * auditoria da Etapa 1). Não existe hoje um conceito de "solicitação sem
 * campanha", então esta página lista as campanhas e reusa o mesmo
 * `PortalDemandButton` de sempre por campanha, em vez de inventar um
 * formulário genérico sem campanha associada. Histórico de solicitações
 * enviadas pelo cliente também não existe hoje (fluxo é fire-and-forget) —
 * não inventado aqui.
 */
function PortalSolicitacoesPage() {
  const { token, data, lang } = usePortalData();

  if (data.campanhas.length === 0) {
    return (
      <PageContainer>
        <EmptyState
          icon={<MessageSquareText className="h-5 w-5" />}
          title={t(lang, "navNoCampanhas")}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-2.5">
      {data.campanhas.map((c) => (
        <div
          key={c.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
        >
          <p className="truncate text-sm font-medium text-foreground">{c.nome}</p>
          <PortalDemandButton token={token} campanhaId={c.id} lang={lang} />
        </div>
      ))}
    </PageContainer>
  );
}
