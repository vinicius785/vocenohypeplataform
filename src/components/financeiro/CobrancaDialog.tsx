import { useState } from "react";
import { X } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { type Entry, registrarCobranca, formatIsoDate, todayISO } from "@/lib/financeiro-entries";
import { Field, inputCls } from "./shared";

/** Registro simples de cobrança — sem lembretes/notificações (não existe
 * essa infraestrutura hoje, ver limitação documentada no plano). Só grava
 * "fiz contato, aqui está a nota" + opcionalmente "a próxima é dia X". */
export function CobrancaDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: Entry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nota, setNota] = useState("");
  const [proxima, setProxima] = useState(entry.proximaCobranca ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const historico = [...(entry.cobrancaHistorico ?? [])].reverse();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nota.trim()) {
      setError("Descreva o contato feito.");
      return;
    }
    setSaving(true);
    try {
      await registrarCobranca(entry, nota, proxima || undefined);
      onSaved();
    } catch (err) {
      setError(`Não foi possível salvar: ${err instanceof Error ? err.message : "erro"}.`);
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
          <h2 className="text-sm font-semibold text-foreground">Registrar cobrança</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
          {historico.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Histórico
              </p>
              <ul className="space-y-1.5">
                {historico.map((h, i) => (
                  <li key={i} className="rounded bg-muted/40 px-2 py-1.5 text-xs">
                    <span className="font-medium text-foreground">{formatIsoDate(h.data)}</span>{" "}
                    <span className="text-muted-foreground">{h.nota}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Field label="Contato feito hoje">
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              placeholder="Ex: liguei, cliente confirmou pagamento até sexta"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
          <Field label="Agendar próxima cobrança (opcional)">
            <DateField
              value={proxima || undefined}
              onChange={(v) => setProxima(v ?? "")}
              min={todayISO()}
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
