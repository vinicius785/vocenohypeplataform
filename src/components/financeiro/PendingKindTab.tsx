import { useMemo, useState } from "react";
import { useClientes } from "@/lib/clientes-store";
import {
  type Entry,
  type ManualEntry,
  type Kind,
  fmtBRL,
  sortByUrgency,
  todayISO,
  loadManual,
  createManualEntry,
  updateManualEntry,
  deleteManualEntry,
} from "@/lib/financeiro-entries";
import { matchesFilters, type useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";
import { Kpi } from "./shared";
import { EntryRow } from "./EntryRow";
import { EntryDialog } from "./EntryDialog";
import { EntryDetailsDialog } from "./EntryDetailsDialog";
import { MarkAsPaidDialog } from "./MarkAsPaidDialog";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

function daysFromToday(iso: string): number {
  return Math.round((Date.parse(iso) - Date.parse(todayISO())) / 86_400_000);
}

/** "A receber"/"A pagar" mostram TUDO que está pendente daquele tipo —
 * não ficam presas à janela do período selecionado no topo (que é "este
 * mês", "hoje" etc.), já que uma conta a vencer daqui a 40 dias ainda
 * precisa aparecer aqui. Respeitam os OUTROS filtros ativos (cliente,
 * campanha, categoria, busca), só não o recorte de período. */
export function PendingKindTab({ filtered, kind }: { filtered: Filtered; kind: Kind }) {
  const { all, filters } = filtered;
  const clientes = useClientes();
  const [viewing, setViewing] = useState<Entry | null>(null);
  const [markingPaid, setMarkingPaid] = useState<Entry | null>(null);
  const [editing, setEditing] = useState<ManualEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const pending = useMemo(() => {
    const openStatus = kind === "receita" ? "a_receber" : "a_pagar";
    return sortByUrgency(
      all.filter(
        (e) =>
          e.kind === kind &&
          (e.status === openStatus || e.status === "vencido") &&
          matchesFilters(e, { ...filters, tipo: "todos" }),
      ),
    );
  }, [all, filters, kind]);

  const totals = useMemo(() => {
    let total = 0;
    let vencido = 0;
    let proximos7 = 0;
    let proximos30 = 0;
    for (const e of pending) {
      total += e.amount;
      if (e.status === "vencido") vencido += e.amount;
      const days = daysFromToday(e.vencimento);
      if (days >= 0 && days <= 7) proximos7 += e.amount;
      if (days >= 0 && days <= 30) proximos30 += e.amount;
    }
    return { total, vencido, proximos7, proximos30 };
  }, [pending]);

  const findManual = (id: string) => loadManual().find((x) => x.id === id) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-x-6 gap-y-3 overflow-x-auto pb-1">
        <Kpi
          label={kind === "receita" ? "Total a receber" : "Total a pagar"}
          value={fmtBRL(totals.total)}
        />
        <Kpi label="Vencido" value={fmtBRL(totals.vencido)} />
        <Kpi label="Próximos 7 dias" value={fmtBRL(totals.proximos7)} />
        <Kpi label="Próximos 30 dias" value={fmtBRL(totals.proximos30)} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        {pending.length === 0 ? (
          <p className="px-4 py-12 text-center text-xs text-muted-foreground">
            {kind === "receita" ? "Nenhuma receita pendente. 🎉" : "Nenhuma despesa pendente. 🎉"}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((e) => (
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
                onDelete={() => void deleteManualEntry(e.id)}
              />
            ))}
          </ul>
        )}
      </div>

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
          onSave={(m) => {
            const isNew = !loadManual().some((x) => x.id === m.id);
            void (isNew ? createManualEntry(m) : updateManualEntry(m)).then(() => {
              setDialogOpen(false);
              setEditing(null);
            });
          }}
        />
      )}

      {viewing && (
        <EntryDetailsDialog
          entry={viewing}
          onClose={() => setViewing(null)}
          onMarkPaid={() => setMarkingPaid(viewing)}
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
                  await updateManualEntry({ ...m, anexos });
                  setViewing((v) => (v ? { ...v, anexos } : v));
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
