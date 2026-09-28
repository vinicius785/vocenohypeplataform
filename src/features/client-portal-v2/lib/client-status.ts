import type { ClientCampaignStatus } from "../types/attention";

/**
 * Camada de apresentação — status operacional que o CLIENTE pode ver,
 * nunca uma classificação de saúde/risco interna ("Em risco"/"Crítica"/
 * "Atrasada"/score de risco — essas pertencem só à gestão interna da
 * equipe, nunca ao Portal do Cliente). Cor segue a mesma regra em todo o
 * portal: vermelho é reservado pra erro real de interface, nunca pra
 * "saúde" de uma campanha; âmbar só quando existe uma ação concreta do
 * cliente (ver `deriveAttentionItems`, que já é a única fonte de
 * pendência real).
 */
export const CLIENT_CAMPAIGN_STATUS_LABEL: Record<ClientCampaignStatus, string> = {
  planned: "Planejada",
  in_progress: "Em andamento",
  completed: "Concluída",
};

export const CLIENT_CAMPAIGN_STATUS_TONE: Record<
  ClientCampaignStatus,
  "secondary" | "brand" | "success"
> = {
  planned: "secondary",
  in_progress: "brand",
  completed: "success",
};

export function getClientFacingStatus(campaign: { status: ClientCampaignStatus }): {
  label: string;
  tone: "secondary" | "brand" | "success";
} {
  return {
    label: CLIENT_CAMPAIGN_STATUS_LABEL[campaign.status],
    tone: CLIENT_CAMPAIGN_STATUS_TONE[campaign.status],
  };
}
