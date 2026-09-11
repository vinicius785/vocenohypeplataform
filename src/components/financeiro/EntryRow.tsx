import {
  TrendingUp,
  TrendingDown,
  Link2,
  FileText,
  Check,
  AlertCircle,
  Pencil,
  Trash2,
  PhoneCall,
} from "lucide-react";
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
}: {
  e: Entry;
  onView: () => void;
  onMarkPaid: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Só passado nas linhas de "A receber" — cobrança não se aplica a
   * despesas. */
  onRegistrarCobranca?: () => void;
}) {
  const isTerminal = e.status === "recebido" || e.status === "pago" || e.status === "cancelado";
  const atraso = e.status === "vencido" ? diasDeAtraso(e.vencimento) : 0;
  const partial = isPartiallyPaid(e);
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
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>Vencimento {formatIsoDate(e.vencimento)}</span>
          <span>·</span>
          <span className="rounded bg-muted px-1.5 py-0.5">{e.category}</span>
          {(e.clienteNome || e.campanhaNome) && (
            <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5">
              <Link2 className="h-3 w-3" />
              {[e.clienteNome, e.campanhaNome].filter(Boolean).join(" · ")}
            </span>
          )}
          {e.invoice && (
            <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5">
              <FileText className="h-3 w-3" />
              NF
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${statusTone(e.status)}`}
          >
            {e.status === "vencido" && <AlertCircle className="h-3 w-3" />}
            {isTerminal && e.status !== "cancelado" && <Check className="h-3 w-3" />}
            {STATUS_LABEL[e.status]}
            {e.payment?.pagamento && ` ${formatIsoDate(e.payment.pagamento)}`}
          </span>
          {atraso > 0 && (
            <span className="rounded bg-danger-soft px-1.5 py-0.5 text-danger">
              {atraso}d de atraso
            </span>
          )}
          {partial && (
            <span className="rounded bg-warning-soft px-1.5 py-0.5 text-warning">
              Parcial · saldo {fmtBRL(remainingBalance(e))}
            </span>
          )}
          {e.source !== "manual" && (
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              auto
            </span>
          )}
        </div>
      </div>
      {/* Grupo à direita — anda junto pra uma 2ª linha em telas estreitas
       * (nunca um botão isolado sobrepondo o texto do meio). */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {onRegistrarCobranca && !isTerminal && (
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              onRegistrarCobranca();
            }}
            className="shrink-0 cursor-pointer whitespace-nowrap rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            title="Registrar cobrança"
          >
            <PhoneCall className="h-3.5 w-3.5" />
          </button>
        )}
        {!isTerminal && (
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              onMarkPaid();
            }}
            className="shrink-0 cursor-pointer whitespace-nowrap rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {e.kind === "receita" ? "Marcar recebido" : "Marcar pago"}
          </button>
        )}

        <span
          className={`shrink-0 whitespace-nowrap text-sm font-medium tabular-nums ${
            e.kind === "receita" ? "text-success" : "text-danger"
          }`}
        >
          {e.kind === "receita" ? "+" : "-"} {fmtBRL(e.amount)}
        </span>
        {e.editable && (
          // Sempre visível no mobile (sem hover) — só fica oculto até o
          // hover/foco a partir de `md:` (desktop), onde há espaço e o
          // gesto de mouse existe.
          <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                onEdit();
              }}
              aria-label="Editar"
              className="cursor-pointer rounded p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                onDelete();
              }}
              aria-label="Remover"
              className="cursor-pointer rounded p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
