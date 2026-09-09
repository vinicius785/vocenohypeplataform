import { useState } from "react";
import { X } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { saveSaldoInicial, type SaldoInicialConfig } from "@/lib/financeiro-saldo-inicial-store";
import { todayISO } from "@/lib/financeiro-entries";
import { Field, inputCls } from "./shared";

/** Configura o único ponto de partida real do "Saldo atual" — sem isso, o
 * Financeiro nunca inventa esse número (mostra "Saldo não configurado"). */
export function SaldoInicialDialog({
  current,
  onClose,
  onSaved,
}: {
  current: SaldoInicialConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [valor, setValor] = useState<number | undefined>(current?.valor);
  const [data, setData] = useState(current?.data ?? todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (valor == null || !data) {
      setError("Informe o valor e a data.");
      return;
    }
    setSaving(true);
    const res = await saveSaldoInicial({ valor, data });
    if (res.error) {
      setError(`Não foi possível salvar: ${res.error}`);
      setSaving(false);
      return;
    }
    onSaved();
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
          <h2 className="text-sm font-semibold text-foreground">Configurar saldo inicial</h2>
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
          <p className="text-xs text-muted-foreground">
            O saldo atual do Financeiro é calculado a partir deste valor — o quanto havia em caixa
            nesta data — somando/subtraindo tudo que foi recebido/pago depois dela.
          </p>
          <Field label="Saldo em caixa (R$)">
            <FormattedNumberInput
              mode="currency"
              value={valor}
              onValueChange={setValor}
              className={inputCls}
              placeholder="0,00"
              required
            />
          </Field>
          <Field label="Data deste saldo">
            <DateField
              value={data || undefined}
              onChange={(v) => setData(v ?? "")}
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
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
