import { Info } from "lucide-react";
import { CampaignSection } from "./CampaignSection";
import type { PublicCampanha } from "@/lib/portal-types";

/** Informações da campanha — só os campos que a plataforma realmente
 * guarda no nível da campanha hoje (início, prazo, recorrência). Não há
 * campo de objetivo/descrição/briefing na campanha em si (briefing é por
 * influenciador) — não inventamos texto pra preencher o espaço; a seção
 * só aparece quando há pelo menos um dado real. */
export function ClientCampaignInfo({ campaign }: { campaign: PublicCampanha }) {
  const items: { label: string; value: string }[] = [];
  if (campaign.dataInicio) {
    items.push({
      label: "Início",
      value: new Date(campaign.dataInicio).toLocaleDateString("pt-BR"),
    });
  }
  if (campaign.isRecorrente) {
    items.push({
      label: "Recorrência",
      value: campaign.recorrenteInicio
        ? `Mensal, desde ${new Date(campaign.recorrenteInicio).toLocaleDateString("pt-BR")}`
        : "Mensal",
    });
  } else if (campaign.prazo) {
    items.push({ label: "Prazo", value: new Date(campaign.prazo).toLocaleDateString("pt-BR") });
  }

  if (items.length === 0) return null;

  return (
    <CampaignSection icon={<Info className="h-4 w-4" />} title="Informações da campanha">
      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-card p-4 dark:shadow-none sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xs text-text-secondary">{item.label}</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{item.value}</p>
          </div>
        ))}
      </div>
    </CampaignSection>
  );
}
