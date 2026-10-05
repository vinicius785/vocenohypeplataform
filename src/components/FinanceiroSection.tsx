import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  useFinanceiroFilteredEntries,
  type AdvancedFilters,
} from "./financeiro/useFinanceiroFilteredEntries";
import { VisaoGeralTab } from "./financeiro/VisaoGeralTab";
import { LancamentosTab } from "./financeiro/LancamentosTab";
import { AnalisesTab } from "./financeiro/AnalisesTab";
import { PeriodPicker } from "./financeiro/PeriodPicker";
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
  const legacyPreset = resolveFinanceiroLegacyTarget(search.financeiroTab).preset;
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

  // Link antigo `?financeiroTab=a-receber|a-pagar`: abre Lançamentos já com o
  // recorte "em aberto" daquele tipo, sobre todo o período (como a tela antiga).
  useEffect(() => {
    if (!legacyPreset) return;
    filtered.setPeriodMode("tudo");
    filtered.setFilters((f) => ({
      ...f,
      status: legacyPreset === "a-receber" ? ["a_receber", "vencido"] : ["a_pagar", "vencido"],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <PageContainer className="space-y-5 md:space-y-6">
      {/* Topo = UMA unidade: título + ação primária, e logo abaixo uma única
       * linha de contexto (navegação do Financeiro à esquerda, período à
       * direita). Sem segundo cabeçalho, sem faixa só para o período. Em
       * Lançamentos o período passa para a linha de busca/filtros (padrão da
       * plataforma: período ao lado de filtros e ordenação); nas telas sem
       * barra de filtros ele fica aqui. */}
      <div className="space-y-4">
        <PageHeader
          title="Financeiro"
          description="Posição atual, lançamentos e análises financeiras."
          actionsSlot={
            <Button variant="primary" size="comfortable" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> Novo lançamento
            </Button>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="-mx-4 max-w-full overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
            <SegmentedControl
              aria-label="Seções do Financeiro"
              size="sm"
              value={topTab}
              onChange={setTopTab}
              options={FINANCEIRO_TABS.map((t) => ({ value: t.key, label: t.label }))}
            />
          </div>
          {/* Período = contexto GLOBAL, uma única vez, separado dos filtros. Vale para o
           * Resumo, para Lançamentos e para "Por campanha"; Análises → Geral olha todo o
           * histórico, então não o mostra. */}
          {(topTab !== "analises" || analiseView === "campanhas") && (
            <PeriodPicker filtered={filtered} />
          )}
        </div>
      </div>

      <div>
        {topTab === "resumo" && (
          <VisaoGeralTab
            filtered={filtered}
            onApplyFilter={(patch) => goToLancamentos(patch)}
            onNavigateToAReceber={() => {
              filtered.setPeriodMode("tudo");
              goToLancamentos({ tipo: "receita", status: ["a_receber", "vencido"] });
            }}
            onNavigateToAPagar={() => {
              filtered.setPeriodMode("tudo");
              goToLancamentos({ tipo: "despesa", status: ["a_pagar", "vencido"] });
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
  );
}
