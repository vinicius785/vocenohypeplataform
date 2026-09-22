import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  Mail,
  MessageCircle,
  MoreVertical,
  Pencil,
  Megaphone,
  Trash2,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/hooks/use-confirm";
import { useMyAccess, hasPermission } from "@/lib/permissions";
import { clientesStore, useClientes, type Cliente } from "@/lib/clientes-store";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import { VincularCampanhaDialog } from "@/components/VincularCampanhaDialog";
import { ClienteFormSheet } from "./ClienteFormSheet";
import { ClienteLogo } from "./ClienteLogo";
import { PortalAccessSection } from "./PortalAccessSection";
import { waLink, mailtoLink } from "./cliente-ui";
import { listAuditLog } from "@/lib/audit-log.functions";
import {
  getClienteOrganizationId,
  listOrganizationMembers,
} from "@/lib/organization-invites.functions";
import { accessAuditActionLabel } from "@/lib/access-audit-labels";
import { formatIsoDate } from "@/lib/utils";

/**
 * Full client-detail page (Part 2 of the client-detail-page rebuild — Part 1
 * was the backend/DB work in `organization-invites.functions.ts`, already
 * committed). Replaces `ClienteDetailsSheet.tsx` as the surface where
 * campaigns/access/editing happen; the drawer's ONLY call site
 * (`ClientesSection.tsx`'s row click) now navigates here instead. See
 * CLAUDE.md's routing conventions — this is the one other real nested route
 * in Clientes, mirroring `projeto.$id.tsx`'s "not found" + header pattern.
 */

