import { useEffect, useMemo, useRef, useState } from "react";
import { DateField } from "@/components/ui/date-field";
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
  Loader2,
  Paperclip,
  Info,
  Landmark,
  Calendar,
  Tag,
  ArrowRightLeft,
  Copy,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { SectionHeader } from "./SectionHeader";
import { FormattedNumberInput } from "./ui/formatted-number-input";
import { useClientes } from "@/lib/clientes-store";
import { BankFields, type BankInfo } from "./CampanhasSection";
import {
  type Entry,
  type ManualEntry,
  type FinanceiroAnexo,
  type FinanceiroAnexoCategoria,
  type Kind,
  type Source,
  useFinanceiroEntries,
  loadPaid,
  savePaid,
  type PaidMap,
  loadManual,
  createManualEntry,
  updateManualEntry,
  deleteManualEntry,
  onManualChange,
  uploadFinanceiroAnexo,
  entryAnexos,
  categoriasFor,
  fmtBRL,
  parseMoney,
  monthKey,
  fromMonthKey,
  fmtMonth,
  todayISO,
  formatIsoDate,
} from "@/lib/financeiro-entries";
import { parseCsv, parseFlexibleDate } from "@/lib/csv";

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
  const [syncError, setSyncError] = useState<string | null>(null);

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
  const [importOpen, setImportOpen] = useState(false);

  // Sem isso, `manual` só refletia o que essa própria aba salvava — um
  // lançamento criado por SQL direto, outra aba, ou o eco do realtime
  // aparecia na lista (que lê de `useFinanceiroEntries`, já reativo) mas o
  // clique em editar buscava em `manual` desatualizado, achava nada e não
  // fazia nada, silenciosamente.
  useEffect(() => onManualChange(() => setManualState(loadManual())), []);

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

  // Só despesa tem conceito de "pago" — receita fica sempre na lista
  // principal. Pagas saem da lista de "em aberto" e vão pra uma lista à
  // parte, recolhida por padrão, pra não poluir o que ainda precisa de
  // atenção (fluxo de pagamentos, não um extrato completo).
  const openEntries = useMemo(
    () => visible.filter((e) => !(e.kind === "despesa" && paid[e.id])),
    [visible, paid],
  );
  const paidEntries = useMemo(
    () => visible.filter((e) => e.kind === "despesa" && paid[e.id]),
    [visible, paid],
  );
  const [showPaid, setShowPaid] = useState(false);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.date.slice(0, 7));
    set.add(monthKey(new Date()));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [entries]);

  const handleSave = async (m: ManualEntry) => {
    const isNew = !manual.some((x) => x.id === m.id);
    try {
      if (isNew) await createManualEntry(m);
      else await updateManualEntry(m);
      setOpen(false);
      setEditing(null);
    } catch (err) {
      setSyncError(
        `Não foi possível salvar: ${err instanceof Error ? err.message : "erro desconhecido"}.`,
      );
    }
  };

  const handleDelete = async (e: Entry) => {
    if (!e.editable) return;
    try {
      await deleteManualEntry(e.id);
    } catch (err) {
      setSyncError(
        `Não foi possível apagar: ${err instanceof Error ? err.message : "erro desconhecido"}.`,
      );
    }
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
                <DateField
                  value={customFrom || undefined}
                  onChange={(v) => setCustomFrom(v ?? "")}
                  max={customTo || undefined}
                  className="h-8 text-xs"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <DateField
                  value={customTo || undefined}
                  onChange={(v) => setCustomTo(v ?? "")}
                  min={customFrom || undefined}
                  className="h-8 text-xs"
                />
              </div>
            )}
            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Upload className="h-3.5 w-3.5" /> Importar lista
            </button>
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

      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onImport={(entries) => {
            setImportOpen(false);
            void (async () => {
              const failed: string[] = [];
              for (const entry of entries) {
                try {
                  await createManualEntry(entry);
                } catch (err) {
                  failed.push(entry.description);
                  console.warn("[financeiro] import entry failed", entry, err);
                }
              }
              if (failed.length > 0) {
                setSyncError(
                  `${failed.length} de ${entries.length} lançamento(s) não foram importados: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "..." : ""}.`,
                );
              }
            })();
          }}
        />
      )}

      {syncError && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          <span>{syncError}</span>
          <button
            onClick={() => setSyncError(null)}
            className="shrink-0 font-medium underline underline-offset-2"
          >
            fechar
          </button>
        </div>
      )}

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
        {openEntries.length === 0 ? (
          <p className="px-4 py-12 text-center text-xs text-muted-foreground">
            {visible.length === 0
              ? "Nenhum lançamento neste mês."
              : "Nenhum lançamento em aberto neste mês."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {openEntries.map((e) => (
              <EntryRow
                key={e.id}
                e={e}
                paid={paid}
                onView={() => setViewing(e)}
                onTogglePaid={() => togglePaid(e.id)}
                onEdit={() => {
                  const m = manual.find((x) => x.id === e.id);
                  if (m) {
                    setEditing(m);
                    setOpen(true);
                  }
                }}
                onDelete={() => handleDelete(e)}
              />
            ))}
          </ul>
        )}
      </div>

      {paidEntries.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <button
            type="button"
            onClick={() => setShowPaid((v) => !v)}
            className="flex w-full items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showPaid ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Pagos ({paidEntries.length})
          </button>
          {showPaid && (
            <ul className="divide-y divide-border border-t border-border">
              {paidEntries.map((e) => (
                <EntryRow
                  key={e.id}
                  e={e}
                  paid={paid}
                  onView={() => setViewing(e)}
                  onTogglePaid={() => togglePaid(e.id)}
                  onEdit={() => {
                    const m = manual.find((x) => x.id === e.id);
                    if (m) {
                      setEditing(m);
                      setOpen(true);
                    }
                  }}
                  onDelete={() => handleDelete(e)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

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
          onAnexosChange={
            viewing.editable
              ? async (anexos) => {
                  const m = manual.find((x) => x.id === viewing.id);
                  if (!m) return;
                  const next = { ...m, anexos };
                  try {
                    await updateManualEntry(next);
                    setViewing((v) => (v ? { ...v, anexos } : v));
                  } catch (err) {
                    setSyncError(
                      `Não foi possível salvar o anexo: ${err instanceof Error ? err.message : "erro desconhecido"}.`,
                    );
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function EntryRow({
  e,
  paid,
  onView,
  onTogglePaid,
  onEdit,
  onDelete,
}: {
  e: Entry;
  paid: PaidMap;
  onView: () => void;
  onTogglePaid: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
            onTogglePaid();
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
              onEdit();
            }}
            aria-label="Editar"
            className="rounded p-1 hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              onDelete();
            }}
            aria-label="Remover"
            className="rounded p-1 hover:bg-muted"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      )}
    </li>
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
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
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
                className={`inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold capitalize transition-colors ${
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
            <Field label={kind === "despesa" ? "Vencimento" : "Data"}>
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
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-foreground hover:bg-muted/50"
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

type ColRole = "ignore" | "description" | "amount" | "date" | "status";
const COL_ROLE_LABEL: Record<ColRole, string> = {
  ignore: "Ignorar",
  description: "Descrição",
  amount: "Valor",
  date: "Data",
  status: "Status",
};

function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (entries: ManualEntry[]) => void;
}) {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [roles, setRoles] = useState<ColRole[]>([]);
  const [pendingFilter, setPendingFilter] = useState("a fazer");
  const [defaultKind, setDefaultKind] = useState<Kind>("despesa");
  const [defaultCategory, setDefaultCategory] = useState("Importado do ClickUp");
  const [importing, setImporting] = useState(false);

  const parse = () => {
    const parsed = parseCsv(raw);
    if (parsed.length === 0) return;
    setRows(parsed);
    // Heurística simples: se a primeira linha tem palavras como "nome",
    // "descrição", "status" etc., é cabeçalho — senão, ainda mostramos ela
    // como dado normal (nada é perdido, só o mapeamento de colunas ajuda).
    const cols = parsed[0].length;
    setRoles(Array.from({ length: cols }, () => "ignore"));
  };

  const statusColIdx = roles.indexOf("status");
  const descColIdx = roles.indexOf("description");
  const amountColIdx = roles.indexOf("amount");
  const dateColIdx = roles.indexOf("date");

  const preview = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((r) => {
        if (statusColIdx === -1) return true;
        const s = (r[statusColIdx] ?? "").trim().toLowerCase();
        if (!pendingFilter.trim()) return true;
        return s.includes(pendingFilter.trim().toLowerCase());
      })
      .map((r) => {
        const description = descColIdx !== -1 ? (r[descColIdx] ?? "").trim() : r.join(" ").trim();
        const amount = amountColIdx !== -1 ? parseMoney(r[amountColIdx]) : 0;
        const date =
          dateColIdx !== -1 ? parseFlexibleDate(r[dateColIdx] ?? "") || todayISO() : todayISO();
        return { description, amount, date };
      })
      .filter((r) => r.description);
  }, [rows, roles, pendingFilter, statusColIdx, descColIdx, amountColIdx, dateColIdx]);

  const handleImport = () => {
    if (importing) return;
    setImporting(true);
    const entries: ManualEntry[] = preview.map((p) => ({
      id: crypto.randomUUID(),
      date: p.date,
      description: p.description,
      category: defaultCategory,
      amount: p.amount,
      kind: defaultKind,
    }));
    onImport(entries);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Importar lista (ClickUp ou outra planilha)</h2>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!rows ? (
            <>
              <p className="text-xs text-muted-foreground">
                Selecione as linhas na sua lista (ClickUp, planilha, etc.) e copie — cole o conteúdo
                aqui. Se a origem tinha colunas, elas são preservadas.
              </p>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="Cole aqui..."
                rows={10}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                disabled={!raw.trim()}
                onClick={parse}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
              >
                Analisar
              </button>
            </>
          ) : (
            <>
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  O que cada coluna representa
                </p>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role, i) => (
                    <label key={i} className="flex flex-col gap-1">
                      <span className="truncate text-[10px] text-muted-foreground">
                        Coluna {i + 1}: "{(rows[0][i] ?? "").slice(0, 20) || "—"}"
                      </span>
                      <select
                        value={role}
                        onChange={(e) =>
                          setRoles((prev) =>
                            prev.map((r, idx) => (idx === i ? (e.target.value as ColRole) : r)),
                          )
                        }
                        className="h-8 rounded-md border border-input bg-background px-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                      >
                        {(Object.keys(COL_ROLE_LABEL) as ColRole[]).map((r) => (
                          <option key={r} value={r}>
                            {COL_ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              {statusColIdx !== -1 && (
                <Field label="Só importar linhas cujo status contenha (deixe vazio pra trazer todas)">
                  <input
                    value={pendingFilter}
                    onChange={(e) => setPendingFilter(e.target.value)}
                    placeholder="a fazer"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo padrão">
                  <select
                    value={defaultKind}
                    onChange={(e) => setDefaultKind(e.target.value as Kind)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="despesa">Despesa</option>
                    <option value="receita">Receita</option>
                  </select>
                </Field>
                <Field label="Categoria padrão">
                  <input
                    value={defaultCategory}
                    onChange={(e) => setDefaultCategory(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </Field>
              </div>

              {amountColIdx === -1 && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  Nenhuma coluna de valor selecionada — os lançamentos entrarão com R$ 0,00, pra
                  você preencher depois em cada um.
                </p>
              )}
              {dateColIdx === -1 && (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Nenhuma coluna de data selecionada — os lançamentos entrarão com a data de hoje.
                </p>
              )}

              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Prévia ({preview.length} {preview.length === 1 ? "lançamento" : "lançamentos"})
                </p>
                <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-border">
                      {preview.slice(0, 50).map((p, i) => (
                        <tr key={i}>
                          <td className="truncate px-2 py-1.5">{p.description}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                            {formatIsoDate(p.date)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium">
                            {fmtBRL(p.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.length > 50 && (
                    <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                      + {preview.length - 50} outros...
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {rows && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={() => setRows(null)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={preview.length === 0 || importing}
              onClick={handleImport}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {importing
                ? "Importando..."
                : `Importar ${preview.length} ${preview.length === 1 ? "lançamento" : "lançamentos"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Card com ícone + título usado nos diálogos de lançamento (detalhes e
 * formulário) — mesma moldura em toda seção, em vez de cada bloco ter seu
 * próprio estilo de cabeçalho/borda. */
function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-background p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
            {icon}
          </span>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Box de upload por categoria (Comprovante / Nota fiscal) — usado tanto no
 * formulário de criar/editar quanto direto nos detalhes do lançamento, sem
 * precisar entrar em modo de edição pra anexar ou abrir um arquivo. */
function FinanceiroAnexoBox({
  categoria,
  anexos,
  onChange,
}: {
  categoria: FinanceiroAnexoCategoria;
  anexos: FinanceiroAnexo[];
  onChange: (next: FinanceiroAnexo[]) => void;
}) {
  const items = anexos.filter((a) => a.categoria === categoria);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handlePick = async (file: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Máx 10MB.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const url = await uploadFinanceiroAnexo(file);
      if (!url) {
        setError("Falha ao subir.");
        return;
      }
      onChange([
        ...anexos,
        { id: crypto.randomUUID(), categoria, nome: file.name, url, criadoEm: todayISO() },
      ]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{categoria}</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            if (inputRef.current) inputRef.current.value = "";
            void handlePick(file);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Paperclip className="h-3 w-3" />
          )}
          {uploading ? "Enviando..." : "Adicionar"}
        </button>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded bg-muted/40 px-2 py-1.5 text-xs"
            >
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                download={a.nome}
                className="inline-flex min-w-0 flex-1 items-center gap-1.5 hover:underline"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{a.nome}</span>
              </a>
              <button
                type="button"
                onClick={() => onChange(anexos.filter((x) => x.id !== a.id))}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Remover anexo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">Nenhum arquivo ainda.</p>
      )}
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function EntryDetailsDialog({
  entry,
  paidAt,
  onTogglePaid,
  onClose,
  onEdit,
  onAnexosChange,
}: {
  entry: Entry;
  paidAt?: string;
  onTogglePaid?: () => void;
  onClose: () => void;
  onEdit?: () => void;
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
  const vencido = !paidAt && entry.kind === "despesa" && entry.date < todayISO();

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
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
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

          {onTogglePaid && (
            <Section
              title="Pagamento"
              icon={<Wallet className="h-4 w-4" />}
              action={
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    paidAt
                      ? "bg-emerald-500/10 text-emerald-600"
                      : vencido
                        ? "bg-rose-500/10 text-rose-600"
                        : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  {paidAt ? "Pago" : vencido ? "Vencido" : "Em aberto"}
                </span>
              }
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {paidAt
                    ? `Pago em ${formatIsoDate(paidAt)}`
                    : `Vencimento ${formatIsoDate(entry.date)}`}
                </p>
                <button
                  type="button"
                  onClick={onTogglePaid}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                    paidAt
                      ? "border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      : "bg-emerald-600 text-white hover:opacity-90"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                  {paidAt ? "Marcar como não pago" : "Marcar como pago"}
                </button>
              </div>
            </Section>
          )}

          <Section title="Detalhes" icon={<Info className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <DetailRow
                icon={<Calendar className="h-3 w-3" />}
                label={entry.kind === "despesa" ? "Vencimento" : "Data"}
                value={formatIsoDate(entry.date)}
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

/** Chave PIX vem só pra leitura na maioria dos casos — copiar na mão pra
 * fazer o pagamento é o fluxo real, por isso o botão fica junto do valor
 * em vez de precisar selecionar o texto manualmente. */
function CopyPixButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
      title="Copiar chave PIX"
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="flex items-center gap-1.5 truncate text-foreground">
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        {value}
      </p>
    </div>
  );
}
