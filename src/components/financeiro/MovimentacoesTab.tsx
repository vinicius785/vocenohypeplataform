import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { useClientes } from "@/lib/clientes-store";
import {
  type Entry,
  type ManualEntry,
  loadManual,
  createManualEntry,
  updateManualEntry,
  deleteManualEntry,
} from "@/lib/financeiro-entries";
import type { useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";
import { AdvancedFilterBar } from "./AdvancedFilterBar";
import { EntryRow } from "./EntryRow";
import { EntryDialog } from "./EntryDialog";
import { EntryDetailsDialog } from "./EntryDetailsDialog";
import { MarkAsPaidDialog } from "./MarkAsPaidDialog";
import { ImportDialog } from "./ImportDialog";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

const PAGE_SIZE = 30;

/** Exporta exatamente o que está visível na tela (já filtrado/no período) —
 * mesma técnica de CSV (Blob + BOM) já usada em `InfluencerBoard.tsx`, sem
 * introduzir uma lib de planilha nova. */
function exportCsv(entries: Entry[]) {
  const header = [
    "Descrição",
    "Tipo",
    "Cliente/Favorecido",
    "Campanha",
    "Categoria",
    "Competência",
    "Vencimento",
    "Status",
    "Valor",
  ];
  const rows = entries.map((e) => [
    e.description,
    e.kind === "receita" ? "Receita" : "Despesa",
    e.clienteNome ?? "",
    e.campanhaNome ?? "",
    e.category,
    e.competencia,
    e.vencimento,
    e.status,
    e.amount.toFixed(2).replace(".", ","),
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `movimentacoes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function MovimentacoesTab({
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
  const { visible } = filtered;

  const [editing, setEditing] = useState<ManualEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<Entry | null>(null);
  const [markingPaid, setMarkingPaid] = useState<Entry | null>(null);
  const [showConcluded, setShowConcluded] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const openEntries = visible.filter(
    (e) => e.status !== "recebido" && e.status !== "pago" && e.status !== "cancelado",
  );
  const concludedEntries = visible.filter(
    (e) => e.status === "recebido" || e.status === "pago" || e.status === "cancelado",
  );

  const totalPages = Math.max(1, Math.ceil(openEntries.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const pagedOpen = useMemo(
    () => openEntries.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE),
    [openEntries, pageSafe],
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

  const editableSelected = [...selected].filter((id) => visible.find((e) => e.id === id)?.editable);

  const handleBulkDelete = async () => {
    if (editableSelected.length === 0) return;
    if (
      !window.confirm(
        `Excluir ${editableSelected.length} lançamento${editableSelected.length > 1 ? "s" : ""} selecionado${editableSelected.length > 1 ? "s" : ""}? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    for (const id of editableSelected) {
      try {
        await deleteManualEntry(id);
      } catch (err) {
        console.warn("[financeiro] bulk delete failed for", id, err);
      }
    }
    setSelected(new Set());
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <AdvancedFilterBar filtered={filtered} />
        <div className="flex items-center gap-2">
          {editableSelected.length > 0 && (
            <button
              type="button"
              onClick={() => void handleBulkDelete()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 py-1.5 text-[11px] font-medium text-destructive hover:bg-destructive/10"
            >
              Excluir {editableSelected.length} selecionado{editableSelected.length > 1 ? "s" : ""}
            </button>
          )}
          <button
            type="button"
            onClick={() => exportCsv(visible)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Download className="h-3 w-3" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        {pagedOpen.length === 0 ? (
          <p className="px-4 py-12 text-center text-xs text-muted-foreground">
            {visible.length === 0
              ? "Nenhum lançamento encontrado neste período."
              : "Nenhum lançamento em aberto neste período."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {pagedOpen.map((e) => (
              <li key={e.id} className="flex items-center">
                {e.editable && (
                  <input
                    type="checkbox"
                    checked={selected.has(e.id)}
                    onChange={() => toggleSelect(e.id)}
                    onClick={(ev) => ev.stopPropagation()}
                    className="ml-4 cursor-pointer"
                    aria-label="Selecionar lançamento"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <EntryRow
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            disabled={pageSafe === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="cursor-pointer rounded-md border border-border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <span>
            Página {pageSafe + 1} de {totalPages} · {openEntries.length} lançamentos em aberto
          </span>
          <button
            type="button"
            disabled={pageSafe >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="cursor-pointer rounded-md border border-border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}

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
