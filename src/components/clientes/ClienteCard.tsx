import { MoreVertical, Megaphone, User, Pencil, Trash2, ArrowRight, History } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Cliente } from "@/lib/clientes-store";
import { clienteStatus, CLIENTE_STATUS_LABEL, lastClienteActivityAt } from "./cliente-ui";
import { ClienteLogo } from "./ClienteLogo";

function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
/** Variante de badge por status de cliente (Fase 2 da reconstrução do
 * modelo de status) — âmbar pra negociando (nunca vermelho, é um estado
 * normal do funil, não um alerta), verde pra ativo, cinza pros dois
 * estados "fora da operação". `archived` usa `outline` (mais apagado que
 * `secondary`) pra reforçar que é o estado mais "desligado" dos 4. */
const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  capture: "warning",
  active: "success",
  closed: "secondary",
  archived: "outline",
};

/**
 * Substitui a linha `FlowingMenu` (nome gigante centralizado + marquee de
 * logo) por um card de grid — hierarquia empresa → relação operacional →
 * contato/responsável → campanhas → ações, pedida na migração.
 *
 * Card inteiro clicável sem HTML inválido (nunca um `<button>` contendo
 * outros botões): o `<button>` que abre os detalhes é um IRMÃO vazio,
 * absolutamente posicionado cobrindo todo o card ("stretched button" —
 * mesma técnica do `.stretched-link` do Bootstrap; mesmo padrão de
 * `CampanhaCard.tsx`), não um pai envolvendo o conteúdo. As divs de
 * conteúdo por cima (`relative`) precisam de `pointer-events-none` —
 * sem isso, por virem DEPOIS do botão overlay no DOM, elas pintam por
 * cima dele e capturam o clique antes que ele chegue ao botão (bug real:
 * só as áreas vazias do card, sem nenhum elemento de conteúdo por cima,
 * abriam a página — corrigido). O botão de menu de três pontos, dentro
 * dessas divs, precisa reverter isso com `pointer-events-auto` +
 * `z-10` explícitos pra continuar clicável/focável de forma
 * independente da navegação do card.
 */
export function ClienteCard({
  cliente,
  onOpen,
  onEdit,
  onDelete,
}: {
  cliente: Cliente;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const campanhaCount = cliente.campanhas?.length ?? 0;
  const campanhasLabel =
    campanhaCount === 0
      ? "nenhuma campanha"
      : `${campanhaCount} ${campanhaCount === 1 ? "campanha" : "campanhas"}`;
  const status = clienteStatus(cliente);
  // Fase 4: "próxima ação" só pra negociação e só com dado real preenchido.
  const proximoPasso = cliente.proximoPasso?.trim();
  const previsao = cliente.previsaoFechamento?.trim();
  const showProximaAcao = status === "capture" && !!(proximoPasso || previsao);
  const lastActivity = lastClienteActivityAt(cliente);

  return (
    <Card variant="interactive" className="group relative p-4 text-left">
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        aria-label={`Ver detalhes de ${cliente.empresa} — ${
          cliente.responsavel || "contato não informado"
        }, ${cliente.responsavelInterno || "sem responsável interno"}, ${campanhasLabel}`}
      />

      <div className="relative flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex min-w-0 items-center gap-3">
          <ClienteLogo photo={cliente.photo} empresa={cliente.empresa} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-[15px] font-semibold text-foreground">
                {cliente.empresa}
              </p>
              <Badge variant={STATUS_BADGE_VARIANT[status]} size="sm" className="shrink-0">
                {CLIENTE_STATUS_LABEL[status]}
              </Badge>
            </div>
            <p className="truncate text-xs text-text-secondary">
              {cliente.responsavel ? cliente.responsavel : "Contato não informado"}
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Mais ações para ${cliente.empresa}`}
              className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary pointer-events-auto transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={onOpen}>Ver detalhes</DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Editar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-xs text-text-secondary pointer-events-none">
        <span className="inline-flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" />
          {cliente.responsavelInterno || "Sem responsável interno"}
        </span>
        <span className="inline-flex items-center gap-1.5 capitalize">
          <Megaphone className="h-3.5 w-3.5" />
          {campanhasLabel}
        </span>
        {lastActivity && (
          <span className="inline-flex items-center gap-1.5" title="Última atividade registrada">
            <History className="h-3.5 w-3.5" />
            {fmtDate(lastActivity)}
          </span>
        )}
      </div>

      {showProximaAcao && (
        <div className="relative mt-2 flex items-start gap-1.5 text-xs text-foreground pointer-events-none">
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="line-clamp-2 min-w-0">
            <span className="text-text-secondary">Próxima ação: </span>
            {proximoPasso || "—"}
            {previsao && (
              <span className="text-text-secondary"> · fechamento {fmtDate(previsao)}</span>
            )}
          </span>
        </div>
      )}
    </Card>
  );
}
