import { X, TrendingUp, TrendingDown, FileText, Download, Pencil, Check } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  type Entry,
  type FinanceiroAnexo,
  type Source,
  entryAnexos,
  fmtBRL,
  formatIsoDate,
  loadFinanceiroMembers,
} from "@/lib/financeiro-entries";
import { DetailRow, CopyPixButton, FinanceiroAnexoBox, STATUS_LABEL, statusTone } from "./shared";

const SOURCE_LABEL: Record<Source, string> = {
  manual: "Lançamento manual",
  influenciador: "Pagamento a influenciador",
  salario: "Salário (recorrência dia 15)",
  campanha: "Receita de campanha",
};

export function EntryDetailsDialog({
  entry,
  onClose,
  onEdit,
  onMarkPaid,
  onAnexosChange,
}: {
  entry: Entry;
  onClose: () => void;
  onEdit?: () => void;
  /** Ausente quando o status já é terminal (recebido/pago/cancelado) —
   * não faz sentido oferecer "marcar como pago" de novo. */
  onMarkPaid?: () => void;
  /** Só passado pra lançamentos manuais (editáveis) — permite anexar ou
   * remover comprovante/nota fiscal direto daqui, sem precisar clicar em
   * "Editar" primeiro. */
  onAnexosChange?: (anexos: FinanceiroAnexo[]) => void;
}) {
  const bankFilled =
    entry.bank && Object.values(entry.bank).some((v) => v && String(v).trim() !== "");
  const responsavelNome = entry.responsavelId
    ? loadFinanceiroMembers().find((m) => m.id === entry.responsavelId)?.name
    : undefined;
  const anexos = entryAnexos(entry);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">Detalhes do lançamento</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* Cabeçalho: descrição + valor + status — sem card, hierarquia
              tipográfica só. */}
          <div>
            <p className="text-base font-semibold text-foreground">{entry.description}</p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`text-2xl font-bold tabular-nums ${entry.kind === "receita" ? "text-emerald-600" : "text-rose-600"}`}
              >
                {entry.kind === "receita" ? "+" : "−"} {fmtBRL(entry.amount)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(entry.status)}`}
              >
                {STATUS_LABEL[entry.status]}
              </span>
            </div>
          </div>

          <Separator />

          {/* Três datas lado a lado — nunca confunde vencimento com
              pagamento real. */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <DetailRow label="Competência" value={formatIsoDate(entry.competencia)} />
            <DetailRow label="Vencimento" value={formatIsoDate(entry.vencimento)} />
            <DetailRow
              label={entry.kind === "receita" ? "Recebimento" : "Pagamento"}
              value={entry.payment?.pagamento ? formatIsoDate(entry.payment.pagamento) : "—"}
            />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <DetailRow label="Categoria" value={entry.category} />
            <DetailRow label="Tipo" value={entry.kind === "receita" ? "Receita" : "Despesa"} />
            <DetailRow label="Origem" value={SOURCE_LABEL[entry.source]} />
            {entry.clienteNome && <DetailRow label="Cliente" value={entry.clienteNome} />}
            {entry.campanhaNome && <DetailRow label="Campanha" value={entry.campanhaNome} />}
            {entry.influencerName && (
              <DetailRow label="Influenciador" value={entry.influencerName} />
            )}
            {entry.memberName && <DetailRow label="Membro" value={entry.memberName} />}
            {responsavelNome && <DetailRow label="Responsável" value={responsavelNome} />}
            {entry.formaPagamento && (
              <DetailRow label="Forma de pagamento prevista" value={entry.formaPagamento} />
            )}
            {entry.recurrence && (
              <DetailRow
                label="Recorrência"
                value={`${entry.recurrence.frequency} · ocorrência ${entry.recurrence.occurrenceIndex + 1}`}
              />
            )}
          </div>

          {entry.observacoes && (
            <p className="text-xs text-muted-foreground">{entry.observacoes}</p>
          )}

          {onMarkPaid && (
            <button
              type="button"
              onClick={onMarkPaid}
              className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" />
              {entry.kind === "receita" ? "Marcar como recebido" : "Marcar como pago"}
            </button>
          )}
          {entry.payment?.paymentMethod && (
            <p className="text-[11px] text-muted-foreground">
              {entry.kind === "receita" ? "Recebido" : "Pago"} via {entry.payment.paymentMethod}
              {entry.payment.paymentNote && ` · ${entry.payment.paymentNote}`}
            </p>
          )}

          {bankFilled && entry.bank && (
            <>
              <Separator />
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Dados bancários
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  {entry.bank.titular && <DetailRow label="Titular" value={entry.bank.titular} />}
                  {entry.bank.cpfCnpj && <DetailRow label="CPF/CNPJ" value={entry.bank.cpfCnpj} />}
                  {entry.bank.banco && <DetailRow label="Banco" value={entry.bank.banco} />}
                  {entry.bank.agencia && <DetailRow label="Agência" value={entry.bank.agencia} />}
                  {entry.bank.conta && <DetailRow label="Conta" value={entry.bank.conta} />}
                  {entry.bank.tipoConta && <DetailRow label="Tipo" value={entry.bank.tipoConta} />}
                  {entry.bank.pixTipo && (
                    <DetailRow label="PIX (tipo)" value={entry.bank.pixTipo} />
                  )}
                  {entry.bank.pixChave && (
                    <DetailRow
                      label="PIX (chave)"
                      value={<CopyPixButton value={entry.bank.pixChave} />}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {(onAnexosChange || anexos.length > 0) && (
            <>
              <Separator />
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Documentos
                </p>
                {onAnexosChange ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FinanceiroAnexoBox
                      categoria="Comprovante"
                      anexos={entry.anexos ?? []}
                      onChange={onAnexosChange}
                    />
                    <FinanceiroAnexoBox
                      categoria="Nota fiscal"
                      anexos={entry.anexos ?? []}
                      onChange={onAnexosChange}
                    />
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {anexos.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{a.nome}</span>
                        </span>
                        <a
                          href={a.url}
                          download={a.nome}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                        >
                          <Download className="h-3 w-3" /> Baixar
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {!entry.editable && (
            <p className="text-[11px] text-muted-foreground">
              Este lançamento é gerado automaticamente e não pode ser editado aqui — ajuste na
              origem (campanha, influenciador ou salário do membro).
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Fechar
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
