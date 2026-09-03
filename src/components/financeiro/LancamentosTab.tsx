import { useState } from "react";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { useClientes } from "@/lib/clientes-store";
import {
  type Entry,
  type ManualEntry,
  loadManual,
  createManualEntry,
  updateManualEntry,
  deleteManualEntry,
} from "@/lib/financeiro-entries";
import { PERIOD_OPTIONS, type useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";
import { EntryRow } from "./EntryRow";
import { EntryDialog } from "./EntryDialog";
import { EntryDetailsDialog } from "./EntryDetailsDialog";
import { MarkAsPaidDialog } from "./MarkAsPaidDialog";
import { ImportDialog } from "./ImportDialog";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

export function LancamentosTab({
  filtered,
  importOpen,
  onImportOpenChange,
  syncError,
  onSyncError,
}: {
  filtered: Filtered;
  importOpen: boolean;
  onImportOpenChange: (open: boolean) => void;
  syncError: string | null;
  onSyncError: (msg: string | null) => void;
}) {
  const clientes = useClientes();
  const {
    visible,
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

  const [editing, setEditing] = useState<ManualEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<Entry | null>(null);
  const [markingPaid, setMarkingPaid] = useState<Entry | null>(null);
  const [showConcluded, setShowConcluded] = useState(false);

  const clienteCampanhas = filters.clienteId
    ? (clientes.find((c) => c.id === filters.clienteId)?.campanhas ?? [])
    : [];

  const openEntries = visible.filter(
    (e) => e.status !== "recebido" && e.status !== "pago" && e.status !== "cancelado",
  );
  const concludedEntries = visible.filter(
    (e) => e.status === "recebido" || e.status === "pago" || e.status === "cancelado",
  );

  const findManual = (id: string) => loadManual().find((x) => x.id === id) ?? null;

  const handleSave = async (m: ManualEntry) => {
    const isNew = !loadManual().some((x) => x.id === m.id);
    try {
      if (isNew) await createManualEntry(m);
      else await updateManualEntry(m);
      setDialogOpen(false);
      setEditing(null);
    } catch (err) {
      onSyncError(
        `Não foi possível salvar: ${err instanceof Error ? err.message : "erro desconhecido"}.`,
      );
    }
  };

  const handleDelete = async (e: Entry) => {
    if (!e.editable) return;
    try {
      await deleteManualEntry(e.id);
    } catch (err) {
      onSyncError(
        `Não foi possível apagar: ${err instanceof Error ? err.message : "erro desconhecido"}.`,
      );
    }
  };

  return (
    <div className="space-y-6">
      {syncError && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          <span>{syncError}</span>
          <button
            onClick={() => onSyncError(null)}
            className="shrink-0 cursor-pointer font-medium underline underline-offset-2"
          >
            fechar
          </button>
        </div>
      )}

      {importOpen && (
        <ImportDialog
          onClose={() => onImportOpenChange(false)}
          onImport={(entries) => {
            onImportOpenChange(false);
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
                onSyncError(
                  `${failed.length} de ${entries.length} lançamento(s) não foram importados: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "..." : ""}.`,
                );
              }
            })();
          }}
        />
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={periodMode}
          onChange={(e) => setPeriodMode(e.target.value as typeof periodMode)}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
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
              onClick={() => setFilters((f) => ({ ...f, tipo: k }))}
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
            setFilters((f) => ({
              ...f,
              clienteId: e.target.value === "todos" ? undefined : e.target.value,
              campanhaId: undefined,
            }))
          }
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
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
            setFilters((f) => ({
              ...f,
              campanhaId: e.target.value === "todas" ? undefined : e.target.value,
            }))
          }
          disabled={!filters.clienteId || clienteCampanhas.length === 0}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
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
              ? "Nenhum lançamento encontrado neste período."
              : "Nenhum lançamento em aberto neste período."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {openEntries.map((e) => (
              <EntryRow
                key={e.id}
                e={e}
                onView={() => setViewing(e)}
                onMarkPaid={() => setMarkingPaid(e)}
                onEdit={() => {
                  const m = findManual(e.id);
                  if (m) {
                    setEditing(m);
                    setDialogOpen(true);
                  }
                }}
                onDelete={() => void handleDelete(e)}
              />
            ))}
          </ul>
        )}
      </div>

      {concludedEntries.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <button
            type="button"
            onClick={() => setShowConcluded((v) => !v)}
            className="flex w-full cursor-pointer items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showConcluded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Concluídos ({concludedEntries.length})
          </button>
          {showConcluded && (
            <ul className="divide-y divide-border border-t border-border">
              {concludedEntries.map((e) => (
                <EntryRow
                  key={e.id}
                  e={e}
                  onView={() => setViewing(e)}
                  onMarkPaid={() => setMarkingPaid(e)}
                  onEdit={() => {
                    const m = findManual(e.id);
                    if (m) {
                      setEditing(m);
                      setDialogOpen(true);
                    }
                  }}
                  onDelete={() => void handleDelete(e)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {dialogOpen && (
        <EntryDialog
          initial={editing}
          clientes={clientes.map((c) => ({
            id: c.id,
            nome: c.empresa,
            campanhas: (c.campanhas ?? []).map((k) => ({ id: k.id, nome: k.nome })),
          }))}
          onClose={() => {
            setDialogOpen(false);
            setEditing(null);
          }}
          onSave={(m) => void handleSave(m)}
        />
      )}

      {viewing && (
        <EntryDetailsDialog
          entry={viewing}
          onClose={() => setViewing(null)}
          onMarkPaid={
            viewing.status !== "recebido" &&
            viewing.status !== "pago" &&
            viewing.status !== "cancelado"
              ? () => setMarkingPaid(viewing)
              : undefined
          }
          onEdit={
            viewing.editable
              ? () => {
                  const m = findManual(viewing.id);
                  if (m) {
                    setEditing(m);
                    setDialogOpen(true);
                    setViewing(null);
                  }
                }
              : undefined
          }
          onAnexosChange={
            viewing.editable
              ? async (anexos) => {
                  const m = findManual(viewing.id);
                  if (!m) return;
                  const next = { ...m, anexos };
                  try {
                    await updateManualEntry(next);
                    setViewing((v) => (v ? { ...v, anexos } : v));
                  } catch (err) {
                    onSyncError(
                      `Não foi possível salvar o anexo: ${err instanceof Error ? err.message : "erro desconhecido"}.`,
                    );
                  }
                }
              : undefined
          }
        />
      )}

      {markingPaid && (
        <MarkAsPaidDialog
          entry={markingPaid}
          onClose={() => setMarkingPaid(null)}
          onConfirmed={() => {
            setMarkingPaid(null);
            setViewing((v) => (v && v.id === markingPaid.id ? null : v));
          }}
        />
      )}
    </div>
  );
}