function statusRelacionamento(cliente: Cliente): { label: string; tone: string } {
  // `Cliente` não tem um campo de status de relacionamento armazenado (ver
  // nota em `cliente-ui.ts`: "Campaign não tem status" — o mesmo vale pro
  // cliente). Isto é um rótulo PURAMENTE inferido para a UI, não um dado
  // persistido — documentado no relatório final.
  const hasCampanha = (cliente.campanhas?.length ?? 0) > 0;
  return hasCampanha
    ? { label: "Ativo", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" }
    : { label: "Sem campanha ativa", tone: "bg-muted text-text-secondary" };
}

export function ClienteDetailPage({ clienteId }: { clienteId: string }) {
  const navigate = useNavigate();
  const clientes = useClientes();
  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const access = useMyAccess();
  const canManage = hasPermission(access, "clientes");

  const [editOpen, setEditOpen] = useState(false);
  const [campanhaOpen, setCampanhaOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const getOrgIdFn = useServerFn(getClienteOrganizationId);
  const listAuditFn = useServerFn(listAuditLog);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<
    Awaited<ReturnType<typeof listAuditLog>>["rows"] | null
  >(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      let orgId = organizationId;
      if (!orgId) {
        const res = await getOrgIdFn({ data: { clienteId } });
        orgId = res.organizationId;
        setOrganizationId(orgId);
      }
      if (!orgId) {
        setHistoryRows([]);
        return;
      }
      const res = await listAuditFn({ data: { organizationId: orgId, page: 0, pageSize: 50 } });
      setHistoryRows(res.rows);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Erro ao carregar histórico.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const goBack = () => void navigate({ to: "/time", search: { section: "clientes" } });

  const saveCliente = (form: Omit<Cliente, "id" | "campanhas"> & { id?: string }) => {
    if (!cliente) return;
    const { id: _ignored, ...rest } = form;
    clientesStore.set((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, ...rest } : c)));
    setEditOpen(false);
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

  const campanhas = cliente?.campanhas ?? [];
  const relacionamento = cliente ? statusRelacionamento(cliente) : null;

  const [portalUsersCount, setPortalUsersCount] = useState<number | null>(null);
  const listMembersFn = useServerFn(listOrganizationMembers);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { organizationId: orgId } = await getOrgIdFn({ data: { clienteId } });
        if (cancelled) return;
        setOrganizationId(orgId);
        if (!orgId) {
          setPortalUsersCount(0);
          return;
        }
        const members = await listMembersFn({ data: { organizationId: orgId } });
        if (!cancelled) setPortalUsersCount(members.length);
      } catch {
        if (!cancelled) setPortalUsersCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  if (clientes.length === 0) {
    // Store ainda não hidratou (primeiro load) — evita mostrar "não
    // encontrado" antes da hora.
    return (
      <PageContainer className="space-y-4 py-10">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-24 w-full animate-pulse rounded-2xl bg-muted" />
        <div className="h-40 w-full animate-pulse rounded-2xl bg-muted" />
      </PageContainer>
    );
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
          title="Sem permissão para administrar acessos"
          description="Você não tem a permissão de Clientes necessária para ver esta página."
          primaryAction={{ label: "Voltar", onClick: goBack }}
        />
      </PageContainer>
    );
  }

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-muted p-4 dark:bg-transparent md:-m-8 md:p-8">
      <PageContainer className="space-y-6">
        {/* Breadcrumb simples (mesmo padrão de "Voltar para X" de
         * projeto.$id.tsx — não existe componente de breadcrumb dedicado). */}
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Clientes
          <span className="text-text-secondary">/</span>
          <span className="text-foreground">{cliente.empresa}</span>
        </button>

        {/* ===== Cabeçalho ===== */}
        <div className="rounded-2xl bg-card p-5 dark:shadow-none md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <ClienteLogo photo={cliente.photo} empresa={cliente.empresa} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-xl font-bold text-foreground">{cliente.empresa}</p>
                <p className="truncate text-sm text-text-secondary">
                  {cliente.responsavel || "Contato não informado"}
                </p>
                {relacionamento && (
                  <span
                    className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${relacionamento.tone}`}
                  >
                    {relacionamento.label}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              <Button
                variant="primary"
                size="comfortable"
                className="w-full gap-1.5 sm:w-auto"
                onClick={() => {
                  setEditingCampaign(null);
                  setCampanhaOpen(true);
                }}
              >
                <Megaphone className="h-4 w-4" /> Nova campanha
              </Button>
              <Button
                variant="outline"
                size="comfortable"
                className="w-full gap-1.5 sm:w-auto"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4" /> Editar cliente
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Mais ações"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-muted hover:text-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      const el = document.getElementById("acessos-ao-portal");
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    Gerenciar acesso antigo
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => void requestDelete()}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir cliente
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border/60 pt-4 text-xs sm:grid-cols-4">
            <div>
              <dt className="font-medium uppercase tracking-wide text-text-secondary">
                Responsável interno
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {cliente.responsavelInterno || "—"}
              </dd>
            </div>
            <div>
              <dt className="font-medium uppercase tracking-wide text-text-secondary">Campanhas</dt>
              <dd className="mt-0.5 text-sm text-foreground">{campanhas.length}</dd>
            </div>
            <div>
              <dt className="font-medium uppercase tracking-wide text-text-secondary">
                Usuários com acesso
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">{portalUsersCount ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium uppercase tracking-wide text-text-secondary">
                Cliente desde
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {cliente.clienteDesde
                  ? new Date(cliente.clienteDesde).toLocaleDateString("pt-BR")
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        {/* ===== Informações do cliente ===== */}
        <section className="rounded-2xl bg-card p-5 dark:shadow-none md:p-6">
          <h2 className="text-sm font-semibold text-foreground">Informações do cliente</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField label="Contato principal" value={cliente.responsavel || "Não informado"} />
            <InfoField
              label="E-mail"
              value={cliente.email || "E-mail não informado"}
              href={cliente.email ? mailtoLink(cliente.email) : null}
              icon={<Mail className="h-3.5 w-3.5" />}
            />
            <InfoField
              label="WhatsApp"
              value={cliente.whatsapp || "WhatsApp não informado"}
              href={cliente.whatsapp ? waLink(cliente.whatsapp) : null}
              icon={<MessageCircle className="h-3.5 w-3.5" />}
            />
            <InfoField
              label="Responsável interno"
              value={cliente.responsavelInterno || "Sem responsável interno"}
            />
            <InfoField
              label="Cliente desde"
              value={
                cliente.clienteDesde
                  ? new Date(cliente.clienteDesde).toLocaleDateString("pt-BR")
                  : "Data não informada"
              }
            />
          </div>
        </section>

        {/* ===== Campanhas ===== */}
        <section className="rounded-2xl bg-card p-5 dark:shadow-none md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Campanhas</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
              {campanhas.length}
            </span>
          </div>
          {campanhas.length === 0 ? (
            <EmptyState
              icon={<Megaphone className="h-5 w-5" />}
              compact
              title="Nenhuma campanha criada para este cliente."
              description="Crie a primeira campanha para começar a operação."
              primaryAction={{
                label: "Nova campanha",
                onClick: () => {
                  setEditingCampaign(null);
                  setCampanhaOpen(true);
                },
              }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {campanhas.map((camp) => (
                <button
                  key={camp.id}
                  type="button"
                  onClick={() => {
                    setEditingCampaign(camp);
                    setCampanhaOpen(true);
                  }}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:bg-accent/40"
                >
                  <ClienteLogo photo={cliente.photo} empresa={cliente.empresa} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{camp.nome}</p>
                    <p className="truncate text-xs text-text-secondary">
                      {camp.prazo ? `Prazo ${formatIsoDate(camp.prazo)}` : "Sem prazo"}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {(camp.linhas ?? []).reduce((s, l) => s + (l.quantidade || 0), 0)}{" "}
                      influenciador(es) planejado(s)
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ===== Acessos ao portal ===== */}
        <section id="acessos-ao-portal" className="rounded-2xl bg-card p-5 dark:shadow-none md:p-6">
          <PortalAccessSection
            clienteId={cliente.id}
            clienteNome={cliente.empresa}
            publicToken={cliente.publicToken}
          />
        </section>

        {/* ===== Histórico (colapsável, fechado por padrão) ===== */}
        <section className="rounded-2xl bg-card p-5 dark:shadow-none md:p-6">
          <button
            type="button"
            onClick={() => {
              const next = !historyOpen;
              setHistoryOpen(next);
              if (next && historyRows === null) void loadHistory();
            }}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <History className="h-4 w-4" /> Histórico do cliente
            </span>
            <ChevronDown
              className={`h-4 w-4 text-text-secondary transition-transform ${historyOpen ? "rotate-180" : ""}`}
            />
          </button>
          {historyOpen && (
            <div className="mt-4 space-y-2">
              {historyLoading && (
                <p className="text-xs text-text-secondary">Carregando histórico...</p>
              )}
              {historyError && <p className="text-xs text-destructive">{historyError}</p>}
              {!historyLoading && historyRows && historyRows.length === 0 && (
                <p className="text-xs text-text-secondary">
                  Nenhum evento registrado para este cliente ainda.
                </p>
              )}
              {!historyLoading &&
                historyRows &&
                historyRows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-border/60 p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {accessAuditActionLabel(row.action)}
                      </span>
                      <span className="whitespace-nowrap text-text-secondary">
                        {new Date(row.created_at).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-text-secondary">
                      Responsável: {row.actorEmail ?? row.actor_user_id}
                    </p>
                    {row.new_value != null && (
                      <p className="mt-0.5 truncate text-text-secondary">
                        {JSON.stringify(row.new_value)}
                      </p>
                    )}
                  </div>
                ))}
              <p className="pt-1 text-[11px] text-text-secondary">
                Mostra apenas eventos já registrados em <code>access_audit_log</code> (convites,
                mudanças de função/campanhas, suspensão/reativação/remoção, desativação do link
                antigo). Eventos de ciclo de vida de cliente/campanha (criação, edição,
                arquivamento) não têm logging hoje e ficam fora desta lista — ver relatório da
                tarefa.
              </p>
            </div>
          )}
        </section>
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
    </div>
  );
}

function InfoField({
  label,
  value,
  href,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  href?: string | null;
  icon?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      {href ? (
        <a
          href={href}
          target={href.startsWith("mailto:") ? undefined : "_blank"}
          rel="noopener noreferrer"
          className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-medium text-brand hover:underline"
        >
          {icon}
          {value}
        </a>
      ) : (
        <p className="mt-0.5 truncate text-sm text-foreground">{value}</p>
      )}
    </div>
  );
}
