import { MoreVertical, Users, CalendarClock, Pencil, Trash2, Repeat } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ClienteLogo } from "@/components/clientes/ClienteLogo";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import { fmtDate } from "@/components/influenciadores/InfluencerBoard";
import { campanhaStatus, CAMPANHA_STATUS_LABEL, type CampanhaRow } from "./campanha-ui";

const STATUS_BADGE_VARIANT = {
  ativa: "success",
  encerrada: "secondary",
  sem_prazo: "outline",
} as const;

/**
 * Substitui a linha `FlowingMenu` (nome gigante centralizado) por um card
 * de grid — mesmo padrão de `clientes/ClienteCard.tsx`, incluindo o
 * componente de logo aprovado em Clientes (`ClienteLogo`, reutilizado tal
 * qual, sem duplicar). Card inteiro clicável via "stretched button"
 * (`<button>` irmão vazio cobrindo o card, nunca envolvendo os outros
 * botões) — mesma técnica, mesma justificativa de acessibilidade do card
 * de Clientes.
 */
export function CampanhaCard({
  row,
  influCount,
  entregasPublicadas,
  entregasTotal,
  onOpen,
  onEdit,
  onDelete,
}: {
  row: CampanhaRow;
  influCount: number;
  entregasPublicadas: number;
  entregasTotal: number;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { campanha: c, cliente } = row;
  const status = campanhaStatus(c, new Date());
  const isRecorrente = c.pagClienteTipo === "Recorrente";
  const prazoLabel = isRecorrente
    ? `Mensal · dia ${c.pagClienteRecorrenteDia ?? "—"}`
    : c.prazo
      ? `Prazo ${fmtDate(c.prazo)}`
      : "Sem prazo definido";

  return (
    <div className="group relative cursor-pointer rounded-[20px] border border-transparent bg-card p-4 text-left transition-colors duration-150 hover:border-border hover:bg-accent/40 dark:shadow-none">
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 cursor-pointer rounded-[20px] transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.99]"
        aria-label={`Abrir campanha ${c.nome} — ${cliente.empresa}, ${CAMPANHA_STATUS_LABEL[status]}, ${influCount} influenciador(es)`}
      />

      <div className="relative flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <ClienteLogo photo={cliente.photo} empresa={cliente.empresa} size="md" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-foreground">{c.nome}</p>
            <p className="truncate text-xs text-text-secondary">{cliente.empresa}</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Mais ações para ${c.nome}`}
              className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary opacity-60 transition-opacity hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand group-hover:opacity-100 sm:h-8 sm:w-8"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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

      <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant={STATUS_BADGE_VARIANT[status]}>{CAMPANHA_STATUS_LABEL[status]}</Badge>
        {isRecorrente && (
          <Badge variant="brand" className="gap-1">
            <Repeat className="h-3 w-3" /> Recorrente
          </Badge>
        )}
      </div>

      <div className="relative mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          {prazoLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {influCount === 0
            ? "Nenhum influenciador"
            : `${influCount} ${influCount === 1 ? "influenciador" : "influenciadores"}`}
        </span>
        {entregasTotal > 0 && (
          <span className="inline-flex items-center gap-1.5">
            {entregasPublicadas}/{entregasTotal} entregas publicadas
          </span>
        )}
      </div>
    </div>
  );
}
