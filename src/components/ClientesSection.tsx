import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  PageSummaryPanel,
  SummaryPrimaryMetric,
  SummaryMetric,
} from "@/components/shared/PageSummaryPanel";
import { clientesStore, useClientes, type Cliente } from "@/lib/clientes-store";
import { useConfirm } from "@/hooks/use-confirm";
import { OPEN_CLIENTE_KEY, OPEN_CLIENTE_EVENT } from "./AppShell";
import { ClienteCard } from "./clientes/ClienteCard";
import { ClienteFiltersBar } from "./clientes/ClienteFiltersBar";
import { ClienteFormSheet } from "./clientes/ClienteFormSheet";
import {
  DEFAULT_CLIENTE_FILTERS,
  filterClientes,
  sortClientes,
  type ClienteFiltersState,
} from "./clientes/cliente-ui";

/* ============================================================
 * Clientes — migração visual (mesmo padrão de Financeiro/Comercial/
 * Reuniões/Metas): hero com o dado real dominante, toolbar unificada de
 * busca/filtro/ordenação sobre o mesmo dataset já sincronizado
 * (useClientes), grid de cards substituindo o antigo FlowingMenu (raiz do
 * bug de logo repetindo em marquee) e drawers laterais no lugar dos
 * modais centrais de criação/edição/detalhes. Nenhuma regra de negócio,
 * payload ou dado mudou — só a apresentação e a arquitetura de
 * informação.
 * ============================================================ */

