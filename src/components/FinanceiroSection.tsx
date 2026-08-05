import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  Wallet,
  Search,
  Trash2,
  Pencil,
  Link2,
  FileText,
  Upload,
  Download,
  Building2,
  User,
  Check,
  AlertCircle,
} from "lucide-react";

import { SectionHeader } from "./SectionHeader";
import { useClientes } from "@/lib/clientes-store";
import { BankFields, type BankInfo } from "./CampanhasSection";
import {
  type Entry,
  type ManualEntry,
  type InvoiceFile,
  type Kind,
  type Source,
  useFinanceiroEntries,
  loadPaid,
  savePaid,
  type PaidMap,
  loadManual,
  saveManual,
  fmtBRL,
  parseMoney,
  monthKey,
  fromMonthKey,
  fmtMonth,
  todayISO,
  formatIsoDate,
} from "@/lib/financeiro-entries";

/* ============================================================
 * Financeiro — hub central
 *  - Agrega automaticamente pagamentos de influenciadores lançados
 *    em cada campanha (localStorage: campanha:influs:${id}).
 *  - Agrega receitas de campanhas (valor do cliente / parcelas).
 *  - Agrega salários da equipe (localStorage: time:membros) como
 *    despesa recorrente todo dia 15 de cada mês.
 *  - Permite lançamentos manuais vinculados a cliente/campanha.
 *  - Agregação compartilhada com o dashboard Início via
 *    @/lib/financeiro-entries (useFinanceiroEntries).
 * ============================================================ */

type PeriodMode = "mes" | "7dias" | "30dias" | "1ano" | "personalizado";

