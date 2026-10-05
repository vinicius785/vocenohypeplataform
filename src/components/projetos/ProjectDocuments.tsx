import { DocumentResourcesDialog } from "@/components/shared/documents/DocumentResourcesDialog";
import { DocumentResourcesPanel } from "@/components/shared/documents/DocumentResourcesPanel";
import type { DocumentInput } from "@/lib/document-resources";
import {
  PROJECT_DOC_CATEGORIES,
  applyProjectDocEdit,
  projectDocFromInput,
  projectDocToResource,
} from "@/lib/project-doc-resources";
import type { Project } from "@/lib/projetos";

type PanelProps = {
  project: Project;
  update: (p: Partial<Project>) => void;
};

function useProjectDocumentProps({ project, update }: PanelProps) {
  const docs = project.docs ?? [];
  return {
    documents: docs.map(projectDocToResource),
    contextLabel: "ao projeto",
    emptyTitle: "Nenhum documento ainda.",
    emptyDescription: "Adicione materiais de referência para este projeto.",
    categories: PROJECT_DOC_CATEGORIES,
    allowPin: true,
    onCreate: (input: DocumentInput) => update({ docs: [...docs, projectDocFromInput(input)] }),
    onUpdate: (id: string, input: DocumentInput) =>
      update({ docs: docs.map((d) => (d.id === id ? applyProjectDocEdit(d, input) : d)) }),
    onDelete: (id: string) => update({ docs: docs.filter((d) => d.id !== id) }),
    onTogglePin: (id: string) =>
      update({ docs: docs.map((d) => (d.id === id ? { ...d, isPinned: !d.isPinned } : d)) }),
  };
}

/** Painel inline (seção "documentos" do projeto). */
export function ProjectDocumentsPanel(props: PanelProps) {
  return <DocumentResourcesPanel {...useProjectDocumentProps(props)} />;
}

/** Diálogo aberto pelo menu Recursos do projeto. */
export function ProjectDocumentsDialog({
  open,
  onOpenChange,
  ...props
}: PanelProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <DocumentResourcesDialog
      open={open}
      onOpenChange={onOpenChange}
      contextName={props.project.name}
      backTo="o projeto"
      description="Links e materiais de referência do projeto."
      {...useProjectDocumentProps(props)}
    />
  );
}
