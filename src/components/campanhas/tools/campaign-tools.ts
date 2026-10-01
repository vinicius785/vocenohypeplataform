import type { ComponentType } from "react";
import { CalendarClock, FileBarChart, FolderOpen, Star } from "lucide-react";
import type { CampaignToolSize } from "./CampaignToolShell";

export type CampaignToolKey = "documentos" | "calendario" | "relatorioMensal" | "nps";

/** Identidade única de cada ferramenta — usada pelo card (descoberta) e
 * pelo header do shell, pra nome/ícone/descrição nunca divergirem. */
export const CAMPAIGN_TOOLS: Record<
  CampaignToolKey,
  {
    label: string;
    description: string;
    icon: ComponentType<{ className?: string }>;
    size: CampaignToolSize;
  }
> = {
  documentos: {
    label: "Documentos",
    description: "Arquivos, anexos e links de referência",
    icon: FolderOpen,
    size: "compact",
  },
  calendario: {
    label: "Calendário",
    description: "Cronograma e marcos da campanha",
    icon: CalendarClock,
    size: "large",
  },
  relatorioMensal: {
    label: "Relatórios mensais",
    description: "PDFs de resultados enviados ao cliente",
    icon: FileBarChart,
    size: "medium",
  },
  nps: {
    label: "NPS",
    description: "Avaliações e percepção do cliente",
    icon: Star,
    size: "medium",
  },
};
