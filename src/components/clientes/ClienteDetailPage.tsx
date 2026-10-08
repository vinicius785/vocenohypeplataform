import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shared/PageContainer";
import { useConfirm } from "@/hooks/use-confirm";
import { useMyAccess, hasPermission } from "@/lib/permissions";
import { clientesStore, useClientes, type Cliente } from "@/lib/clientes-store";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import { VincularCampanhaDialog } from "@/components/VincularCampanhaDialog";
import { ClienteFormSheet } from "./ClienteFormSheet";
import { PortalAccessSection } from "./PortalAccessSection";
import { ClienteContratosSection } from "./ClienteContratosSection";
import { ClienteHeader } from "./ClienteHeader";
import { ClienteOverview } from "./ClienteOverview";
import { ClienteCampanhasSection } from "./ClienteCampanhasSection";
import { ClienteComercialSection } from "./ClienteComercialSection";
import { ClienteHistorico } from "./ClienteHistorico";
import { useClientePortalData } from "./use-cliente-portal-members";
import { hasComercialData } from "./cliente-overview";
import { campanhaCreatedActivityEntry, clienteStatus, CLIENTE_STATUS_LABEL } from "./cliente-ui";

/**
 * Central do Cliente (`/clientes/$id`). Composição, de cima para baixo: cabeçalho → overview
 * (Campanhas | Contato | Financeiro) → operação (Comercial, Campanhas, Contratos) → relacionamento
 * (Acessos ao portal) → Histórico. Seções planas, separadas por divisor — sem card dentro de card.
 * Dados: o store de clientes (campanhas/contato/status/activity), Financeiro, Contratos e UMA busca
 * compartilhada de organização/membros do portal (`useClientePortalData`).
 */
function CentralSkeleton() {
  return (
    <PageContainer className="space-y-8 py-6" aria-busy="true">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </PageContainer>
  );
}

