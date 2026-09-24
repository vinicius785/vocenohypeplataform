import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import { SummaryStat } from "@/components/shared/SummaryStat";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { deriveCampaignSummaries } from "../lib/derive";
import { ClientCampaignCard } from "../components/campaigns/ClientCampaignCard";
import {
  ClientCampaignToolbar,
  type CampaignStatusFilter,
} from "../components/campaigns/ClientCampaignToolbar";
import type { CampaignSummary } from "../types/attention";

function statusOf(campaign: CampaignSummary): Exclude<CampaignStatusFilter, "todas"> {
  if (campaign.stageLabel === "Concluída") return "encerradas";
  if (campaign.stageLabel === "Planejamento") return "planejadas";
  return "ativas";
}

/**
 * Listagem de Campanhas da V2 — cabeçalho simples (sem repetir o nome do
 * cliente, já identificado na sidebar), faixa de resumo única
 * (`SummaryStat`, mesmo componente compartilhado que a Início do time
 * usa em Campanhas/Projeto), toolbar única (busca + segmentado de
 * status) e grid de cards completos. Nenhuma nova consulta: os números
 * vêm do mesmo `deriveCampaignSummaries` já usado na Início da V2.
 */
export function CampanhasV2() {
  const { data } = usePortalSessionData();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CampaignStatusFilter>("todas");

  const campaigns = useMemo(() => deriveCampaignSummaries(data), [data]);

  const counts = useMemo(() => {
    const ativas = campaigns.filter((c) => statusOf(c) === "ativas").length;
    const planejadas = campaigns.filter((c) => statusOf(c) === "planejadas").length;
    const encerradas = campaigns.filter((c) => statusOf(c) === "encerradas").length;
    const atencao = campaigns.filter((c) => c.pendingCount > 0).length;
    return { ativas, planejadas, encerradas, atencao };
  }, [campaigns]);

  const filtered = campaigns.filter((c) => {
    if (status !== "todas" && statusOf(c) !== status) return false;
    if (query && !c.nome.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const hasActiveFilter = query.trim().length > 0 || status !== "todas";

  return (
    <PageContainer className="space-y-6">
      <div>
        <p className="text-[28px] font-bold leading-tight tracking-tight text-foreground md:text-[32px]">
          Campanhas
        </p>
        <p className="mt-1.5 text-sm text-text-secondary">
          Acompanhe o andamento das campanhas da sua empresa.
        </p>
      </div>

      {campaigns.length > 0 && (
        <div className="flex flex-wrap rounded-2xl bg-card dark:shadow-none">
          <SummaryStat label="Ativas" value={counts.ativas.toString()} />
          <SummaryStat label="Planejadas" value={counts.planejadas.toString()} />
          <SummaryStat label="Encerradas" value={counts.encerradas.toString()} />
          <SummaryStat
            label="Precisam de atenção"
            value={counts.atencao.toString()}
            tone={counts.atencao > 0 ? "warning" : undefined}
          />
        </div>
      )}

      {campaigns.length > 0 && (
        <ClientCampaignToolbar
          query={query}
          onQueryChange={setQuery}
          status={status}
          onStatusChange={setStatus}
        />
      )}

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-5 w-5" />}
          title="Nenhuma campanha vinculada ainda"
          description="Assim que uma campanha for criada para sua empresa, ela aparece aqui."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-5 w-5" />}
          title="Nenhuma campanha encontrada"
          description={
            hasActiveFilter ? "Ajuste a busca ou o filtro para ver outras campanhas." : undefined
          }
          secondaryAction={
            hasActiveFilter
              ? {
                  label: "Limpar filtros",
                  onClick: () => {
                    setQuery("");
                    setStatus("todas");
                  },
                }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <ClientCampaignCard
              key={c.id}
              campaign={c}
              clientLogo={data.clienteFoto}
              clientName={data.clienteNome}
              onOpen={() =>
                navigate({ to: "/portal-v2/campanhas/$campanhaId", params: { campanhaId: c.id } })
              }
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
