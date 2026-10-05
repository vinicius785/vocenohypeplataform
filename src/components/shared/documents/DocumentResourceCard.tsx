import { useState } from "react";
import { Copy, ExternalLink, Download, MoreHorizontal, Pencil, Pin, PinOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SOURCE_LABEL, type DocumentResource } from "@/lib/document-resources";
import { SOURCE_ICON, openDocumentResource } from "./document-resource-ui";

/** Card da galeria de documentos: tile com o ícone da origem + título + metadados + ações.
 * Só metadados — o conteúdo do documento nunca é carregado para montar a grade. */
export function DocumentResourceCard({
  doc,
  categoryLabel,
  canEdit,
  canPin,
  onEdit,
  onTogglePin,
  onDelete,
}: {
  doc: DocumentResource;
  categoryLabel?: string;
  canEdit: boolean;
  canPin: boolean;
  onEdit: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const Icon = SOURCE_ICON[doc.sourceType];
  const isLink = doc.kind === "link";
  const meta = [SOURCE_LABEL[doc.sourceType], categoryLabel].filter(Boolean).join(" · ");

  const copyLink = () => {
    void navigator.clipboard.writeText(doc.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <article
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-colors",
        "hover:border-foreground/25 focus-within:border-foreground/25",
      )}
    >
      <button
        type="button"
        onClick={() => openDocumentResource(doc)}
        aria-label={isLink ? `Abrir ${doc.title}` : `Baixar ${doc.title}`}
        className="flex min-w-0 flex-1 flex-col gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="flex h-20 w-full items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors group-hover:bg-muted">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </span>
        <span className="min-w-0 space-y-0.5">
          <span className="flex items-start gap-1">
            {doc.pinned && (
              <Pin className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" aria-label="Fixado" />
            )}
            <span
              title={doc.title}
              className="line-clamp-2 break-words text-sm font-medium leading-snug text-foreground"
            >
              {doc.title}
            </span>
          </span>
          <span className="block truncate text-xs text-text-secondary">
            {copied ? "Link copiado!" : meta}
          </span>
        </span>
      </button>

      <div className="absolute right-2 top-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Mais ações: ${doc.title}`}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand group-hover:opacity-100 data-[state=open]:opacity-100 max-sm:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => openDocumentResource(doc)}>
              {isLink ? (
                <>
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" /> Baixar
                </>
              )}
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </DropdownMenuItem>
            )}
            {canPin && (
              <DropdownMenuItem onSelect={onTogglePin}>
                {doc.pinned ? (
                  <>
                    <PinOff className="h-3.5 w-3.5" /> Desafixar
                  </>
                ) : (
                  <>
                    <Pin className="h-3.5 w-3.5" /> Fixar
                  </>
                )}
              </DropdownMenuItem>
            )}
            {isLink && (
              <DropdownMenuItem onSelect={copyLink}>
                <Copy className="h-3.5 w-3.5" /> Copiar link
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <X className="h-3.5 w-3.5" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
