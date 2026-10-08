import { ExternalLink, Eye, KeyRound, MoreVertical, Pencil, Trash2, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryIcon, ServiceBadge } from "./ServiceBadge";
import { safeExternalUrl, type Senha } from "./cofre-model";

/**
 * Cartão compacto de uma credencial. A senha NUNCA aparece aqui: só no detalhe (ou copiada pelo
 * menu). O cartão inteiro abre o detalhe; o menu `⋯` concentra as ações secundárias.
 */
export function SenhaTile({
  s,
  canCopySenha,
  onOpen,
  onEdit,
  onDelete,
  onCopyUsuario,
  onCopySenha,
}: {
  s: Senha;
  canCopySenha: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyUsuario: () => void;
  onCopySenha: () => void;
}) {
  const site = safeExternalUrl(s.url);
  return (
    <li className="relative">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        aria-label={`Abrir credencial ${s.nome}`}
        className="group flex h-full min-h-[10.5rem] cursor-pointer flex-col rounded-xl border border-border/60 bg-card p-4 text-left transition-colors hover:border-foreground/25 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ServiceBadge nome={s.nome} />
        <div className="mt-auto min-w-0 space-y-0.5 pt-4">
          <p className="truncate text-sm font-semibold text-foreground">{s.nome}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-text-secondary">
            <CategoryIcon categoria={s.categoria} className="h-3 w-3 shrink-0" />
            <span className="truncate">{s.categoria || "Sem categoria"}</span>
          </p>
          <p className="h-4 truncate text-xs text-text-secondary/80" title={s.usuario || undefined}>
            {s.usuario}
          </p>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Mais ações para ${s.nome}`}
            className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onOpen}>
            <Eye className="h-3.5 w-3.5" /> Ver credencial
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </DropdownMenuItem>
          {s.usuario && (
            <DropdownMenuItem onSelect={onCopyUsuario}>
              <User className="h-3.5 w-3.5" /> Copiar usuário
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={!canCopySenha} onSelect={onCopySenha}>
            <KeyRound className="h-3.5 w-3.5" /> Copiar senha
          </DropdownMenuItem>
          {site && (
            <DropdownMenuItem asChild>
              <a href={site} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir site
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
