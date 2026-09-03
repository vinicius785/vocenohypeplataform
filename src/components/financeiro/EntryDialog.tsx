import { useEffect, useMemo, useState } from "react";
import { X, TrendingUp, TrendingDown, FileText, Landmark } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { BankFields, type BankInfo } from "@/components/CampanhasSection";
import {
  type ManualEntry,
  type FinanceiroAnexo,
  type Kind,
  categoriasFor,
  todayISO,
} from "@/lib/financeiro-entries";
import { Field, inputCls, FinanceiroAnexoBox } from "./shared";

type ClienteOpt = { id: string; nome: string; campanhas: { id: string; nome: string }[] };

export function EntryDialog({
  initial,
  clientes,
  onClose,
  onSave,
}: {
  initial: ManualEntry | null;
  clientes: ClienteOpt[];
  onClose: () => void;
  onSave: (m: ManualEntry) => void;
}) {
  const [kind, setKind] = useState<Kind>(initial?.kind ?? "despesa");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [amount, setAmount] = useState<number | undefined>(initial?.amount);
  const [clienteId, setClienteId] = useState(initial?.clienteId ?? "");
  const [campanhaId, setCampanhaId] = useState(initial?.campanhaId ?? "");
  const [bank, setBank] = useState<BankInfo>(initial?.bank ?? {});
  const [showBank, setShowBank] = useState<boolean>(
    !!initial?.bank && Object.values(initial.bank).some(Boolean),
  );
  // Nota fiscal antiga (base64, `@deprecated`) só é preservada se o
  // lançamento já tinha uma — nunca é escrita de novo daqui em diante,
  // novos anexos sempre vão pro Storage via `anexos`.
  const [invoice] = useState(initial?.invoice);
  const [anexos, setAnexos] = useState<FinanceiroAnexo[]>(initial?.anexos ?? []);
  const [error, setError] = useState("");

  const campanhas = useMemo(
    () => clientes.find((c) => c.id === clienteId)?.campanhas ?? [],
    [clientes, clienteId],
  );

  useEffect(() => {
    if (!clienteId) setCampanhaId("");
    else if (campanhaId && !campanhas.some((c) => c.id === campanhaId)) setCampanhaId("");
  }, [clienteId, campanhas, campanhaId]);

  // Trocar receita/despesa muda a lista de categorias válidas — se a
  // categoria atual não existe mais nessa lista, limpa (menos no caso de
  // um lançamento antigo sendo editado, onde a categoria "estranha" some
  // do campo <select> como opção extra, então nunca fica inválida).
  const categoriaOpts = categoriasFor(kind);
  useEffect(() => {
    if (category && !categoriaOpts.includes(category) && category !== initial?.category) {
      setCategory("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = amount ?? 0;
    if (!description.trim() || amt <= 0 || !date || !category) {
      setError("Preencha descrição, valor, data e categoria.");
      return;
    }
    const bankFilled = Object.values(bank).some((v) => v && String(v).trim() !== "");
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      date,
      description: description.trim(),
      category: category.trim(),
      amount: amt,
      kind,
      status: initial?.status,
      payment: initial?.payment,
      clienteId: clienteId || undefined,
      campanhaId: campanhaId || undefined,
      bank: bankFilled ? bank : undefined,
      invoice,
      anexos,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(ev) => ev.stopPropagation()}
        onSubmit={submit}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">
            {initial ? "Editar lançamento" : "Novo lançamento"}
          </h2>
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
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
            {(["receita", "despesa"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold capitalize transition-colors ${
                  kind === k
                    ? k === "receita"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-rose-500/10 text-rose-600"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {k === "receita" ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                {k}
              </button>
            ))}
          </div>

          <Field label="Descrição">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputCls}
              placeholder="Ex: Assinatura Meta Ads"
              required
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Valor (R$)">
              <FormattedNumberInput
                mode="currency"
                value={amount}
                onValueChange={setAmount}
                className={inputCls}
                placeholder="0,00"
                required
              />
            </Field>
            <Field label="Vencimento">
              <DateField
                value={date || undefined}
                onChange={(v) => setDate(v ?? "")}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Categoria">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
              required
            >
              <option value="">Selecione...</option>
              {/* Categoria antiga (texto livre) que não está na lista padrão —
                  mantém como opção extra, pra não sumir/mudar sozinha ao
                  editar um lançamento já existente. */}
              {category && !categoriaOpts.includes(category) && (
                <option value={category}>{category}</option>
              )}
              {categoriaOpts.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Cliente (opcional)">
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className={inputCls}
              >
                <option value="">—</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Campanha (opcional)">
              <select
                value={campanhaId}
                onChange={(e) => setCampanhaId(e.target.value)}
                disabled={!clienteId || campanhas.length === 0}
                className={`${inputCls} disabled:opacity-50`}
              >
                <option value="">—</option>
                {campanhas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setShowBank((s) => !s)}
              className="flex w-full cursor-pointer items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-foreground hover:bg-muted/50"
            >
              <span className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-muted-foreground" />
                Dados bancários {showBank ? "" : "(opcional)"}
              </span>
              <span className="text-muted-foreground">{showBank ? "−" : "+"}</span>
            </button>
            {showBank && (
              <div className="border-t border-border p-3.5">
                <BankFields value={bank} onChange={setBank} compact />
              </div>
            )}
          </div>

          {invoice && (
            <div className="rounded-xl border border-border p-3.5">
              <p className="mb-1.5 text-xs font-semibold text-foreground">
                Nota fiscal (anexo antigo)
              </p>
              <div className="flex items-center gap-2 rounded bg-muted/40 px-2 py-1.5 text-xs">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{invoice.name}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FinanceiroAnexoBox categoria="Comprovante" anexos={anexos} onChange={setAnexos} />
            <FinanceiroAnexoBox categoria="Nota fiscal" anexos={anexos} onChange={setAnexos} />
          </div>

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
            className="cursor-pointer rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            {initial ? "Salvar" : "Adicionar"}
          </button>
        </div>
      </form>
    </div>
  );
}
