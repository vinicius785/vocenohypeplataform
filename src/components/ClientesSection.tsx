import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { KpiLead, KpiLeadItem, KpiLeadValue } from "@/components/shared/Kpi";
import { clientesStore, useClientes, type Cliente } from "@/lib/clientes-store";
import { createClienteComOrganizacao } from "@/lib/clientes.functions";
import { listContratosProximosDoVencimento } from "@/lib/contratos-alertas.functions";
import { useConfirm } from "@/hooks/use-confirm";
import { OPEN_CLIENTE_KEY, OPEN_CLIENTE_EVENT } from "./AppShell";
import { ClienteCard } from "./clientes/ClienteCard";
import { ClienteFiltersBar } from "./clientes/ClienteFiltersBar";
import { ClienteFormSheet } from "./clientes/ClienteFormSheet";
import { VincularCampanhaDialog, type Campaign } from "./VincularCampanhaDialog";
import {
  DEFAULT_CLIENTE_FILTERS,
  filterClientes,
  sortClientes,
  countClientesByStatusFilter,
  matchesClienteStatusFilter,
  campanhaCreatedActivityEntry,
  type ClienteFiltersState,
  type ClienteStatusFilter,
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
  const createClienteComOrganizacaoFn = useServerFn(createClienteComOrganizacao);
  const listContratosProximosDoVencimentoFn = useServerFn(listContratosProximosDoVencimento);
  // Indicador "Contratos próximos do vencimento" (item 19 do pedido de
  // reconstrução do domínio Comercial/Clientes/Campanhas/Contratos/
  // Financeiro) — busca uma vez ao montar; `contratos` é tabela própria
  // (não embutida em `Cliente`), então não vem de graça com `useClientes()`.
  // `null` = ainda carregando (nunca mostra "0" antes da resposta real).
  const [contratosVencendo, setContratosVencendo] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void listContratosProximosDoVencimentoFn({ data: { withinDays: 30 } })
      .then((rows) => {
        if (!cancelled) setContratosVencendo(rows.length);
      })
      .catch(() => {
        if (!cancelled) setContratosVencendo(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [formOpen, setFormOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  // Encadeamento "criar cliente → criar campanha" (Etapa 5 do wizard de
  // Clientes): guarda o id do cliente recém-salvo pra abrir o
  // VincularCampanhaDialog já com ele pré-selecionado, sem depender de
  // `editingCliente` (que já foi limpo nesse ponto).
  const [campanhaWizardClienteId, setCampanhaWizardClienteId] = useState<string | null>(null);
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
  const saveCliente = (
    form: Omit<Cliente, "id" | "campanhas"> & { id?: string; openCampanhaAfter?: boolean },
  ) => {
    const { id: formId, openCampanhaAfter, ...rest } = form;
    let savedId: string;
    if (editingCliente) {
      savedId = editingCliente.id;
      setClientes((prev) => prev.map((c) => (c.id === editingCliente.id ? { ...c, ...rest } : c)));
    } else if (formId && clientes.some((c) => c.id === formId)) {
      savedId = formId;
      setClientes((prev) => prev.map((c) => (c.id === formId ? { ...c, ...rest } : c)));
    } else {
      // Cliente genuinamente novo: `clientesStore.set` (upsert genérico do
      // `createTableArrayStore`) nunca envia `organization_id` — coluna
      // NOT NULL em `clientes` desde a migration
      // `20260918160000_client_organizations_phase1.sql` — então criar
      // direto pelo store sempre falhava com "null value ... violates
      // not-null constraint". `createClienteComOrganizacao` cria a
      // organização dedicada do cliente (multi-tenancy do Portal) e o
      // registro de `clientes` numa única chamada de servidor; o resultado
      // é só mesclado no cache local (`hydrateOne`, sem novo upsert) assim
      // que confirma.
      savedId = formId ?? crypto.randomUUID();
      const novoCliente: Cliente = {
        ...rest,
        id: savedId,
        campanhas: [],
        status: rest.status ?? "active",
      };
      void createClienteComOrganizacaoFn({
        data: { id: savedId, empresa: novoCliente.empresa, cliente: novoCliente },
      })
        .then(() => clientesStore.hydrateOne(novoCliente))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Falha ao criar cliente.";
          toast.error("Não foi possível criar o cliente", { description: message });
        });
    }
    setFormOpen(false);
    setEditingCliente(null);
    // Etapa 5 do wizard ("Criar campanha") — abre o assistente de campanha
    // já com este cliente selecionado, assim que o cadastro é persistido.
    // Nenhum `status` é forçado aqui: uma `Campaign` nova sem `status`
    // definido já cai em "planning" por padrão via `campanhaStatus()`
    // (ver `campanha-ui.ts`), que é exatamente o comportamento pedido para
    // uma campanha criada a partir de um cliente "Captação".
    if (openCampanhaAfter) setCampanhaWizardClienteId(savedId);
  };

  const saveCampanhaToCliente = (clienteId: string, campaign: Campaign) => {
    setClientes((prev) =>
      prev.map((cli) => {
        if (cli.id !== clienteId) return cli;
        const list = cli.campanhas ?? [];
        const exists = list.some((x) => x.id === campaign.id);
        return {
          ...cli,
          campanhas: exists
            ? list.map((x) => (x.id === campaign.id ? campaign : x))
            : [...list, campaign],
          activity: exists
            ? cli.activity
            : [...(cli.activity ?? []), campanhaCreatedActivityEntry(campaign.nome)],
        };
      }),
    );
  };

  const campanhaWizardCliente = campanhaWizardClienteId
    ? clientes.find((c) => c.id === campanhaWizardClienteId)
    : undefined;

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
  // Indicadores de campanha consideram só o que está "em operação" (sem
  // arquivados), coerente com a listagem padrão.
  const operacaoClientes = clientes.filter((c) => matchesClienteStatusFilter(c, "operacao"));
  const semCampanha = operacaoClientes.filter((c) => (c.campanhas?.length ?? 0) === 0).length;
  // Fase 4: indicadores de status clicáveis. "Em operação" (default) =
  // Negociando + Ativos + Encerrados; Arquivados só aparecem quando o
  // indicador "Arquivados" é escolhido explicitamente.
  const statusCounts = countClientesByStatusFilter(clientes);
  const setStatusFilter = (s: ClienteStatusFilter) =>
    setFilters((f) => ({ ...f, status: f.status === s && s !== "operacao" ? "operacao" : s }));
  const hasAnyClient = totalClientes > 0;
  const hasResults = visibleClientes.length > 0;
  const hasActiveSearchOrFilter =
    query.trim().length > 0 ||
    filters.status !== "operacao" ||
    filters.campanha !== "todos" ||
    filters.contato !== "todos" ||
    filters.responsavelInterno.length > 0;

  return (
    <>
      <PageContainer className="space-y-6 md:space-y-8">
        <PageHeader
          title="Clientes"
          description="Todos os clientes e campanhas vinculadas em um só lugar."
          actionsSlot={
            <>
              <Button variant="primary" size="comfortable" onClick={openNovoCliente}>
                <Plus className="h-4 w-4" /> Novo cliente
              </Button>
            </>
          }
        />

        {hasAnyClient && (
          <KpiLead aria-label="Resumo de clientes">
            <KpiLeadValue value={statusCounts.operacao} label="em operação" />
            <KpiLeadItem
              label="Em captação"
              value={statusCounts.capture}
              active={filters.status === "capture"}
              onClick={() => setStatusFilter("capture")}
            />
            <KpiLeadItem
              label="Sem campanha"
              value={semCampanha}
              active={filters.campanha === "sem"}
              onClick={() =>
                setFilters((f) => ({ ...f, campanha: f.campanha === "sem" ? "todos" : "sem" }))
              }
            />
            {contratosVencendo !== null && (
              <KpiLeadItem
                label="Contratos vencendo (30 dias)"
                value={contratosVencendo}
                tone="warning"
              />
            )}
          </KpiLead>
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
                      setFilters((f) => ({ ...DEFAULT_CLIENTE_FILTERS, sort: f.sort }));
                    },
                  }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
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

      <VincularCampanhaDialog
        open={!!campanhaWizardClienteId}
        onOpenChange={(o) => {
          if (!o) setCampanhaWizardClienteId(null);
        }}
        clienteNome={campanhaWizardCliente?.empresa}
        clienteOrcamentoSugerido={campanhaWizardCliente?.orcamentoSugerido}
        onSave={(campaign) => {
          if (campanhaWizardClienteId) saveCampanhaToCliente(campanhaWizardClienteId, campaign);
          setCampanhaWizardClienteId(null);
        }}
      />

      {confirmDialog}
    </>
  );
}
