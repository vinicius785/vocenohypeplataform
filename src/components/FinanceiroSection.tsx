import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Plus, Upload } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/button";
import {
  useFinanceiroFilteredEntries,
  type AdvancedFilters,
} from "./financeiro/useFinanceiroFilteredEntries";
import { VisaoGeralTab } from "./financeiro/VisaoGeralTab";
import { LancamentosTab } from "./financeiro/LancamentosTab";
import { AnalisesTab } from "./financeiro/AnalisesTab";
import { EntryDialog } from "./financeiro/EntryDialog";
import { useClientes } from "@/lib/clientes-store";
import { type ManualEntry, createManualEntry } from "@/lib/financeiro-entries";
import {
  FINANCEIRO_TABS,
  resolveFinanceiroLegacyTarget,
  resolveFinanceiroTab,
  type AnalisesView,
  type FinanceiroTab,
  type LancamentosSegment,
} from "@/lib/section-nav";
import { SegmentedControl } from "@/components/ui/segmented-control";

/* ============================================================
 * Financeiro — central financeira da agência, em 3 áreas:
 *   Resumo      → entender a situação (saldo, atenção, fluxo de caixa)
 *   Lançamentos → operar (Todos/Entradas/Saídas/A receber/A pagar são
 *                 segmentações da MESMA lista, não áreas)
 *   Análises    → entender os resultados (Geral / Por campanha)
 *  - Agrega automaticamente pagamentos de influenciadores lançados
 *    em cada campanha, receitas de campanhas e salários da equipe.
 *  - Permite lançamentos manuais vinculados a cliente/campanha.
 *  - Uma única fonte de dados filtrada (useFinanceiroFilteredEntries)
 *    alimenta tudo — nenhum widget faz sua própria query.
 *  - O período filtra por VENCIMENTO. Ele é mostrado só onde se aplica:
 *    Resumo, Lançamentos (exceto A receber/A pagar, que olham a carteira
 *    inteira) e Análises → Por campanha.
 * ============================================================ */

export function FinanceiroSection() {
  const clientes = useClientes();
  const filtered = useFinanceiroFilteredEntries();
  // Etapa 3: a aba ativa mora na URL (mesmo mecanismo de `?metasView=`) —
  // a navegação entre subpáginas é a barra interna abaixo do título (a
  // sidebar só leva ao módulo); sobrevive a refresh e permite link direto.
  const search = useSearch({ from: "/_authenticated/time" });
  const navigate = useNavigate();
  const topTab = resolveFinanceiroTab(search.financeiroTab);
  // Segmentação/visão inicial vem de um link antigo (`?financeiroTab=a-pagar`
  // etc.) quando for o caso; depois disso é estado local da sessão.
  const [segment, setSegment] = useState<LancamentosSegment>(
    () => resolveFinanceiroLegacyTarget(search.financeiroTab).segment,
  );
  const [analiseView, setAnaliseView] = useState<AnalisesView>(
    () => resolveFinanceiroLegacyTarget(search.financeiroTab).view,
  );
  const setTopTab = (v: FinanceiroTab) =>
    void navigate({
      to: "/time",
      search: (prev) => ({ ...prev, financeiroTab: v }),
      replace: true,
    });
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

  const applyFilter = (patch: Partial<AdvancedFilters>) =>
    filtered.setFilters((f) => ({ ...f, ...patch }));

  // Levar uma pessoa de Resumo/Análises pra lista já filtrada: aplica o
  // filtro e abre Lançamentos na segmentação que bate com o tipo pedido.
  const goToLancamentos = (patch: Partial<AdvancedFilters>, seg?: LancamentosSegment) => {
    applyFilter(patch);
    setSegment(
      seg ??
        (patch.tipo === "receita" ? "entradas" : patch.tipo === "despesa" ? "saidas" : "todos"),
    );
    setTopTab("lancamentos");
  };

  return (
    // Canvas experimental (Etapa 5 — mesma correção do conceito visual em
    // `/design-system-finance-concept`): `--background` e `--card` globais
    // são idênticos no claro, então sem isso os cards do Financeiro não se
    // distinguiam do fundo. Reaproveita `--muted` (token já existente) só
    // dentro da área do Financeiro; no escuro `--background`/`--card` já
    // são distintos, por isso `dark:bg-transparent` neutraliza o ajuste.
    <div className="-m-4 min-h-full bg-muted p-4 dark:bg-transparent md:-m-8 md:p-8">
      <PageContainer className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[36px] font-bold leading-[1.05] tracking-tight text-foreground md:text-[42px]">
              Financeiro
            </p>
            <p className="mt-1.5 text-sm text-text-secondary">
              Posição atual, lançamentos e análises financeiras.
            </p>
          </div>
          {topTab !== "analises" && (
            <div className="flex flex-wrap items-center gap-2">
              {topTab === "lancamentos" && (
                <Button variant="outline" size="comfortable" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4" /> Importar
                </Button>
              )}
              <Button variant="primary" size="comfortable" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" /> Novo lançamento
              </Button>
            </div>
          )}
        </div>

        <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          <SegmentedControl
            aria-label="Seções do Financeiro"
            value={topTab}
            onChange={setTopTab}
            options={FINANCEIRO_TABS.map((t) => ({ value: t.key, label: t.label }))}
          />
        </div>

        <div>
          {topTab === "resumo" && (
            <VisaoGeralTab
              filtered={filtered}
              onApplyFilter={(patch) => goToLancamentos(patch)}
              onNavigateToAReceber={() => {
                setSegment("a-receber");
                setTopTab("lancamentos");
              }}
              onNavigateToAPagar={() => {
                setSegment("a-pagar");
                setTopTab("lancamentos");
              }}
            />
          )}
          {topTab === "lancamentos" && (
            <LancamentosTab
              filtered={filtered}
              segment={segment}
              onSegmentChange={setSegment}
              importOpen={importOpen}
              onImportOpenChange={setImportOpen}
              syncError={syncError}
              onSyncError={setSyncError}
            />
          )}
          {topTab === "analises" && (
            <AnalisesTab
              filtered={filtered}
              view={analiseView}
              onViewChange={setAnaliseView}
              onApplyFilter={(patch) => goToLancamentos(patch)}
            />
          )}
        </div>

        <EntryDialog
          open={newOpen}
          initial={null}
          clientes={clientes.map((c) => ({
            id: c.id,
            nome: c.empresa,
            campanhas: (c.campanhas ?? []).map((k) => ({ id: k.id, nome: k.nome })),
          }))}
          onClose={() => setNewOpen(false)}
          onSave={(m) => void handleCreate(m)}
        />
      </PageContainer>
    </div>
  );
}
