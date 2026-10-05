import {
  TrendingUp,
  TrendingDown,
  FileText,
  Check,
  AlertCircle,
  Pencil,
  Trash2,
  PhoneCall,
  MoreHorizontal,
  Link2,
  Eye,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type Entry,
  diasDeAtraso,
  fmtBRL,
  formatIsoDate,
  isPartiallyPaid,
  remainingBalance,
} from "@/lib/financeiro-entries";
import { STATUS_LABEL, statusTone } from "./shared";

export function EntryRow({
  e,
  onView,
  onMarkPaid,
  onEdit,
  onDelete,
  onRegistrarCobranca,
  onLink,
}: {
  e: Entry;
  onView: () => void;
  onMarkPaid: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Só passado nas linhas de "A receber" — cobrança não se aplica a
   * despesas. */
  onRegistrarCobranca?: () => void;
  /** Abre a edição já focada no vínculo (cliente/campanha). Padrão: `onEdit`. */
  onLink?: () => void;
}) {
  const isTerminal = e.status === "recebido" || e.status === "pago" || e.status === "cancelado";
  const atraso = e.status === "vencido" ? diasDeAtraso(e.vencimento) : 0;
  const partial = isPartiallyPaid(e);
  // Mesmo critério de "sem vínculo" do Resumo: manual em aberto sem cliente, ou com cliente sem campanha.
  const unlinked = e.editable && !isTerminal && (!e.clienteId || !e.campanhaId);
  return (
    // Div, não <li> — em toda chamada este componente já é envolvido por
    // um <li> do pai (ver MovimentacoesTab.tsx/PendingKindTab.tsx), pra
    // evitar o <li> dentro de <li> corrigido nesta etapa.
    <div
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onView();
        }
      }}
      aria-label={`Ver detalhes de ${e.description}`}
      // flex-wrap + items-start (achado ao vivo nesta etapa): com
      // items-center numa linha só, quando os chips de metadado
      // quebravam pra 2-3 linhas em telas estreitas, os botões/valor à
      // direita ficavam centralizados na altura toda da linha e
      // visualmente sobrepunham o texto. Agrupar tudo à direita (ver
      // abaixo) e permitir quebra resolve sem tirar nenhuma informação.
      className="group flex flex-wrap cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
    >
      <span
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          e.kind === "receita" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
        }`}
      >
        {e.kind === "receita" ? (
          <TrendingUp className="h-3.5 w-3.5" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm ${isTerminal && e.status !== "cancelado" ? "text-muted-foreground line-through" : "text-foreground"}`}
        >
          {e.description}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>Vence {formatIsoDate(e.vencimento)}</span>
          {e.category && <span>· {e.category}</span>}
          {(e.clienteNome || e.campanhaNome) && (
            <span className="inline-flex min-w-0 items-center gap-1">
              ·<Link2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {[e.clienteNome, e.campanhaNome].filter(Boolean).join(" · ")}
              </span>
            </span>
          )}
          {e.invoice && (
            <span className="inline-flex items-center gap-1">
              · <FileText className="h-3 w-3" aria-hidden="true" />
              NF
            </span>
          )}
          {e.source !== "manual" && <span>· automático</span>}
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${statusTone(e.status)}`}
          >
            {e.status === "vencido" && <AlertCircle className="h-3 w-3" />}
            {isTerminal && e.status !== "cancelado" && <Check className="h-3 w-3" />}
            {STATUS_LABEL[e.status]}
            {e.payment?.pagamento && ` ${formatIsoDate(e.payment.pagamento)}`}
          </span>
          {atraso > 0 && <span className="font-medium text-danger">{atraso}d de atraso</span>}
          {partial && (
            <span className="font-medium text-warning">
              Parcial · saldo {fmtBRL(remainingBalance(e))}
            </span>
          )}
        </div>
      </div>
      {/* Valor + UMA ação principal + menu. Em telas estreitas o grupo desce junto (nunca sobrepõe o texto). */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <span
          className={`shrink-0 whitespace-nowrap text-sm font-medium tabular-nums ${
            e.kind === "receita" ? "text-success" : "text-danger"
          }`}
        >
          {e.kind === "receita" ? "+" : "-"} {fmtBRL(e.amount)}
        </span>
        {unlinked && (
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              (onLink ?? onEdit)();
            }}
            className="shrink-0 cursor-pointer whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Vincular
          </button>
        )}
        {!isTerminal && (
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              onMarkPaid();
            }}
            className="shrink-0 cursor-pointer whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {e.kind === "receita" ? "Marcar como recebido" : "Marcar como pago"}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(ev) => ev.stopPropagation()}
              aria-label={`Mais ações de ${e.description}`}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(ev) => ev.stopPropagation()}>
            <DropdownMenuItem onSelect={onView}>
              <Eye className="h-3.5 w-3.5" /> Ver detalhes
            </DropdownMenuItem>
            {onRegistrarCobranca && !isTerminal && (
              <DropdownMenuItem onSelect={onRegistrarCobranca}>
                <PhoneCall className="h-3.5 w-3.5" /> Registrar cobrança
              </DropdownMenuItem>
            )}
            {e.editable && (
              <>
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
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
