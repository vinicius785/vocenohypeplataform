import { useState } from "react";
import { X } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { type Entry, markEntryPaid, todayISO } from "@/lib/financeiro-entries";
import { Field, inputCls, FinanceiroAnexoBox } from "./shared";

/** Data do pagamento nunca é a mesma coisa que o vencimento — o vencimento
 * é quando DEVERIA acontecer, isso aqui é quando de fato aconteceu. */
export function MarkAsPaidDialog({
  entry,
  onClose,
  onConfirmed,
}: {
  entry: Entry;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [pagamento, setPagamento] = useState(todayISO());
  const [paidAmount, setPaidAmount] = useState<number | undefined>(entry.amount);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [anexos, setAnexos] = useState(entry.anexos ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const label = entry.kind === "receita" ? "Marcar como recebido" : "Marcar como pago";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagamento || paidAmount == null || paidAmount <= 0) {
      setError("Informe a data e o valor.");
      return;
    }
    setSaving(true);
    try {
      const paymentAnexo = anexos.find((a) => !(entry.anexos ?? []).some((old) => old.id === a.id));
      await markEntryPaid(entry, {
        pagamento,
        paidAmount,
        paymentMethod,
        paymentNote: paymentNote.trim() || undefined,
        paymentAnexoId: paymentAnexo?.id,
      });
      onConfirmed();
    } catch (err) {
      setError(`Não foi possível confirmar: ${err instanceof Error ? err.message : "erro"}.`);
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(ev) => ev.stopPropagation()}
        onSubmit={(e) => void submit(e)}
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <Field label="Data do pagamento">
            <DateField
              value={pagamento || undefined}
              onChange={(v) => setPagamento(v ?? "")}
              className={inputCls}
              contentClassName="z-[70]"
            />
          </Field>
          <Field label="Valor pago (R$)">
            <FormattedNumberInput
              mode="currency"
              value={paidAmount}
              onValueChange={setPaidAmount}
              className={inputCls}
              placeholder="0,00"
              required
            />
          </Field>
          <Field label="Forma de pagamento">
            <input
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="PIX, transferência, boleto..."
              className={inputCls}
            />
          </Field>
          <FinanceiroAnexoBox categoria="Comprovante" anexos={anexos} onChange={setAnexos} />
          <Field label="Observação (opcional)">
            <input
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              className={inputCls}
            />
          </Field>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Confirmando..." : "Confirmar"}
          </button>
        </div>
      </form>
    </div>
  );
}