export function ClienteDetailPage({ clienteId }: { clienteId: string }) {
  const navigate = useNavigate();
  const clientes = useClientes();
  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const access = useMyAccess();
  const canManage = hasPermission(access, "clientes");
  const isAdmin = Boolean(access?.isAdmin);
  // Encerrado/Arquivado bloqueiam nova campanha (regra já existente, só reaproveitada aqui).
  const canCreateCampanha =
    canManage &&
    cliente !== null &&
    (clienteStatus(cliente) === "capture" || clienteStatus(cliente) === "active");

  const [editOpen, setEditOpen] = useState(false);
  const [campanhaOpen, setCampanhaOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [campanhasExpanded, setCampanhasExpanded] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const portal = useClientePortalData(clienteId);

  const goBack = () => void navigate({ to: "/time", search: { section: "clientes" } });

  const saveCliente = (form: Omit<Cliente, "id" | "campanhas"> & { id?: string }) => {
    if (!cliente) return;
    const { id: _ignored, ...rest } = form;
    clientesStore.set((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, ...rest } : c)));
    setEditOpen(false);
  };

  const applyStatusPatch = (patch: Partial<Cliente>) => {
    if (!cliente) return;
    clientesStore.set((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, ...patch } : c)));
  };

  const saveCampaign = (c: Campaign) => {
    if (!cliente) return;
    clientesStore.set((prev) =>
      prev.map((cli) => {
        if (cli.id !== cliente.id) return cli;
        const list = cli.campanhas ?? [];
        const exists = list.some((x) => x.id === c.id);
        return {
          ...cli,
          campanhas: exists ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c],
          activity: exists
            ? cli.activity
            : [...(cli.activity ?? []), campanhaCreatedActivityEntry(c.nome)],
        };
      }),
    );
  };

  const requestDelete = async () => {
    if (!cliente) return;
    const campanhaCount = cliente.campanhas?.length ?? 0;
    const ok = await confirm(
      campanhaCount > 0
        ? `Excluir o cliente "${cliente.empresa}"? As ${campanhaCount} campanha(s) vinculada(s) também serão removidas — essa ação não pode ser desfeita.`
        : `Excluir o cliente "${cliente.empresa}"? Essa ação não pode ser desfeita.`,
    );
    if (!ok) return;
    clientesStore.set((prev) => prev.filter((x) => x.id !== cliente.id));
    goBack();
  };

  const openNovaCampanha = () => {
    setEditingCampaign(null);
    setCampanhaOpen(true);
  };

  const openFinanceiro = () => {
    window.dispatchEvent(new CustomEvent("nav:section", { detail: "financeiro" }));
    void navigate({ to: "/time", search: { section: "financeiro" } });
  };

  const verCampanhas = () => {
    setCampanhasExpanded(true);
    document
      .getElementById("campanhas-do-cliente")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (clientes.length === 0) {
    // Store ainda não hidratou (primeiro load) — evita "não encontrado" antes da hora.
    return <CentralSkeleton />;
  }

  if (!cliente) {
    return (
      <PageContainer className="py-16">
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="Cliente não encontrado"
          description="Esse cliente pode ter sido removido ou o link está incorreto."
          primaryAction={{ label: "Voltar para Clientes", onClick: goBack }}
        />
      </PageContainer>
    );
  }

  if (!canManage) {
    return (
      <PageContainer className="py-16">
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="Sem permissão para ver este cliente"
          description="Você não tem a permissão de Clientes necessária para ver esta página."
          primaryAction={{ label: "Voltar", onClick: goBack }}
        />
      </PageContainer>
    );
  }

  const campanhas = cliente.campanhas ?? [];
  const status = clienteStatus(cliente);

  return (
    <>
      <PageContainer className="space-y-8">
        <ClienteHeader
          cliente={cliente}
          canManage={canManage}
          isAdmin={isAdmin}
          canCreateCampanha={canCreateCampanha}
          onBack={goBack}
          onNovaCampanha={openNovaCampanha}
          onEdit={() => setEditOpen(true)}
          onDelete={() => void requestDelete()}
          onStatusApply={applyStatusPatch}
        />

        <ClienteOverview
          cliente={cliente}
          onVerCampanhas={verCampanhas}
          onVerFinanceiro={openFinanceiro}
          onEditarContato={() => setEditOpen(true)}
        />

        {status === "capture" && hasComercialData(cliente) && (
          <ClienteComercialSection cliente={cliente} />
        )}

        <ClienteCampanhasSection
          campanhas={campanhas}
          expanded={campanhasExpanded}
          onToggleExpanded={() => setCampanhasExpanded((v) => !v)}
          canCreate={canCreateCampanha}
          disabledReason={`Cliente ${CLIENTE_STATUS_LABEL[status]} não permite novas campanhas.`}
          onOpen={(c) => {
            setEditingCampaign(c);
            setCampanhaOpen(true);
          }}
        />

        <ClienteContratosSection
          clienteId={cliente.id}
          canManage={canManage}
          campanhas={campanhas}
        />

        <PortalAccessSection portal={portal} clienteNome={cliente.empresa} />

        <ClienteHistorico
          cliente={cliente}
          organizationId={portal.organizationId}
          members={portal.members}
          canSeeAccessLog={isAdmin}
          portalLoading={portal.status === "loading"}
        />
      </PageContainer>

      <ClienteFormSheet
        open={editOpen}
        initial={cliente}
        onClose={() => setEditOpen(false)}
        onSave={saveCliente}
      />

      <VincularCampanhaDialog
        open={campanhaOpen}
        onOpenChange={(o) => {
          setCampanhaOpen(o);
          if (!o) setEditingCampaign(null);
        }}
        clienteNome={cliente.empresa}
        clienteOrcamentoSugerido={cliente.orcamentoSugerido}
        initial={editingCampaign}
        onSave={saveCampaign}
      />
      {confirmDialog}
    </>
  );
}