const PERIOD_OPTIONS: { value: PeriodMode; label: string }[] = [
  { value: "mes", label: "Mês específico" },
  { value: "7dias", label: "Últimos 7 dias" },
  { value: "30dias", label: "Últimos 30 dias" },
  { value: "1ano", label: "Último ano" },
  { value: "personalizado", label: "Período personalizado" },
];

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function FinanceiroSection() {
  const clientes = useClientes();
  const [manual, setManualState] = useState<ManualEntry[]>(() => loadManual());
  const setManual = (u: ManualEntry[] | ((p: ManualEntry[]) => ManualEntry[])) =>
    setManualState((prev) => {
      const next = typeof u === "function" ? (u as (p: ManualEntry[]) => ManualEntry[])(prev) : u;
      saveManual(next);
      return next;
    });

  const [month, setMonth] = useState<string>(monthKey(new Date()));
  const [periodMode, setPeriodMode] = useState<PeriodMode>("mes");
  const [customFrom, setCustomFrom] = useState<string>(todayISO());
  const [customTo, setCustomTo] = useState<string>(todayISO());
  const [filter, setFilter] = useState<"todos" | Kind>("todos");
  const [query, setQuery] = useState("");
  const [clienteFilter, setClienteFilter] = useState<string>("todos");
  const [campanhaFilter, setCampanhaFilter] = useState<string>("todas");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManualEntry | null>(null);
  const [viewing, setViewing] = useState<Entry | null>(null);

  const [paid, setPaidState] = useState<PaidMap>(() => loadPaid());
  const setPaid = (u: PaidMap | ((p: PaidMap) => PaidMap)) =>
    setPaidState((prev) => {
      const next = typeof u === "function" ? (u as (p: PaidMap) => PaidMap)(prev) : u;
      savePaid(next);
      return next;
    });
  const togglePaid = (id: string) =>
    setPaid((p) => {
      const next = { ...p };
      if (next[id]) delete next[id];
      else next[id] = todayISO();
      return next;
    });

  useEffect(() => {
    const onStorage = () => setPaidState(loadPaid());
    window.addEventListener("storage", onStorage);
    const int = window.setInterval(onStorage, 1500);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(int);
    };
  }, []);

  const entries: Entry[] = useFinanceiroEntries();

  const range = useMemo(() => {
    if (periodMode === "mes") {
      const d = fromMonthKey(month);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    }
    if (periodMode === "7dias") return { from: isoDaysAgo(6), to: todayISO() };
    if (periodMode === "30dias") return { from: isoDaysAgo(29), to: todayISO() };
    if (periodMode === "1ano") return { from: isoDaysAgo(365), to: todayISO() };
    return { from: customFrom, to: customTo };
  }, [periodMode, month, customFrom, customTo]);

  const monthEntries = useMemo(
    () => entries.filter((e) => e.date >= range.from && e.date <= range.to),
    [entries, range],
  );

  const clienteCampanhas = useMemo(() => {
    if (clienteFilter === "todos") return [];
    const cli = clientes.find((c) => c.id === clienteFilter);
    return cli?.campanhas ?? [];
  }, [clientes, clienteFilter]);

  useEffect(() => {
    if (clienteFilter === "todos") {
      setCampanhaFilter("todas");
    } else if (
      campanhaFilter !== "todas" &&
      !clienteCampanhas.some((c) => c.id === campanhaFilter)
    ) {
      setCampanhaFilter("todas");
    }
  }, [clienteFilter, clienteCampanhas, campanhaFilter]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monthEntries.filter((e) => {
      if (filter !== "todos" && e.kind !== filter) return false;
      if (clienteFilter !== "todos" && e.clienteId !== clienteFilter) return false;
      if (campanhaFilter !== "todas" && e.campanhaId !== campanhaFilter) return false;
      if (!q) return true;
      return (
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.meta ?? "").toLowerCase().includes(q) ||
        (e.clienteNome ?? "").toLowerCase().includes(q) ||
        (e.campanhaNome ?? "").toLowerCase().includes(q)
      );
    });
  }, [monthEntries, filter, query, clienteFilter, campanhaFilter]);

  const totals = useMemo(() => {
    let receita = 0;
    let despesa = 0;
    for (const e of visible) {
      if (e.kind === "receita") receita += e.amount;
      else despesa += e.amount;
    }
    return { receita, despesa, saldo: receita - despesa };
  }, [visible]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.date.slice(0, 7));
    set.add(monthKey(new Date()));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [entries]);

  const handleSave = (m: ManualEntry) => {
    setManual((p) =>
      p.some((x) => x.id === m.id) ? p.map((x) => (x.id === m.id ? m : x)) : [...p, m],
    );
    setOpen(false);
    setEditing(null);
  };

  const handleDelete = (e: Entry) => {
    if (!e.editable) return;
    setManual((p) => p.filter((x) => x.id !== e.id));
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <SectionHeader
        title="Financeiro"
        subtitle="Hub central — receitas, despesas, cachês, salários e vínculos."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={periodMode}
              onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {periodMode === "mes" && (
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              >
                {availableMonths.map((k) => (
                  <option key={k} value={k}>
                    {fmtMonth(k)}
                  </option>
                ))}
              </select>
            )}
            {periodMode === "personalizado" && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
            <button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Novo lançamento
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="flex gap-x-6 overflow-x-auto whitespace-nowrap pb-1">
        <Kpi label="Receitas" value={fmtBRL(totals.receita)} />
        <Kpi label="Despesas" value={fmtBRL(totals.despesa)} />
        <Kpi label="Saldo" value={fmtBRL(totals.saldo)} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border bg-background p-0.5">
          {(["todos", "receita", "despesa"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
                filter === k
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k === "todos" ? "Todos" : k + "s"}
            </button>
          ))}
        </div>

        <select
          value={clienteFilter}
          onChange={(e) => setClienteFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="todos">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.empresa}
            </option>
          ))}
        </select>

        <select
          value={campanhaFilter}
          onChange={(e) => setCampanhaFilter(e.target.value)}
          disabled={clienteFilter === "todos" || clienteCampanhas.length === 0}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          <option value="todas">Todas as campanhas</option>
          {clienteCampanhas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar"
            className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        {visible.length === 0 ? (
          <p className="px-4 py-12 text-center text-xs text-muted-foreground">
            Nenhum lançamento neste mês.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((e) => (
              <li
                key={e.id}
                onClick={() => setViewing(e)}
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
                    className={`truncate text-sm ${paid[e.id] ? "text-muted-foreground line-through" : "text-foreground"}`}
                  >
                    {e.description}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>
                      {e.kind === "despesa" ? "Vence " : ""}
                      {formatIsoDate(e.date)}
                    </span>
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
                    {e.kind === "despesa" && paid[e.id] && (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600">
                        <Check className="h-3 w-3" /> Pago {formatIsoDate(paid[e.id])}
                      </span>
                    )}
                    {e.kind === "despesa" && !paid[e.id] && e.date < todayISO() && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600">
                        <AlertCircle className="h-3 w-3" /> Vencido
                      </span>
                    )}
                    {e.source !== "manual" && (
                      <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        auto
                      </span>
                    )}
                  </div>
                </div>
                {e.kind === "despesa" && (
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      togglePaid(e.id);
                    }}
                    aria-label={paid[e.id] ? "Marcar como não pago" : "Marcar como pago"}
                    title={paid[e.id] ? "Marcar como não pago" : "Marcar como pago"}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      paid[e.id]
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-border bg-background text-transparent hover:border-foreground"
                    }`}
                  >
                    <Check className="h-3 w-3" />
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
                        const m = manual.find((x) => x.id === e.id);
                        if (m) {
                          setEditing(m);
                          setOpen(true);
                        }
                      }}
                      aria-label="Editar"
                      className="rounded p-1 hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleDelete(e);
                      }}
                      aria-label="Remover"
                      className="rounded p-1 hover:bg-muted"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <EntryDialog
          initial={editing}
          clientes={clientes.map((c) => ({
            id: c.id,
            nome: c.empresa,
            campanhas: (c.campanhas ?? []).map((k) => ({ id: k.id, nome: k.nome })),
          }))}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}

      {viewing && (
        <EntryDetailsDialog
          entry={viewing}
          paidAt={paid[viewing.id]}
          onTogglePaid={viewing.kind === "despesa" ? () => togglePaid(viewing.id) : undefined}
          onClose={() => setViewing(null)}
          onEdit={
            viewing.editable
              ? () => {
                  const m = manual.find((x) => x.id === viewing.id);
                  if (m) {
                    setEditing(m);
                    setOpen(true);
                    setViewing(null);
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex shrink-0 items-baseline gap-2 border-l border-border pl-6 first:border-l-0 first:pl-0">
      <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

type ClienteOpt = { id: string; nome: string; campanhas: { id: string; nome: string }[] };

function EntryDialog({
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
  const [amount, setAmount] = useState(initial ? String(initial.amount).replace(".", ",") : "");
  const [clienteId, setClienteId] = useState(initial?.clienteId ?? "");
  const [campanhaId, setCampanhaId] = useState(initial?.campanhaId ?? "");
  const [bank, setBank] = useState<BankInfo>(initial?.bank ?? {});
  const [showBank, setShowBank] = useState<boolean>(
    !!initial?.bank && Object.values(initial.bank).some(Boolean),
  );
  const [invoice, setInvoice] = useState<InvoiceFile | undefined>(initial?.invoice);
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const campanhas = useMemo(
    () => clientes.find((c) => c.id === clienteId)?.campanhas ?? [],
    [clientes, clienteId],
  );

  useEffect(() => {
    if (!clienteId) setCampanhaId("");
    else if (campanhaId && !campanhas.some((c) => c.id === campanhaId)) setCampanhaId("");
  }, [clienteId, campanhas, campanhaId]);

  const handleInvoicePick = (file: File | null) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setError("Anexo muito grande (máx 4MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setInvoice({ name: file.name, dataUrl: String(reader.result) });
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseMoney(amount);
    if (!description.trim() || amt <= 0 || !date) {
      setError("Preencha descrição, valor e data.");
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
      clienteId: clienteId || undefined,
      campanhaId: campanhaId || undefined,
      bank: bankFilled ? bank : undefined,
      invoice,
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
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">
            {initial ? "Editar lançamento" : "Novo lançamento"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(["receita", "despesa"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  kind === k
                    ? k === "receita"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-rose-500/10 text-rose-600"
                    : "text-muted-foreground"
                }`}
              >
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
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputCls}
                placeholder="0,00"
                inputMode="decimal"
                required
              />
            </Field>
            <Field label={kind === "despesa" ? "Vencimento" : "Data"}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
                required
              />
            </Field>
          </div>

          <Field label="Categoria">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
              placeholder="Ex: Software, Aluguel, Vendas..."
            />
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

          <div className="rounded-md border border-border">
            <button
              type="button"
              onClick={() => setShowBank((s) => !s)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50"
            >
              <span>Dados bancários {showBank ? "" : "(opcional)"}</span>
              <span className="text-muted-foreground">{showBank ? "−" : "+"}</span>
            </button>
            {showBank && (
              <div className="border-t border-border p-3">
                <BankFields value={bank} onChange={setBank} compact />
              </div>
            )}
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Nota fiscal (opcional)</span>
              <input
                ref={invoiceInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => handleInvoicePick(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => invoiceInputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
              >
                <Upload className="h-3 w-3" /> {invoice ? "Trocar" : "Anexar"}
              </button>
            </div>
            {invoice ? (
              <div className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1.5 text-xs">
                <span className="inline-flex items-center gap-1.5 truncate">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{invoice.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setInvoice(undefined)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover nota fiscal"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">PDF ou imagem, até 4MB.</p>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            {initial ? "Salvar" : "Adicionar"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function EntryDetailsDialog({
  entry,
  paidAt,
  onTogglePaid,
  onClose,
  onEdit,
}: {
  entry: Entry;
  paidAt?: string;
  onTogglePaid?: () => void;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const bankFilled =
    entry.bank && Object.values(entry.bank).some((v) => v && String(v).trim() !== "");
  const sourceLabel: Record<Source, string> = {
    manual: "Lançamento manual",
    influenciador: "Pagamento a influenciador",
    salario: "Salário (recorrência dia 15)",
    campanha: "Receita de campanha",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                entry.kind === "receita"
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-rose-500/10 text-rose-600"
              }`}
            >
              {entry.kind === "receita" ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
            </span>
            <h2 className="text-sm font-semibold">Detalhes do lançamento</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <div>
            <p className="text-base font-medium text-foreground">{entry.description}</p>
            <p
              className={`mt-1 text-lg font-semibold tabular-nums ${entry.kind === "receita" ? "text-emerald-600" : "text-rose-600"}`}
            >
              {entry.kind === "receita" ? "+" : "-"} {fmtBRL(entry.amount)}
            </p>
          </div>

          {onTogglePaid && (
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground">Status do pagamento</p>
                <p className="text-xs text-foreground">
                  {paidAt
                    ? `Pago em ${formatIsoDate(paidAt)}`
                    : entry.date < todayISO()
                      ? "Em aberto — vencido"
                      : "Em aberto"}
                </p>
              </div>
              <button
                type="button"
                onClick={onTogglePaid}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                  paidAt
                    ? "border border-border text-muted-foreground hover:text-foreground"
                    : "bg-emerald-600 text-white hover:opacity-90"
                }`}
              >
                <Check className="h-3 w-3" /> {paidAt ? "Marcar como não pago" : "Marcar como pago"}
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-xs">
            <DetailRow
              label={entry.kind === "despesa" ? "Vencimento" : "Data"}
              value={formatIsoDate(entry.date)}
            />

            <DetailRow label="Categoria" value={entry.category} />
            <DetailRow label="Tipo" value={entry.kind === "receita" ? "Receita" : "Despesa"} />
            <DetailRow label="Origem" value={sourceLabel[entry.source]} />
            {entry.clienteNome && (
              <DetailRow
                label="Cliente"
                value={
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    {entry.clienteNome}
                  </span>
                }
              />
            )}
            {entry.campanhaNome && <DetailRow label="Campanha" value={entry.campanhaNome} />}
            {entry.influencerName && (
              <DetailRow
                label="Influenciador"
                value={
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3 text-muted-foreground" />
                    {entry.influencerName}
                  </span>
                }
              />
            )}
            {entry.memberName && <DetailRow label="Membro" value={entry.memberName} />}
          </div>

          {bankFilled && entry.bank && (
            <div className="rounded-md border border-border">
              <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Dados bancários
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2 text-xs">
                {entry.bank.titular && <DetailRow label="Titular" value={entry.bank.titular} />}
                {entry.bank.cpfCnpj && <DetailRow label="CPF/CNPJ" value={entry.bank.cpfCnpj} />}
                {entry.bank.banco && <DetailRow label="Banco" value={entry.bank.banco} />}
                {entry.bank.agencia && <DetailRow label="Agência" value={entry.bank.agencia} />}
                {entry.bank.conta && <DetailRow label="Conta" value={entry.bank.conta} />}
                {entry.bank.tipoConta && <DetailRow label="Tipo" value={entry.bank.tipoConta} />}
                {entry.bank.pixTipo && <DetailRow label="PIX (tipo)" value={entry.bank.pixTipo} />}
                {entry.bank.pixChave && (
                  <DetailRow label="PIX (chave)" value={entry.bank.pixChave} />
                )}
              </div>
            </div>
          )}

          {entry.invoice && (
            <div className="rounded-md border border-border">
              <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Nota fiscal
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{entry.invoice.name}</span>
                </span>
                <a
                  href={entry.invoice.dataUrl}
                  download={entry.invoice.name}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted"
                >
                  <Download className="h-3 w-3" /> Baixar
                </a>
              </div>
            </div>
          )}

          {!entry.editable && (
            <p className="text-[11px] text-muted-foreground">
              Este lançamento é gerado automaticamente e não pode ser editado aqui — ajuste na
              origem (campanha, influenciador ou salário do membro).
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Fechar
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-foreground">{value}</p>
    </div>
  );
}
