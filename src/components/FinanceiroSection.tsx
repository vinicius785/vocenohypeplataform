import { useState } from "react";
import { Plus, Upload } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SectionHeader } from "./SectionHeader";
import {
  useFinanceiroFilteredEntries,
  type AdvancedFilters,
} from "./financeiro/useFinanceiroFilteredEntries";
import { PeriodPicker } from "./financeiro/PeriodPicker";
import { VisaoGeralTab } from "./financeiro/VisaoGeralTab";
import { MovimentacoesTab } from "./financeiro/MovimentacoesTab";
import { AReceberTab } from "./financeiro/AReceberTab";
import { APagarTab } from "./financeiro/APagarTab";
import { CampanhasTab } from "./financeiro/CampanhasTab";
import { RelatoriosTab } from "./financeiro/RelatoriosTab";
import { EntryDialog } from "./financeiro/EntryDialog";
import { useClientes } from "@/lib/clientes-store";
import { type ManualEntry, createManualEntry } from "@/lib/financeiro-entries";

/* ============================================================
 * Financeiro — central financeira da agência.
 *  - Agrega automaticamente pagamentos de influenciadores lançados
 *    em cada campanha (localStorage: campanha:influs:${id}).
 *  - Agrega receitas de campanhas (valor do cliente / parcelas).
 *  - Agrega salários da equipe (localStorage: time:membros) como
 *    despesa recorrente todo dia 15 de cada mês.
 *  - Permite lançamentos manuais vinculados a cliente/campanha.
 *  - Uma única fonte de dados filtrada (useFinanceiroFilteredEntries)
 *    alimenta as 6 abas — nenhum widget faz sua própria query.
 *  - O período selecionado no topo filtra por VENCIMENTO (nunca
 *    competência/liquidação) — mesmo critério em todas as abas.
 * ============================================================ */

type TopTab =
  | "visao-geral"
  | "movimentacoes"
  | "a-receber"
  | "a-pagar"
  | "campanhas"
  | "relatorios";

export function FinanceiroSection() {
  const clientes = useClientes();
  const filtered = useFinanceiroFilteredEntries();
  const [topTab, setTopTab] = useState<TopTab>("visao-geral");
  const [importOpen, setImportOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleCreate = async (m: ManualEntry) => {
    try {
      await createManualEntry(m);
      setNewOpen(false);
      setTopTab("movimentacoes");
    } catch (err) {
      setSyncError(
        `Não foi possível salvar: ${err instanceof Error ? err.message : "erro desconhecido"}.`,
      );
    }
  };

  const applyFilter = (patch: Partial<AdvancedFilters>) =>
    filtered.setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <SectionHeader
        title="Financeiro"
        subtitle="Central financeira — período filtrado por vencimento, receitas, despesas e vínculos."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodPicker filtered={filtered} />
            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Upload className="h-3.5 w-3.5" /> Importar
            </button>
            <button
              onClick={() => setNewOpen(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Novo lançamento
            </button>
          </div>
        }
      />

      <Tabs value={topTab} onValueChange={(v) => setTopTab(v as TopTab)}>
        <TabsList>
          <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
          <TabsTrigger value="a-receber">A receber</TabsTrigger>
          <TabsTrigger value="a-pagar">A pagar</TabsTrigger>
          <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="mt-4">
          <VisaoGeralTab
            filtered={filtered}
            onApplyFilter={(patch) => {
              applyFilter(patch);
              setTopTab("movimentacoes");
            }}
            onNavigateToAReceber={() => setTopTab("a-receber")}
            onNavigateToAPagar={() => setTopTab("a-pagar")}
          />
        </TabsContent>
        <TabsContent value="movimentacoes" className="mt-4">
          <MovimentacoesTab
            filtered={filtered}
            importOpen={importOpen}
            onImportOpenChange={setImportOpen}
            syncError={syncError}
            onSyncError={setSyncError}
          />
        </TabsContent>
        <TabsContent value="a-receber" className="mt-4">
          <AReceberTab filtered={filtered} />
        </TabsContent>
        <TabsContent value="a-pagar" className="mt-4">
          <APagarTab filtered={filtered} />
        </TabsContent>
        <TabsContent value="campanhas" className="mt-4">
          <CampanhasTab
            filtered={filtered}
            onApplyFilter={(patch) => {
              applyFilter(patch);
              setTopTab("movimentacoes");
            }}
          />
        </TabsContent>
        <TabsContent value="relatorios" className="mt-4">
          <RelatoriosTab
            filtered={filtered}
            onApplyFilter={(patch) => {
              applyFilter(patch);
              setTopTab("movimentacoes");
            }}
          />
        </TabsContent>
      </Tabs>

      {newOpen && (
        <EntryDialog
          initial={null}
          clientes={clientes.map((c) => ({
            id: c.id,
            nome: c.empresa,
            campanhas: (c.campanhas ?? []).map((k) => ({ id: k.id, nome: k.nome })),
          }))}
          onClose={() => setNewOpen(false)}
          onSave={(m) => void handleCreate(m)}
        />
      )}
    </div>
  );
}
