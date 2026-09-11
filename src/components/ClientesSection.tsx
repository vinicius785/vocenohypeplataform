import { useEffect, useMemo, useState } from "react";
import { Plus, Building2, Megaphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import { VincularCampanhaDialog, type Campaign } from "./VincularCampanhaDialog";
import { clientesStore, useClientes, type Cliente } from "@/lib/clientes-store";
import { useConfirm } from "@/hooks/use-confirm";
import { OPEN_CLIENTE_KEY, OPEN_CLIENTE_EVENT } from "./AppShell";
import { ClienteCard } from "./clientes/ClienteCard";
import { ClienteFiltersBar } from "./clientes/ClienteFiltersBar";
import { ClienteFormSheet } from "./clientes/ClienteFormSheet";
import { ClienteDetailsSheet } from "./clientes/ClienteDetailsSheet";
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

  const [formOpen, setFormOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [campanhaOpen, setCampanhaOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ClienteFiltersState>(DEFAULT_CLIENTE_FILTERS);
  const { confirm, confirmDialog } = useConfirm();

  const selected = clientes.find((c) => c.id === selectedId) ?? null;

  // Deep link vindo de uma @menção de cliente no Chat (mesmo padrão de
  // OPEN_CAMPANHA_TASK_KEY em CampanhasSection) — `clientes` só carrega de
  // forma assíncrona, então tenta de novo sempre que a lista mudar, e só
  // limpa o sessionStorage quando encontrar o cliente de verdade.
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
        setSelectedId(match.id);
      } catch {
        /* ignore */
      }
    };
    openFromSession();
    window.addEventListener(OPEN_CLIENTE_EVENT, openFromSession);
    return () => window.removeEventListener(OPEN_CLIENTE_EVENT, openFromSession);
  }, [clientes]);

  const copyClientLink = (cliente: Cliente) => {
    let token = cliente.publicToken;
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, "");
      setClientes((prev) =>
        prev.map((cl) => (cl.id === cliente.id ? { ...cl, publicToken: token } : cl)),
      );
    }
    void navigator.clipboard.writeText(`${window.location.origin}/portal/${token}`);
  };

  const openEditCliente = (c: Cliente) => {
    setEditingCliente(c);
    setSelectedId(null);
    setFormOpen(true);
  };

  const openNovoCliente = () => {
    setEditingCliente(null);
    setFormOpen(true);
  };

  const saveCliente = (form: Omit<Cliente, "id" | "campanhas">) => {
    if (editingCliente) {
      setClientes((prev) => prev.map((c) => (c.id === editingCliente.id ? { ...c, ...form } : c)));
    } else {
      setClientes((prev) => [...prev, { ...form, id: crypto.randomUUID(), campanhas: [] }]);
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
    setSelectedId(null);
  };

  const saveCampaign = (c: Campaign) => {
    if (!selected) return;
    setClientes((prev) =>
      prev.map((cli) => {
        if (cli.id !== selected.id) return cli;
        const list = cli.campanhas ?? [];
        const exists = list.some((x) => x.id === c.id);
        return {
          ...cli,
          campanhas: exists ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c],
        };
      }),
    );
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
          // Compactado na rodada corretiva: era uma pilha vertical (rótulo →
          // número gigante → linha de apoio), alta e com muito vazio à
          // direita em telas largas. Agora é uma faixa única — número
          // dominante à esquerda, os 3 indicadores de apoio distribuídos à
          // direita — que só empilha verticalmente (`flex-col`) quando o
          // espaço aperta (mobile), sem crescer em altura à toa no desktop.
          <div className="rounded-[24px] bg-brand p-5 dark:shadow-none md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
              <div className="shrink-0">
                <span className="inline-flex items-center rounded-full bg-black/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-foreground">
                  Total de clientes
                </span>
                <p className="mt-2 whitespace-nowrap text-[40px] font-bold leading-none tracking-tight text-brand-foreground sm:text-[46px] md:text-[52px]">
                  {totalClientes}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-7 gap-y-3 lg:justify-end">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10 text-brand-foreground">
                    <Megaphone className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-foreground-secondary">
                      Com campanha
                    </p>
                    <p className="whitespace-nowrap text-base font-bold leading-none text-brand-foreground">
                      {comCampanha}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10 text-brand-foreground">
                    <Users className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-foreground-secondary">
                      Sem campanha
                    </p>
                    <p className="whitespace-nowrap text-base font-bold leading-none text-brand-foreground">
                      {semCampanha}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10 text-brand-foreground">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-foreground-secondary">
                      Campanhas no total
                    </p>
                    <p className="whitespace-nowrap text-base font-bold leading-none text-brand-foreground">
                      {totalCampanhas}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
                onOpen={() => setSelectedId(c.id)}
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

      <ClienteDetailsSheet
        cliente={selected}
        onClose={() => setSelectedId(null)}
        onEdit={openEditCliente}
        onDelete={(c) => void requestDeleteCliente(c)}
        onCopyLink={copyClientLink}
        onNovaCampanha={() => {
          setEditingCampaign(null);
          setCampanhaOpen(true);
        }}
        onEditCampanha={(camp) => {
          setEditingCampaign(camp);
          setCampanhaOpen(true);
        }}
      />

      <VincularCampanhaDialog
        open={campanhaOpen}
        onOpenChange={(o) => {
          setCampanhaOpen(o);
          if (!o) setEditingCampaign(null);
        }}
        clienteNome={selected?.empresa}
        clienteOrcamentoSugerido={selected?.orcamentoSugerido}
        initial={editingCampaign}
        onSave={saveCampaign}
      />
      {confirmDialog}
    </div>
  );
}
