import { ArrowLeft, Megaphone, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Cliente } from "@/lib/clientes-store";
import { cn } from "@/lib/utils";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { ClienteLogo } from "./ClienteLogo";
import { ClienteStatusControl } from "./ClienteStatusControl";
import { CLIENTE_STATUS_LABEL, clienteStatus } from "./cliente-ui";
import { clienteSubtitle } from "./cliente-overview";

/** Cabeçalho da Central do Cliente: identidade + status à esquerda, ações à direita. Sem moldura. */
export function ClienteHeader({
  cliente,
  canManage,
  isAdmin,
  canCreateCampanha,
  onBack,
  onNovaCampanha,
  onEdit,
  onDelete,
  onStatusApply,
}: {
  cliente: Cliente;
  canManage: boolean;
  isAdmin: boolean;
  canCreateCampanha: boolean;
  onBack: () => void;
  onNovaCampanha: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusApply: (patch: Partial<Cliente>) => void;
}) {
  const subtitle = clienteSubtitle(cliente);
  return (
    <header className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Clientes
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <ClienteLogo photo={cliente.photo} empresa={cliente.empresa} size="lg" />
          <div className="min-w-0 space-y-1.5">
            <p
              role="heading"
              aria-level={1}
              className={cn("truncate", TYPOGRAPHY.pageHeading, "text-foreground")}
            >
              {cliente.empresa}
            </p>
            {subtitle && <p className="truncate text-sm text-text-secondary">{subtitle}</p>}
            <ClienteStatusControl
              cliente={cliente}
              canChange={canManage}
              canArchiveOrRestore={isAdmin}
              onApply={onStatusApply}
              showHistory={false}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:shrink-0">
          <Button
            variant="primary"
            size="comfortable"
            className="flex-1 gap-1.5 sm:flex-none"
            disabled={!canCreateCampanha}
            title={
              canCreateCampanha
                ? undefined
                : `Cliente ${CLIENTE_STATUS_LABEL[clienteStatus(cliente)]} não permite novas campanhas.`
            }
            onClick={onNovaCampanha}
          >
            <Megaphone className="h-4 w-4" aria-hidden="true" /> Nova campanha
          </Button>
          <Button
            variant="outline"
            size="comfortable"
            className="flex-1 gap-1.5 sm:flex-none"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Mais ações"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir cliente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
