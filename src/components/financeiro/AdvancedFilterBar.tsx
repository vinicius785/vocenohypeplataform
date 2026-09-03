import { useState } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { useClientes } from "@/lib/clientes-store";
import {
  type EntryStatus,
  type Source,
  categoriasFor,
  loadFinanceiroMembers,
} from "@/lib/financeiro-entries";
import {
  PERIOD_OPTIONS,
  DEFAULT_FILTERS,
  type AdvancedFilters,
  type useFinanceiroFilteredEntries,
} from "./useFinanceiroFilteredEntries";
import { STATUS_LABEL } from "./shared";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

const STATUS_OPTIONS: EntryStatus[] = [
  "a_receber",
  "recebido",
  "a_pagar",
  "pago",
  "vencido",
  "cancelado",
];
const SOURCE_LABEL: Record<Source, string> = {
  manual: "Lançamento manual",
  influenciador: "Influenciador",
  salario: "Salário",
  campanha: "Campanha",
};

function inputCls(extra = "") {
  return `h-8 cursor-pointer rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring ${extra}`;
}

export function AdvancedFilterBar({ filtered }: { filtered: Filtered }) {
  const clientes = useClientes();
  const {
    periodMode,
    setPeriodMode,
    anchorMonth,
    setAnchorMonth,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    filters,
    setFilters,
  } = filtered;
  const [moreOpen, setMoreOpen] = useState(false);

  const members = loadFinanceiroMembers();
  const clienteCampanhas = filters.clienteId
    ? (clientes.find((c) => c.id === filters.clienteId)?.campanhas ?? [])
    : [];
  const categoriaOpts = [...categoriasFor("receita"), ...categoriasFor("despesa")];

  const setF = (patch: Partial<AdvancedFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleStatus = (s: EntryStatus) =>
    setF({
      status: filters.status.includes(s)
        ? filters.status.filter((x) => x !== s)
        : [...filters.status, s],
    });

  // Chips das colunas ativas — cada um removível individualmente, sem
  // precisar abrir o popover de novo pra tirar só um filtro.
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.tipo !== "todos")
    chips.push({
      key: "tipo",
      label: filters.tipo === "receita" ? "Receitas" : "Despesas",
      onRemove: () => setF({ tipo: "todos" }),
    });
  for (const s of filters.status)
    chips.push({ key: `status-${s}`, label: STATUS_LABEL[s], onRemove: () => toggleStatus(s) });
  if (filters.clienteId) {
    const nome = clientes.find((c) => c.id === filters.clienteId)?.empresa ?? "Cliente";
    chips.push({
      key: "cliente",
      label: nome,
      onRemove: () => setF({ clienteId: undefined, campanhaId: undefined }),
    });
  }
  if (filters.campanhaId) {
    const nome = clienteCampanhas.find((c) => c.id === filters.campanhaId)?.nome ?? "Campanha";
    chips.push({ key: "campanha", label: nome, onRemove: () => setF({ campanhaId: undefined }) });
  }
  if (filters.categoria)
    chips.push({
      key: "categoria",
      label: filters.categoria,
      onRemove: () => setF({ categoria: undefined }),
    });
  if (filters.responsavelId) {
    const nome = members.find((m) => m.id === filters.responsavelId)?.name ?? "Responsável";
    chips.push({
      key: "responsavel",
      label: nome,
      onRemove: () => setF({ responsavelId: undefined }),
    });
  }
  if (filters.valorMin != null)
    chips.push({
      key: "valorMin",
      label: `Valor ≥ ${filters.valorMin}`,
      onRemove: () => setF({ valorMin: undefined }),
    });
  if (filters.valorMax != null)
    chips.push({
      key: "valorMax",
      label: `Valor ≤ ${filters.valorMax}`,
      onRemove: () => setF({ valorMax: undefined }),
    });
  if (filters.formaPagamento)
    chips.push({
      key: "forma",
      label: filters.formaPagamento,
      onRemove: () => setF({ formaPagamento: undefined }),
    });
  if (filters.origem)
    chips.push({
      key: "origem",
      label: SOURCE_LABEL[filters.origem],
      onRemove: () => setF({ origem: undefined }),
    });
  if (filters.possuiNotaFiscal != null)
    chips.push({
      key: "nf",
      label: filters.possuiNotaFiscal ? "Com NF" : "Sem NF",
      onRemove: () => setF({ possuiNotaFiscal: undefined }),
    });
  if (filters.possuiComprovante != null)
    chips.push({
      key: "comp",
      label: filters.possuiComprovante ? "Com comprovante" : "Sem comprovante",
      onRemove: () => setF({ possuiComprovante: undefined }),
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={periodMode}
          onChange={(e) => setPeriodMode(e.target.value as typeof periodMode)}
          className={inputCls()}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {(periodMode === "este_mes" || periodMode === "mes_passado") && (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAnchorMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="cursor-pointer rounded-md border border-border px-1.5 py-1 text-xs hover:bg-muted"
              aria-label="Mês anterior"
            >
              ‹
            </button>
            <span className="min-w-24 text-center text-xs text-muted-foreground">
              {anchorMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              onClick={() => setAnchorMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="cursor-pointer rounded-md border border-border px-1.5 py-1 text-xs hover:bg-muted"
              aria-label="Próximo mês"
            >
              ›
            </button>
          </div>
        )}
        {periodMode === "personalizado" && (
          <div className="flex items-center gap-1.5">
            <DateField
              value={customFrom}
              onChange={(v) => setCustomFrom(v ?? customFrom)}
              max={customTo}
              className="h-8 text-xs"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <DateField
              value={customTo}
              onChange={(v) => setCustomTo(v ?? customTo)}
              min={customFrom}
              className="h-8 text-xs"
            />
          </div>
        )}

        <div className="inline-flex rounded-md border border-border bg-background p-0.5">
          {(["todos", "receita", "despesa"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setF({ tipo: k })}
              className={`cursor-pointer rounded px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
                filters.tipo === k
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k === "todos" ? "Todos" : k + "s"}
            </button>
          ))}
        </div>

        <select
          value={filters.clienteId ?? "todos"}
          onChange={(e) =>
            setF({
              clienteId: e.target.value === "todos" ? undefined : e.target.value,
              campanhaId: undefined,
            })
          }
          className={inputCls()}
        >
          <option value="todos">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.empresa}
            </option>
          ))}
        </select>

        <select
          value={filters.campanhaId ?? "todas"}
          onChange={(e) =>
            setF({ campanhaId: e.target.value === "todas" ? undefined : e.target.value })
          }
          disabled={!filters.clienteId || clienteCampanhas.length === 0}
          className={inputCls("disabled:cursor-not-allowed disabled:opacity-50")}
        >
          <option value="todas">Todas as campanhas</option>
          {clienteCampanhas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>

        <select
          value={filters.categoria ?? "todas"}
          onChange={(e) =>
            setF({ categoria: e.target.value === "todas" ? undefined : e.target.value })
          }
          className={inputCls()}
        >
          <option value="todas">Todas as categorias</option>
          {categoriaOpts.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filters.query}
            onChange={(e) => setF({ query: e.target.value })}
            placeholder="Buscar"
            className="h-8 w-48 rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <SlidersHorizontal className="h-3 w-3" />+ Filtros
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-72 space-y-3 rounded-lg border border-border bg-popover p-3.5 text-xs shadow-lg">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Status
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleStatus(s)}
                      className={`cursor-pointer rounded-full border px-2 py-0.5 text-[11px] ${
                        filters.status.includes(s)
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Responsável
                </label>
                <select
                  value={filters.responsavelId ?? ""}
                  onChange={(e) => setF({ responsavelId: e.target.value || undefined })}
                  className={inputCls("w-full")}
                >
                  <option value="">Todos</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    Valor mín.
                  </label>
                  <input
                    type="number"
                    value={filters.valorMin ?? ""}
                    onChange={(e) =>
                      setF({ valorMin: e.target.value ? Number(e.target.value) : undefined })
                    }
                    className={inputCls("w-full")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    Valor máx.
                  </label>
                  <input
                    type="number"
                    value={filters.valorMax ?? ""}
                    onChange={(e) =>
                      setF({ valorMax: e.target.value ? Number(e.target.value) : undefined })
                    }
                    className={inputCls("w-full")}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Forma de pagamento
                </label>
                <input
                  value={filters.formaPagamento ?? ""}
                  onChange={(e) => setF({ formaPagamento: e.target.value || undefined })}
                  placeholder="PIX, transferência..."
                  className={inputCls("w-full")}
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Origem
                </label>
                <select
                  value={filters.origem ?? ""}
                  onChange={(e) =>
                    setF({ origem: (e.target.value || undefined) as Source | undefined })
                  }
                  className={inputCls("w-full")}
                >
                  <option value="">Todas</option>
                  {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={filters.possuiNotaFiscal ?? false}
                    onChange={(e) =>
                      setF({ possuiNotaFiscal: e.target.checked ? true : undefined })
                    }
                  />
                  Possui NF
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={filters.possuiComprovante ?? false}
                    onChange={(e) =>
                      setF({ possuiComprovante: e.target.checked ? true : undefined })
                    }
                  />
                  Possui comprovante
                </label>
              </div>

              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="w-full cursor-pointer rounded-md bg-foreground py-1.5 text-xs font-medium text-background hover:opacity-90"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onRemove}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
            >
              {c.label}
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="cursor-pointer text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Limpar filtros
          </button>
        </div>
      )}
    </div>
  );
}
