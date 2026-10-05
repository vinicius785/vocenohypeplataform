import { DocumentResourcesDialog } from "@/components/shared/documents/DocumentResourcesDialog";
import {
  applyCampaignDocEdit,
  campaignDocFromInput,
  campaignDocToResource,
} from "@/lib/campaign-doc-resources";
import type { CampaignDoc } from "@/lib/campanha-scoped-store";

/** Documentos de Campanhas e do Comercial: usa a experiência ÚNICA de documentos
 * (`DocumentResourcesDialog`), com os dados `CampaignDoc` de cada contexto. Persistência e formato
 * dos dados não mudam — só a apresentação é a compartilhada. */
export function DocumentsTool({
  open,
  onOpenChange,
  campanhaNome,
  backTo = "a campanha",
  description = "Materiais e documentos da campanha.",
  contextLabel = "à campanha",
  emptyTitle = "Nenhum documento ainda.",
  emptyDescription = "Adicione materiais de referência para esta campanha.",
  maxFileBytes,
  docs,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaNome: string;
  /** Complemento de "Voltar para …" (Comercial: "a página"). */
  backTo?: string;
  description?: string;
  contextLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Tamanho máximo de anexo (os anexos ficam inline no registro). Sem limite se omitido. */
  maxFileBytes?: number;
  docs: CampaignDoc[];
  onChange: (next: CampaignDoc[]) => void;
}) {
  return (
    <DocumentResourcesDialog
      open={open}
      onOpenChange={onOpenChange}
      contextName={campanhaNome}
      backTo={backTo}
      description={description}
      contextLabel={contextLabel}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      allowFileUpload
      maxFileBytes={maxFileBytes}
      documents={docs.map(campaignDocToResource)}
      onCreate={(input) => onChange([...docs, campaignDocFromInput(input)])}
      onUpdate={(id, input) =>
        onChange(docs.map((d) => (d.id === id ? applyCampaignDocEdit(d, input) : d)))
      }
      onDelete={(id) => onChange(docs.filter((d) => d.id !== id))}
    />
  );
}
