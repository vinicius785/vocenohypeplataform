import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Plus, Upload } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/button";
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
import { resolveFinanceiroTab, type FinanceiroTab } from "@/lib/section-nav";

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

/** Título/descrição por subpágina (Etapa 4) — evita repetir "Financeiro"
 * em título+descrição ao mesmo tempo, e cada página descreve só o que é
 * dela. `periodo`/`novo`/`importar` controlam quais ações/toolbar fazem
 * sentido em cada uma: A receber/A pagar/Relatórios ignoram o período do
 * topo de propósito (ver `PendingKindTab.tsx`/`RelatoriosTab.tsx`), então
 * não mostram o seletor — mostrá-lo ali seria sugerir um filtro que não
 * se aplica. */
const PAGE_META: Record<
  FinanceiroTab,
  { title: string; description: string; periodo: boolean; novo: boolean; importar: boolean }
> = {
  resumo: {
    title: "Resumo financeiro",
    description: "Posição atual, alertas e projeção de fluxo de caixa.",
    periodo: true,
    novo: true,
    importar: false,
  },
  movimentacoes: {
    title: "Movimentações",
    description: "Todos os lançamentos do período, com filtros avançados.",
    periodo: true,
    novo: true,
    importar: true,
  },
  "a-receber": {
    title: "Contas a receber",
    description: "Toda a carteira em aberto, não só o período selecionado.",
    periodo: false,
    novo: true,
    importar: false,
  },
  "a-pagar": {
    title: "Contas a pagar",
    description: "Toda a carteira em aberto, não só o período selecionado.",
    periodo: false,
    novo: true,
    importar: false,
  },
  campanhas: {
    title: "Financeiro das campanhas",
    description: "Receita, custos e resultado por campanha no período.",
    periodo: true,
    novo: false,
    importar: false,
  },
  relatorios: {
    title: "Relatórios financeiros",
    description: "Indicadores consolidados de toda a carteira.",
    periodo: false,
    novo: false,
    importar: false,
  },
};

export function FinanceiroSection() {
  const clientes = useClientes();
  const filtered = useFinanceiroFilteredEntries();
  // Etapa 3: a aba ativa mora na URL (mesmo mecanismo de `?metasView=`) —
  // a barra interna foi removida, a navegação agora é pelos subitens de
  // Financeiro na sidebar; sobrevive a refresh e permite link direto.
  const search = useSearch({ from: "/_authenticated/time" });
  const navigate = useNavigate();
  const topTab = resolveFinanceiroTab(search.financeiroTab);
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
      setTopTab("movimentacoes");
    } catch (err) {
      setSyncError(
        `Não foi possível salvar: ${err instanceof Error ? err.message : "erro desconhecido"}.`,
      );
    }
  };

  const applyFilter = (patch: Partial<AdvancedFilters>) =>
    filtered.setFilters((f) => ({ ...f, ...patch }));

  const page = PAGE_META[topTab];

  return (
    // Canvas experimental (Etapa 5 — mesma correção do conceito visual em
    // `/design-system-finance-concept`): `--background` e `--card` globais
    // são idênticos no claro, então sem isso os cards do Financeiro não se
    // distinguiam do fundo. Reaproveita `--muted` (token já existente) só
    // dentro da área do Financeiro; no escuro `--background`/`--card` já
    // são distintos, por isso `dark:bg-transparent` neutraliza o ajuste.
    <div className="-m-4 min-h-full bg-muted p-4 dark:bg-transparent md:-m-8 md:p-8">
      <PageContainer className="space-y-6">
        {/* Título com escala tipográfica maior (Etapa 5, escopada a esta
         * página) — não usa `PageHeader`/`TYPOGRAPHY.pageTitle` porque
         * aquele token é global a todo o app; aqui o título é o valor
         * protagonista da hierarquia visual do Financeiro. */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[36px] font-bold leading-[1.05] tracking-tight text-foreground md:text-[42px]">
              {page.title}
            </p>
            <p className="mt-1.5 text-sm text-text-secondary">{page.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {page.importar && (
              <Button variant="outline" size="comfortable" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Importar
              </Button>
            )}
            {page.novo && (
              <Button variant="primary" size="comfortable" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" /> Novo lançamento
              </Button>
            )}
          </div>
        </div>

        {/* Resumo (Etapa 6) tem sua própria toolbar compacta, integrada à
         * composição bento em `VisaoGeralTab.tsx` — a barra de largura
         * total abaixo só continua pras demais páginas com período
         * (Movimentações/Campanhas), intocada. */}
        {page.periodo && topTab !== "resumo" && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card p-3 dark:shadow-none">
            <PeriodPicker filtered={filtered} />
          </div>
        )}

        {/* Navegação entre estas 6 subpáginas é pelos subitens de
         * "Financeiro" na sidebar (`SECTION_SUBNAV.financeiro`) — a aba
         * ativa vem da URL, nunca uma barra/pill interna aqui. */}
        <div>
          {topTab === "resumo" && (
            <VisaoGeralTab
              filtered={filtered}
              onApplyFilter={(patch) => {
                applyFilter(patch);
                setTopTab("movimentacoes");
              }}
              onNavigateToAReceber={() => setTopTab("a-receber")}
              onNavigateToAPagar={() => setTopTab("a-pagar")}
            />
          )}
          {topTab === "movimentacoes" && (
            <MovimentacoesTab
              filtered={filtered}
              importOpen={importOpen}
              onImportOpenChange={setImportOpen}
              syncError={syncError}
              onSyncError={setSyncError}
            />
          )}
          {topTab === "a-receber" && <AReceberTab filtered={filtered} />}
          {topTab === "a-pagar" && <APagarTab filtered={filtered} />}
          {topTab === "campanhas" && (
            <CampanhasTab
              filtered={filtered}
              onApplyFilter={(patch) => {
                applyFilter(patch);
                setTopTab("movimentacoes");
              }}
            />
          )}
          {topTab === "relatorios" && (
            <RelatoriosTab
              filtered={filtered}
              onApplyFilter={(patch) => {
                applyFilter(patch);
                setTopTab("movimentacoes");
              }}
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
