import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterChips, FilterSearch } from "@/components/shared/FilterToolbar";
import { PeriodPicker } from "./PeriodPicker";
import { useClientes } from "@/lib/clientes-store";
import {
  type EntryStatus,
  type Source,
  categoriasFor,
  loadFinanceiroMembers,
} from "@/lib/financeiro-entries";
import {
  DEFAULT_FILTERS,
  type AdvancedFilters,
  type useFinanceiroFilteredEntries,
} from "./useFinanceiroFilteredEntries";
import { STATUS_LABEL } from "./shared";
import { NativeSelect } from "@/components/ui/native-select";

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
  return `h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand ${extra}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

export function AdvancedFilterBar({ filtered }: { filtered: Filtered }) {
  const clientes = useClientes();
  const { filters, setFilters } = filtered;

  const members = loadFinanceiroMembers();
  const clienteCampanhas = filters.clienteId
    ? (clientes.find((c) => c.id === filters.clienteId)?.campanhas ?? [])
    : [];
  // Bug pré-existente encontrado nesta etapa: receita e despesa
  // compartilham "Outros" como categoria, então concatenar as duas listas
  // sem dedupe fazia "Outros" aparecer 2x no select (mesmo `key` React,
  // warning de console) — `Set` remove a duplicata sem mudar nenhuma
  // categoria disponível.
  const categoriaOpts = [...new Set([...categoriasFor("receita"), ...categoriasFor("despesa")])];

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

  // Tudo que não é "busca" e "tipo" mora dentro de UM mecanismo (Filtros).
  const activeCount = chips.length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSearch
          value={filters.query}
          onChange={(v) => setF({ query: v })}
          placeholder="Buscar lançamentos..."
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {activeCount > 0 ? `Filtros · ${activeCount}` : "Filtros"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-h-[70vh] w-80 space-y-3 overflow-y-auto p-4">
            <div className="space-y-1">
              <span className="text-xs font-medium text-text-secondary">Status</span>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => toggleStatus(st)}
                    aria-pressed={filters.status.includes(st)}
                    className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      filters.status.includes(st)
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-text-secondary hover:text-foreground"
                    }`}
                  >
                    {STATUS_LABEL[st]}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Cliente">
              <NativeSelect
                value={filters.clienteId ?? "todos"}
                onChange={(e) =>
                  setF({
                    clienteId: e.target.value === "todos" ? undefined : e.target.value,
                    campanhaId: undefined,
                  })
                }
                className={inputCls()}
              >
                <option value="todos">Todos</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.empresa}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            {filters.clienteId && clienteCampanhas.length > 0 && (
              <Field label="Campanha">
                <NativeSelect
                  value={filters.campanhaId ?? "todas"}
                  onChange={(e) =>
                    setF({ campanhaId: e.target.value === "todas" ? undefined : e.target.value })
                  }
                  className={inputCls()}
                >
                  <option value="todas">Todas</option>
                  {clienteCampanhas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}

            <Field label="Categoria">
              <NativeSelect
                value={filters.categoria ?? "todas"}
                onChange={(e) =>
                  setF({ categoria: e.target.value === "todas" ? undefined : e.target.value })
                }
                className={inputCls()}
              >
                <option value="todas">Todas</option>
                {categoriaOpts.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Responsável">
              <NativeSelect
                value={filters.responsavelId ?? ""}
                onChange={(e) => setF({ responsavelId: e.target.value || undefined })}
                className={inputCls()}
              >
                <option value="">Todos</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Valor mínimo">
                <Input
                  type="number"
                  value={filters.valorMin ?? ""}
                  onChange={(e) =>
                    setF({ valorMin: e.target.value ? Number(e.target.value) : undefined })
                  }
                  className="h-9 text-sm"
                />
              </Field>
              <Field label="Valor máximo">
                <Input
                  type="number"
                  value={filters.valorMax ?? ""}
                  onChange={(e) =>
                    setF({ valorMax: e.target.value ? Number(e.target.value) : undefined })
                  }
                  className="h-9 text-sm"
                />
              </Field>
            </div>

            <Field label="Forma de pagamento">
              <Input
                value={filters.formaPagamento ?? ""}
                onChange={(e) => setF({ formaPagamento: e.target.value || undefined })}
                placeholder="PIX, transferência..."
                className="h-9 text-sm"
              />
            </Field>

            <Field label="Origem">
              <NativeSelect
                value={filters.origem ?? ""}
                onChange={(e) =>
                  setF({ origem: (e.target.value || undefined) as Source | undefined })
                }
                className={inputCls()}
              >
                <option value="">Todas</option>
                {(Object.keys(SOURCE_LABEL) as Source[]).map((so) => (
                  <option key={so} value={so}>
                    {SOURCE_LABEL[so]}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <div className="flex items-center gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filters.possuiNotaFiscal ?? false}
                  onChange={(e) => setF({ possuiNotaFiscal: e.target.checked ? true : undefined })}
                />
                Possui NF
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filters.possuiComprovante ?? false}
                  onChange={(e) => setF({ possuiComprovante: e.target.checked ? true : undefined })}
                />
                Possui comprovante
              </label>
            </div>
          </PopoverContent>
        </Popover>

        {/* Contexto (não é filtro): vale para a lista e para os KPIs; não gera chip. */}
        <PeriodPicker filtered={filtered} />
      </div>

      <FilterChips
        chips={chips.map((c) => ({ id: c.key, label: c.label, onRemove: c.onRemove }))}
        onClear={() => setFilters({ ...DEFAULT_FILTERS, tipo: filters.tipo, query: filters.query })}
      />
    </div>
  );
}
