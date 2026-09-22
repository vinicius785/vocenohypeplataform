import { useState } from "react";
import { Link2, Pencil, MoreVertical, Trash2, Megaphone } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatIsoDate } from "@/lib/utils";
import type { Cliente } from "@/lib/clientes-store";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import { ClienteLogo } from "./ClienteLogo";
import { waLink, mailtoLink } from "./cliente-ui";
import { PortalAccessSection } from "./PortalAccessSection";

function InfoRow({
  label,
  value,
  href,
}: {
  label: string;
  value: React.ReactNode;
  href?: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      {href ? (
        <a
          href={href}
          target={href.startsWith("mailto:") ? undefined : "_blank"}
          rel="noopener noreferrer"
          className="mt-0.5 block truncate text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {value}
        </a>
      ) : (
        <p className="mt-0.5 truncate text-sm text-foreground">{value}</p>
      )}
    </div>
  );
}

/**
 * Drawer lateral de detalhes — substitui o modal central antigo. "Excluir"
 * sai da linha de ações primárias (pedido explícito da migração) e vai
 * pro menu de contexto, separado de "Link do cliente"/"Editar". Campos
 * ausentes mostram mensagem discreta em vez de "—" solto; e-mail/WhatsApp
 * viram link de verdade quando preenchidos.
 */
export function ClienteDetailsSheet({
  cliente,
  onClose,
  onEdit,
  onDelete,
  onCopyLink,
  onNovaCampanha,
  onEditCampanha,
}: {
  cliente: Cliente | null;
  onClose: () => void;
  onEdit: (c: Cliente) => void;
  onDelete: (c: Cliente) => void;
  onCopyLink: (c: Cliente) => void;
  onNovaCampanha: () => void;
  onEditCampanha: (c: Campaign) => void;
}) {
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyLink = () => {
    if (!cliente) return;
    onCopyLink(cliente);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1500);
  };

  return (
    <Sheet open={!!cliente} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        {cliente && (
          <>
            <div className="border-b border-border/60 px-6 py-5">
              <div className="flex items-start gap-3">
                <ClienteLogo photo={cliente.photo} empresa={cliente.empresa} size="lg" />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate">{cliente.empresa}</SheetTitle>
                  <SheetDescription className="mt-0.5 truncate">
                    {cliente.responsavel || "Contato não informado"}
                  </SheetDescription>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" onClick={handleCopyLink} className="gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  {linkCopied ? "Link copiado!" : "Link do cliente"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(cliente)}
                  className="gap-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Mais ações"
                      className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => onDelete(cliente)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir cliente
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {/* Agrupadas numa única superfície compacta (rodada corretiva)
               * — antes eram 4 blocos soltos espalhados por uma grade larga,
               * esvaziando o drawer quando o cliente tinha poucos dados. */}
              <div className="grid grid-cols-1 gap-4 rounded-2xl bg-muted/40 p-4 sm:grid-cols-2">
                <InfoRow
                  label="E-mail"
                  value={cliente.email || "E-mail não informado"}
                  href={cliente.email ? mailtoLink(cliente.email) : null}
                />
                <InfoRow
                  label="WhatsApp"
                  value={cliente.whatsapp || "WhatsApp não informado"}
                  href={cliente.whatsapp ? waLink(cliente.whatsapp) : null}
                />
                <InfoRow
                  label="Responsável interno"
                  value={cliente.responsavelInterno || "Sem responsável interno"}
                />
                <InfoRow
                  label="Cliente desde"
                  value={
                    cliente.clienteDesde
                      ? new Date(cliente.clienteDesde).toLocaleDateString("pt-BR")
                      : "Data não informada"
                  }
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Campanhas
                  </h4>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
                    {cliente.campanhas?.length ?? 0}
                  </span>
                </div>
                {cliente.campanhas && cliente.campanhas.length > 0 ? (
                  <ul className="space-y-2">
                    {cliente.campanhas.map((camp) => (
                      <li
                        key={camp.id}
                        className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3"
                      >
                        <ClienteLogo photo={cliente.photo} empresa={cliente.empresa} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {camp.nome}
                          </p>
                          <p className="truncate text-xs text-text-secondary">
                            {camp.prazo ? `Prazo ${formatIsoDate(camp.prazo)}` : "Sem prazo"}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => onEditCampanha(camp)}>
                          <Pencil className="h-3 w-3" /> Editar
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-text-secondary">
                    Nenhuma campanha vinculada ainda.
                  </div>
                )}
              </div>

              <PortalAccessSection
                clienteId={cliente.id}
                clienteNome={cliente.empresa}
                publicToken={cliente.publicToken}
              />
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-6 py-4">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Fechar
              </Button>
              <Button
                variant="primary"
                size="comfortable"
                onClick={onNovaCampanha}
                className="gap-1.5"
              >
                <Megaphone className="h-4 w-4" /> Nova campanha
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