export function ClientesSection() {
  const clientes = useClientes();
  const setClientes = clientesStore.set;
  const navigate = useNavigate();

  const [formOpen, setFormOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ClienteFiltersState>(DEFAULT_CLIENTE_FILTERS);
  const { confirm, confirmDialog } = useConfirm();

  const openCliente = (clienteId: string) => {
    void navigate({ to: "/clientes/$id", params: { id: clienteId } });
  };

  // Deep link vindo de uma @menção de cliente no Chat (mesmo padrão de
  // OPEN_CAMPANHA_TASK_KEY em CampanhasSection) — `clientes` só carrega de
  // forma assíncrona, então tenta de novo sempre que a lista mudar, e só
  // limpa o sessionStorage quando encontrar o cliente de verdade. Agora
  // navega direto pra `/clientes/$id` em vez de abrir o drawer (rebuild da
  // página de detalhes — ver `ClienteDetailPage.tsx`).
  useEffect(() => {
    const openFromSession = () => {
      try {
        const raw = sessionStorage.getItem(OPEN_CLIENTE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { clienteId?: string };
        if (!parsed.clienteId) return;
        const match = clientes.find((c) => c.id === parsed.clienteId);
        if (!match) return;
        sessionStorage.removeItem(OPEN_CLIENTE_KEY);
        openCliente(match.id);
      } catch {
        /* ignore */
      }
    };
    openFromSession();
    window.addEventListener(OPEN_CLIENTE_EVENT, openFromSession);
    return () => window.removeEventListener(OPEN_CLIENTE_EVENT, openFromSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes]);

  const openEditCliente = (c: Cliente) => {
    setEditingCliente(c);
    setFormOpen(true);
  };

  const openNovoCliente = () => {
    setEditingCliente(null);
    setFormOpen(true);
  };

  // `form.id` só vem preenchido pelo `ClienteFormSheet` em 2 casos: uma
  // importação do CRM (id do cliente novo, já usado por ele pra gravar o
  // vínculo em `upsertLead` no mesmo instante — precisa ser o MESMO id
  // aqui, nunca gerar outro) ou "Usar cliente existente" na checagem de
  // duplicidade (id de um cliente que já existe — vira uma seleção/merge,
  // nunca uma segunda linha duplicada).
  const saveCliente = (form: Omit<Cliente, "id" | "campanhas"> & { id?: string }) => {
    const { id: formId, ...rest } = form;
    if (editingCliente) {
      setClientes((prev) => prev.map((c) => (c.id === editingCliente.id ? { ...c, ...rest } : c)));
    } else if (formId && clientes.some((c) => c.id === formId)) {
      setClientes((prev) => prev.map((c) => (c.id === formId ? { ...c, ...rest } : c)));
    } else {
      setClientes((prev) => [
        ...prev,
        { ...rest, id: formId ?? crypto.randomUUID(), campanhas: [] },
      ]);
    }
    setFormOpen(false);
    setEditingCliente(null);
  };

  const requestDeleteCliente = async (c: Cliente) => {
    const campanhaCount = c.campanhas?.length ?? 0;
    const ok = await confirm(
      campanhaCount > 0
        ? `Excluir o cliente "${c.empresa}"? As ${campanhaCount} campanha(s) vinculada(s) também serão removidas — essa ação não pode ser desfeita.`
        : `Excluir o cliente "${c.empresa}"? Essa ação não pode ser desfeita.`,
    );
    if (!ok) return;
    setClientes((prev) => prev.filter((x) => x.id !== c.id));
  };

  const responsaveis = useMemo(
    () =>
      Array.from(new Set(clientes.map((c) => c.responsavelInterno).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [clientes],
  );

  const visibleClientes = useMemo(
    () => sortClientes(filterClientes(clientes, query, filters), filters.sort),
    [clientes, query, filters],
  );

  const totalClientes = clientes.length;
  const comCampanha = clientes.filter((c) => (c.campanhas?.length ?? 0) > 0).length;
  const semCampanha = totalClientes - comCampanha;
  const totalCampanhas = clientes.reduce((s, c) => s + (c.campanhas?.length ?? 0), 0);

  const hasAnyClient = totalClientes > 0;
  const hasResults = visibleClientes.length > 0;
  const hasActiveSearchOrFilter =
    query.trim().length > 0 ||
    filters.campanha !== "todos" ||
    filters.contato !== "todos" ||
    filters.responsavelInterno.length > 0;

  return (
    // Canvas fix (mesma correção do Financeiro/Reuniões/Metas): --background
    // e --card são idênticos no claro, então sem isso os cards de Clientes
    // não se distinguiam do fundo.
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-muted p-4 dark:bg-transparent md:-m-8 md:p-8">
      <PageContainer className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[36px] font-bold leading-[1.05] tracking-tight text-foreground md:text-[42px]">
              Clientes
            </p>
            <p className="mt-1.5 text-sm text-text-secondary">
              Todos os clientes e campanhas vinculadas em um só lugar.
            </p>
          </div>
          <Button variant="primary" size="comfortable" onClick={openNovoCliente}>
            <Plus className="h-4 w-4" /> Novo cliente
          </Button>
        </div>

        {hasAnyClient && (
          <PageSummaryPanel title="Visão geral">
            <SummaryPrimaryMetric value={String(totalClientes)} label="clientes" />
            <SummaryMetric label="Com campanha" value={comCampanha} />
            <SummaryMetric label="Sem campanha" value={semCampanha} />
            <SummaryMetric label="Campanhas no total" value={totalCampanhas} />
          </PageSummaryPanel>
        )}

        {hasAnyClient && (
          <ClienteFiltersBar
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            onFiltersChange={setFilters}
            responsaveis={responsaveis}
          />
        )}

        {!hasAnyClient ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title="Nenhum cliente cadastrado ainda"
            description="Cadastre o primeiro cliente para começar a vincular campanhas."
            primaryAction={{ label: "Novo cliente", onClick: openNovoCliente }}
          />
        ) : !hasResults ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title={
              hasActiveSearchOrFilter ? "Nenhum cliente encontrado" : "Nenhum cliente para mostrar"
            }
            description={
              hasActiveSearchOrFilter
                ? "Ajuste a busca ou os filtros para ver outros clientes."
                : undefined
            }
            secondaryAction={
              hasActiveSearchOrFilter
                ? {
                    label: "Limpar filtros",
                    onClick: () => {
                      setQuery("");
                      setFilters(DEFAULT_CLIENTE_FILTERS);
                    },
                  }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleClientes.map((c) => (
              <ClienteCard
                key={c.id}
                cliente={c}
                onOpen={() => openCliente(c.id)}
                onEdit={() => openEditCliente(c)}
                onDelete={() => void requestDeleteCliente(c)}
              />
            ))}
          </div>
        )}
      </PageContainer>

      <ClienteFormSheet
        open={formOpen}
        initial={editingCliente}
        onClose={() => {
          setFormOpen(false);
          setEditingCliente(null);
        }}
        onSave={saveCliente}
      />

      {confirmDialog}
    </div>
  );
}
