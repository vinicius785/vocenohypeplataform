import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentsTool } from "@/components/campanhas/tools/DocumentsTool";
import {
  initComercialDocsSync,
  loadComercialDocs,
  onComercialDocsChange,
  saveComercialDocs,
} from "@/lib/comercial-docs";

/** Anexos ficam inline no registro — acima disso, usar link. */
const MAX_ANEXO_BYTES = 5 * 1024 * 1024;

/** Botão "Recursos" do Comercial — mesmo menu/ferramenta das Campanhas
 * (`DocumentsTool`), com os documentos do Comercial. */
export function ComercialRecursosMenu() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void initComercialDocsSync();
  }, []);
  const docs = useSyncExternalStore(onComercialDocsChange, loadComercialDocs, loadComercialDocs);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="comfortable" aria-haspopup="menu">
            Recursos
            <ChevronDown className="h-3 w-3 text-text-secondary" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <FolderOpen className="h-3.5 w-3.5 text-text-secondary" />
            <span className="min-w-0 flex-1 truncate">Documentos</span>
            {docs.length > 0 && (
              <span className="text-xs tabular-nums text-text-secondary">{docs.length}</span>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DocumentsTool
        open={open}
        onOpenChange={setOpen}
        campanhaNome="Comercial"
        backTo="a página"
        description="Materiais de apoio comercial."
        contextLabel="ao Comercial"
        emptyTitle="Nenhum documento ainda."
        emptyDescription="Adicione materiais de apoio comercial."
        maxFileBytes={MAX_ANEXO_BYTES}
        docs={docs}
        onChange={saveComercialDocs}
      />
    </>
  );
}
