import { useMemo, useState } from "react";
import { useClientes } from "@/lib/clientes-store";
import {
  type Entry,
  type ManualEntry,
  type Kind,
  DUE_BUCKET_LABEL,
  fmtBRL,
  groupByDueBucket,
  sortByUrgency,
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
import { CobrancaDialog } from "./CobrancaDialog";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

/** "A receber"/"A pagar" mostram TUDO que está pendente daquele tipo, em
 * toda a carteira — não ficam presas à janela do período selecionado no
 * topo (que é "este mês", "hoje" etc.), já que uma conta a vencer daqui a
 * 40 dias ainda precisa aparecer aqui. É exatamente esse escopo mais
 * amplo — carteira inteira, não o mês corrente — que explica o total
 * "A pagar" aqui ser diferente do card "A pagar" da Visão Geral (que É
 * restrito ao período selecionado): a diferença é de RECORTE, não um erro
 * de cálculo, e por isso cada tela rotula explicitamente seu próprio
 * escopo. Respeitam os OUTROS filtros ativos (cliente, campanha,
 * categoria, busca), só não o recorte de período. */
export function PendingKindTab({ filtered, kind }: { filtered: Filtered; kind: Kind }) {
  const { all, filters } = filtered;
  const clientes = useClientes();
  const [viewing, setViewing] = useState<Entry | null>(null);
  const [markingPaid, setMarkingPaid] = useState<Entry | null>(null);
  const [cobrando, setCobrando] = useState<Entry | null>(null);
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

  const buckets = useMemo(() => groupByDueBucket(pending), [pending]);
  const totalEmAberto = pending.reduce((s, e) => s + e.amount, 0);

  const findManual = (id: string) => loadManual().find((x) => x.id === id) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-x-6 gap-y-3 overflow-x-auto pb-1">
        <Kpi
          label={kind === "receita" ? "Total em aberto" : "Total em aberto"}
          value={fmtBRL(totalEmAberto)}
        />
        <Kpi label={DUE_BUCKET_LABEL.vencido} value={fmtBRL(buckets.vencido.total)} />
        <Kpi label={DUE_BUCKET_LABEL.vence_hoje} value={fmtBRL(buckets.vence_hoje.total)} />
        <Kpi label={DUE_BUCKET_LABEL.proximos_7} value={fmtBRL(buckets.proximos_7.total)} />
        <Kpi label={DUE_BUCKET_LABEL.de_8_a_30} value={fmtBRL(buckets.de_8_a_30.total)} />
        <Kpi label={DUE_BUCKET_LABEL.acima_30} value={fmtBRL(buckets.acima_30.total)} />
      </div>
      <p className="-mt-4 text-[11px] text-muted-foreground">
        Faixas mutuamente exclusivas (cada lançamento entra em só uma) · toda a carteira em aberto,
        não apenas o período selecionado no topo.
      </p>

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
                onRegistrarCobranca={kind === "receita" ? () => setCobrando(e) : undefined}
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

      {cobrando && (
        <CobrancaDialog
          entry={cobrando}
          onClose={() => setCobrando(null)}
          onSaved={() => setCobrando(null)}
        />
      )}
    </div>
  );
}
