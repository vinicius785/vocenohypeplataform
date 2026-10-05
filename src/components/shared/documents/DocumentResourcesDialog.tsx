import { FolderOpen } from "lucide-react";
import { CampaignToolShell } from "@/components/campanhas/tools/CampaignToolShell";
import { DocumentResourcesPanel } from "./DocumentResourcesPanel";
import type { ComponentProps } from "react";

/** Contêiner ÚNICO do recurso Documentos: o mesmo shell (tamanho, cabeçalho, "Voltar para…") nos
 * três contextos, só mudam nome do contexto e a descrição. */
export function DocumentResourcesDialog({
  open,
  onOpenChange,
  contextName,
  backTo,
  description,
  ...panel
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nome exibido no "Voltar para …" (ex.: nome da campanha/projeto, "Comercial"). */
  contextName: string;
  backTo: string;
  /** Texto contextual do cabeçalho, ex.: "Materiais e documentos da campanha". */
  description: string;
} & ComponentProps<typeof DocumentResourcesPanel>) {
  return (
    <CampaignToolShell
      open={open}
      onOpenChange={onOpenChange}
      size="medium"
      campanhaNome={contextName}
      backTo={backTo}
      icon={FolderOpen}
      title="Documentos"
      description={description}
    >
      <DocumentResourcesPanel {...panel} />
    </CampaignToolShell>
  );
}
