import {
  X,
  TrendingUp,
  TrendingDown,
  Wallet,
  FileText,
  Download,
  Building2,
  User,
  AlertCircle,
  Info,
  Landmark,
  Calendar,
  Tag,
  ArrowRightLeft,
  Pencil,
  Paperclip,
  Check,
} from "lucide-react";
import {
  type Entry,
  type FinanceiroAnexo,
  type Source,
  entryAnexos,
  fmtBRL,
  formatIsoDate,
  loadFinanceiroMembers,
} from "@/lib/financeiro-entries";
import {
  Section,
  DetailRow,
  CopyPixButton,
  FinanceiroAnexoBox,
  STATUS_LABEL,
  statusTone,
} from "./shared";

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
  const sourceLabel: Record<Source, string> = {
    manual: "Lançamento manual",
    influenciador: "Pagamento a influenciador",
    salario: "Salário (recorrência dia 15)",
    campanha: "Receita de campanha",
  };

  const kindTone =
    entry.kind === "receita"
      ? "bg-emerald-500/10 text-emerald-600"
      : "bg-rose-500/10 text-rose-600";

  const responsavelNome = entry.responsavelId
    ? loadFinanceiroMembers().find((m) => m.id === entry.responsavelId)?.name
    : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-lg"
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
          {/* Hero — descrição, valor e status numa faixa só, igual o resto
              da plataforma faz pra "o que é isso e qual o estado agora". */}
          <div className="flex items-start gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${kindTone}`}
            >
              {entry.kind === "receita" ? (
                <TrendingUp className="h-5 w-5" />
              ) : (
                <TrendingDown className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-foreground">
                {entry.description}
              </p>
              <p
                className={`text-2xl font-bold tabular-nums ${entry.kind === "receita" ? "text-emerald-600" : "text-rose-600"}`}
              >
                {entry.kind === "receita" ? "+" : "−"} {fmtBRL(entry.amount)}
              </p>
            </div>
          </div>

          <Section
            title="Pagamento"
            icon={<Wallet className="h-4 w-4" />}
            action={
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(entry.status)}`}
              >
                {STATUS_LABEL[entry.status]}
              </span>
            }
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {entry.payment?.pagamento
                  ? `${entry.kind === "receita" ? "Recebido" : "Pago"} em ${formatIsoDate(entry.payment.pagamento)}${entry.payment.paymentMethod ? ` · ${entry.payment.paymentMethod}` : ""}`
                  : `Vencimento ${formatIsoDate(entry.vencimento)}`}
              </p>
              {onMarkPaid && (
                <button
                  type="button"
                  onClick={onMarkPaid}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  <Check className="h-3.5 w-3.5" />
                  {entry.kind === "receita" ? "Marcar como recebido" : "Marcar como pago"}
                </button>
              )}
            </div>
            {entry.payment?.paymentNote && (
              <p className="text-[11px] text-muted-foreground">{entry.payment.paymentNote}</p>
            )}
          </Section>

          <Section title="Detalhes" icon={<Info className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <DetailRow
                icon={<Calendar className="h-3 w-3" />}
                label="Competência"
                value={formatIsoDate(entry.competencia)}
              />
              <DetailRow
                icon={<Calendar className="h-3 w-3" />}
                label="Vencimento"
                value={formatIsoDate(entry.vencimento)}
              />
              <DetailRow
                icon={<Tag className="h-3 w-3" />}
                label="Categoria"
                value={entry.category}
              />
              <DetailRow
                icon={<ArrowRightLeft className="h-3 w-3" />}
                label="Tipo"
                value={entry.kind === "receita" ? "Receita" : "Despesa"}
              />
              <DetailRow label="Origem" value={sourceLabel[entry.source]} />
              {entry.clienteNome && (
                <DetailRow
                  icon={<Building2 className="h-3 w-3" />}
                  label="Cliente"
                  value={entry.clienteNome}
                />
              )}
              {entry.campanhaNome && <DetailRow label="Campanha" value={entry.campanhaNome} />}
              {entry.influencerName && (
                <DetailRow
                  icon={<User className="h-3 w-3" />}
                  label="Influenciador"
                  value={entry.influencerName}
                />
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
              {entry.observacoes && <DetailRow label="Observações" value={entry.observacoes} />}
            </div>
          </Section>

          {bankFilled && entry.bank && (
            <Section title="Dados bancários" icon={<Landmark className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                {entry.bank.titular && <DetailRow label="Titular" value={entry.bank.titular} />}
                {entry.bank.cpfCnpj && <DetailRow label="CPF/CNPJ" value={entry.bank.cpfCnpj} />}
                {entry.bank.banco && <DetailRow label="Banco" value={entry.bank.banco} />}
                {entry.bank.agencia && <DetailRow label="Agência" value={entry.bank.agencia} />}
                {entry.bank.conta && <DetailRow label="Conta" value={entry.bank.conta} />}
                {entry.bank.tipoConta && <DetailRow label="Tipo" value={entry.bank.tipoConta} />}
                {entry.bank.pixTipo && <DetailRow label="PIX (tipo)" value={entry.bank.pixTipo} />}
                {entry.bank.pixChave && (
                  <DetailRow
                    label="PIX (chave)"
                    value={<CopyPixButton value={entry.bank.pixChave} />}
                  />
                )}
              </div>
            </Section>
          )}

          {onAnexosChange ? (
            <>
              {entry.invoice && (
                <div className="rounded-xl border border-border p-3.5">
                  <p className="mb-1.5 text-xs font-semibold text-foreground">
                    Nota fiscal (anexo antigo)
                  </p>
                  <div className="flex items-center gap-2 rounded bg-muted/40 px-2 py-1.5 text-xs">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{entry.invoice.name}</span>
                  </div>
                </div>
              )}
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
            </>
          ) : (
            entryAnexos(entry).length > 0 && (
              <Section title="Anexos" icon={<Paperclip className="h-4 w-4" />}>
                <ul className="space-y-1.5">
                  {entryAnexos(entry).map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-xs"
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.nome}</span>
                      </span>
                      <a
                        href={a.url}
                        download={a.nome}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted"
                      >
                        <Download className="h-3 w-3" /> Baixar
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            )
          )}

          {!entry.editable && (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
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
