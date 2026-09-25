import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/shared/PageContainer";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import {
  deriveApprovalItems,
  deriveAttentionItems,
  deriveCampaignSummaries,
  deriveContentItems,
  deriveRecentActivity,
} from "../lib/derive";
import { ClientHomeHeader, HeaderStatCell } from "../components/ClientHomeHeader";
import { ClientAttentionList } from "../components/ClientAttentionList";
import { ClientCampaignProgressList } from "../components/ClientCampaignProgressList";
import { ClientActivityList } from "../components/ClientActivityList";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

function useFirstName(): string {
  const { data: session } = useQuery({
    queryKey: ["portal-v2-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 5 * 60 * 1000,
  });
  const name = (session?.user_metadata?.full_name as string | undefined) ?? session?.email ?? "";
  return name.split(" ")[0] || name || "";
}

/**
 * Início da V2 — mesma estrutura visual/densidade da Início do time
 * (`InicioDashboard.tsx`): cabeçalho com avatar+saudação+data e faixa de
 * indicadores embutida, depois seções em `Card`/`CardHeader`
 * compartilhados, grid de duas linhas. Nenhum dado novo: os quatro
 * indicadores e as três seções abaixo vêm exatamente do que a V2 já
 * calculava (`deriveAttentionItems`/`deriveCampaignSummaries`/
 * `deriveContentItems`/`deriveRecentActivity`).
 */
export function InicioV2() {
  const { data } = usePortalSessionData();
  const navigate = useNavigate();
  const firstName = useFirstName();
  const now = new Date();

  const attentionItems = useMemo(() => deriveAttentionItems(data), [data]);
  const approvalCount = useMemo(() => deriveApprovalItems(data).length, [data]);
  const firstAttentionHref = attentionItems[0]?.href;
  const campaigns = useMemo(() => deriveCampaignSummaries(data), [data]);
  const activeCampaigns = campaigns.filter((c) => c.status !== "completed");
  const activity = useMemo(() => deriveRecentActivity(data), [data]);
  const contentCount = useMemo(() => deriveContentItems(data).length, [data]);
  const reportCount = useMemo(
    () => data.campanhas.reduce((sum, c) => sum + c.relatorios.length, 0),
    [data],
  );

  return (
    <PageContainer className="space-y-6 md:space-y-8">
      <ClientHomeHeader
        name={firstName}
        greeting={getGreeting(now.getHours())}
        dateLabel={`${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`}
        companyName={data.clienteNome}
        stats={
          <>
            <HeaderStatCell
              label="Pendências"
              value={approvalCount}
              tone="warning"
              onClick={firstAttentionHref ? () => navigate({ to: firstAttentionHref }) : undefined}
            />
            <HeaderStatCell
              label="Campanhas ativas"
              value={activeCampaigns.length}
              onClick={() => navigate({ to: "/portal-v2/campanhas" })}
            />
            <HeaderStatCell
              label="Conteúdos"
              value={contentCount}
              onClick={() => navigate({ to: "/portal-v2/conteudos" })}
            />
            <HeaderStatCell
              label="Relatórios"
              value={reportCount}
              onClick={() => navigate({ to: "/portal-v2/relatorios" })}
            />
          </>
        }
      />

      <ClientAttentionList items={attentionItems} />

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        <ClientCampaignProgressList campaigns={activeCampaigns} />
        <ClientActivityList entries={activity} />
      </div>
    </PageContainer>
  );
}
