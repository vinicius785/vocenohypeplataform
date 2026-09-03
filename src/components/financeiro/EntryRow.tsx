import {
  TrendingUp,
  TrendingDown,
  Link2,
  FileText,
  Check,
  AlertCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { type Entry, fmtBRL, formatIsoDate } from "@/lib/financeiro-entries";
import { STATUS_LABEL, statusTone } from "./shared";

export function EntryRow({
  e,
  onView,
  onMarkPaid,
  onEdit,
  onDelete,
}: {
  e: Entry;
  onView: () => void;
  onMarkPaid: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isTerminal = e.status === "recebido" || e.status === "pago" || e.status === "cancelado";
  return (
    <li
      onClick={onView}
      className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/40"
    >
      <span
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          e.kind === "receita"
            ? "bg-emerald-500/10 text-emerald-600"
            : "bg-rose-500/10 text-rose-600"
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
          {e.source !== "manual" && (
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              auto
            </span>
          )}
        </div>
      </div>
      {!isTerminal && (
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            onMarkPaid();
          }}
          className="shrink-0 cursor-pointer whitespace-nowrap rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          {e.kind === "receita" ? "Marcar recebido" : "Marcar pago"}
        </button>
      )}

      <span
        className={`shrink-0 text-sm font-medium tabular-nums ${
          e.kind === "receita" ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {e.kind === "receita" ? "+" : "-"} {fmtBRL(e.amount)}
      </span>
      {e.editable && (
        <div className="ml-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              onEdit();
            }}
            aria-label="Editar"
            className="cursor-pointer rounded p-1 hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              onDelete();
            }}
            aria-label="Remover"
            className="cursor-pointer rounded p-1 hover:bg-muted"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      )}
    </li>
  );
}
