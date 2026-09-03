import { useState } from "react";
import { Plus, Upload } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SectionHeader } from "./SectionHeader";
import { useFinanceiroFilteredEntries } from "./financeiro/useFinanceiroFilteredEntries";
import { VisaoGeralTab } from "./financeiro/VisaoGeralTab";
import { LancamentosTab } from "./financeiro/LancamentosTab";
import { AReceberTab } from "./financeiro/AReceberTab";
import { APagarTab } from "./financeiro/APagarTab";
import { EntryDialog } from "./financeiro/EntryDialog";
import { useClientes } from "@/lib/clientes-store";
import { type ManualEntry, createManualEntry } from "@/lib/financeiro-entries";

/* ============================================================
 * Financeiro — hub de gestão financeira da agência.
 *  - Agrega automaticamente pagamentos de influenciadores lançados
 *    em cada campanha (localStorage: campanha:influs:${id}).
 *  - Agrega receitas de campanhas (valor do cliente / parcelas).
 *  - Agrega salários da equipe (localStorage: time:membros) como
 *    despesa recorrente todo dia 15 de cada mês.
 *  - Permite lançamentos manuais vinculados a cliente/campanha.
 *  - Uma única fonte de dados filtrada (useFinanceiroFilteredEntries)
 *    alimenta as 4 abas — nenhum widget faz sua própria query.
 * ============================================================ */

type TopTab = "visao-geral" | "lancamentos" | "a-receber" | "a-pagar";

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
      setTopTab("lancamentos");
    } catch (err) {
      setSyncError(
        `Não foi possível salvar: ${err instanceof Error ? err.message : "erro desconhecido"}.`,
      );
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <SectionHeader
        title="Financeiro"
        subtitle="Hub de gestão financeira — receitas, despesas, cachês, salários e vínculos."
        action={
          <div className="flex flex-wrap items-center gap-2">
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
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="a-receber">A receber</TabsTrigger>
          <TabsTrigger value="a-pagar">A pagar</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="mt-4">
          <VisaoGeralTab filtered={filtered} />
        </TabsContent>
        <TabsContent value="lancamentos" className="mt-4">
          <LancamentosTab
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
