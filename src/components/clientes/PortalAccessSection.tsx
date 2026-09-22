import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, UserPlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getClienteOrganizationId,
  inviteClientUser,
  listOrganizationCampaigns,
  listOrganizationMembers,
  reactivateClientMember,
  removeClientAccess,
  resendClientInvite,
  suspendClientMember,
  updateClientMemberCampaigns,
  updateClientMemberRole,
} from "@/lib/organization-invites.functions";
import { deactivateClientToken } from "@/lib/clientes.functions";
import { clientesStore } from "@/lib/clientes-store";
import { isInviteCosmeticallyExpired } from "@/lib/access-audit-labels";

/**
 * Full "Acessos ao portal" management table (Phase 2a, see CLAUDE.md piece
 * A). Phase 1 only shipped invite-creation + a flat list; this expands it
 * with the full row-action set (reenviar convite, alterar função, alterar
 * campanhas liberadas, suspender, reativar, remover).
 */
type ClientRole = "client_standard" | "client_viewer";

type Member = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  invited_at: string | null;
  accepted_at: string | null;
  last_access_at: string | null;
  email: string | null;
  fullName: string | null;
  campaignIds: string[];
};

type Campaign = { id: string; nome: string };

const ROLE_LABELS: Record<string, string> = {
  client_standard: "Acesso padrão",
  client_viewer: "Somente visualização",
};

const STATUS_LABELS: Record<string, string> = {
  invited: "Convite pendente",
  active: "Ativo",
  suspended: "Suspenso",
  removed: "Convite revogado",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  invited: "outline",
  active: "default",
  suspended: "secondary",
  removed: "destructive",
};

/** Cosmetic-only "Convite expirado" label — see `isInviteCosmeticallyExpired`
 * in `access-audit-labels.ts` for why this is NOT server-enforced. */
function statusLabel(m: Member): string {
  if (isInviteCosmeticallyExpired(m)) return "Convite expirado";
  return STATUS_LABELS[m.status] ?? m.status;
}
function statusVariant(m: Member): "default" | "secondary" | "outline" | "destructive" {
  if (isInviteCosmeticallyExpired(m)) return "secondary";
  return STATUS_VARIANT[m.status] ?? "outline";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

/** Row action menu, shared by the desktop table row and the mobile card
 * (spec: "actions grouped in menu" on both). Pure presentational wrapper
 * around the same handlers `PortalAccessSection` already owned. */
function MemberRowMenu({
  m,
  rowBusyId,
  onResend,
  onRole,
  onCampaigns,
  onSuspend,
  onReactivate,
  onRemove,
}: {
  m: Member;
  rowBusyId: string | null;
  onResend: (m: Member) => void;
  onRole: (m: Member) => void;
  onCampaigns: (m: Member) => void;
  onSuspend: (m: Member) => void;
  onReactivate: (m: Member) => void;
  onRemove: (m: Member) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={rowBusyId === m.id}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={m.status !== "invited"} onClick={() => onResend(m)}>
          Reenviar convite
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRole(m)}>Alterar função</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCampaigns(m)}>
          Alterar campanhas liberadas
        </DropdownMenuItem>
        {m.status === "active" && (
          <DropdownMenuItem onClick={() => onSuspend(m)}>Suspender</DropdownMenuItem>
        )}
        {m.status === "suspended" && (
          <DropdownMenuItem onClick={() => onReactivate(m)}>Reativar</DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={m.status === "removed"}
          onClick={() => onRemove(m)}
        >
          Remover acesso
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PortalAccessSection({
  clienteId,
  clienteNome,
  publicToken,
}: {
  clienteId: string;
  clienteNome?: string;
  publicToken?: string;
}) {
  const getOrgIdFn = useServerFn(getClienteOrganizationId);
  const listMembersFn = useServerFn(listOrganizationMembers);
  const listCampaignsFn = useServerFn(listOrganizationCampaigns);
  const inviteFn = useServerFn(inviteClientUser);
  const resendFn = useServerFn(resendClientInvite);
  const updateRoleFn = useServerFn(updateClientMemberRole);
  const updateCampaignsFn = useServerFn(updateClientMemberCampaigns);
  const suspendFn = useServerFn(suspendClientMember);
  const reactivateFn = useServerFn(reactivateClientMember);
  const removeFn = useServerFn(removeClientAccess);
  const deactivateTokenFn = useServerFn(deactivateClientToken);
  const [deactivatingToken, setDeactivatingToken] = useState(false);

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<ClientRole>("client_standard");
  const [campaignScope, setCampaignScope] = useState<"all" | "specific">("all");
  const [inviteCampaignIds, setInviteCampaignIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [inviteWasExistingAccount, setInviteWasExistingAccount] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [roleDialogMember, setRoleDialogMember] = useState<Member | null>(null);
  const [roleDialogValue, setRoleDialogValue] = useState<ClientRole>("client_standard");
  const [campaignsDialogMember, setCampaignsDialogMember] = useState<Member | null>(null);
  const [campaignsDialogSelected, setCampaignsDialogSelected] = useState<Set<string>>(new Set());

  const campaignNameById = useMemo(
    () => new Map(campaigns.map((c) => [c.id, c.nome])),
    [campaigns],
  );

  const refreshMembers = async (orgId: string) => {
    const list = await listMembersFn({ data: { organizationId: orgId } });
    setMembers(list);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { organizationId: orgId } = await getOrgIdFn({ data: { clienteId } });
        if (cancelled) return;
        setOrganizationId(orgId);
        if (orgId) {
          await refreshMembers(orgId);
          const list = await listCampaignsFn({ data: { organizationId: orgId } });
          if (!cancelled) setCampaigns(list);
        }
      } catch {
        if (!cancelled) setOrganizationId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    setError(null);
    setLoading(true);
    try {
      const result = await inviteFn({
        data: { organizationId, email: email.trim(), fullName: fullName.trim(), role },
      });
      setInviteWasExistingAccount(result.existingAccount);
      setTempPassword(result.tempPassword);
      await refreshMembers(organizationId);

      // "Campanhas liberadas" at invite time (spec) — a second call right
      // after creation, reusing the same `updateClientMemberCampaigns`
      // already used by the row-action dialog below. `inviteClientUserCore`
      // returns the AUTH user id, not the `organization_members.id` this
      // mutation needs, so the just-created row is located by matching
      // `user_id` in the freshly refreshed list. Only fired when the admin
      // picked "Selecionar campanhas específicas"; the default ("Todas")
      // needs no call since an empty campaignIds list already means full
      // access (see the column's own "Todas" fallback).
      if (campaignScope === "specific" && inviteCampaignIds.size > 0) {
        const freshList = await listMembersFn({ data: { organizationId } });
        const created = freshList.find((mm) => mm.user_id === result.id);
        if (created) {
          try {
            await updateCampaignsFn({
              data: { organizationMemberId: created.id, campaignIds: [...inviteCampaignIds] },
            });
            await refreshMembers(organizationId);
          } catch {
            // Best-effort: the invite itself already succeeded — a failure
            // here just leaves the member with full-org access, adjustable
            // later from the row menu.
          }
        }
      }

      setEmail("");
      setFullName("");
      setRole("client_standard");
      setCampaignScope("all");
      setInviteCampaignIds(new Set());
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao convidar usuário.");
    } finally {
      setLoading(false);
    }
  };

  const withRowBusy = async (memberId: string, action: () => Promise<void>) => {
    if (!organizationId) return;
    setRowError(null);
    setRowBusyId(memberId);
    try {
      await action();
      await refreshMembers(organizationId);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Erro ao atualizar acesso.");
    } finally {
      setRowBusyId(null);
    }
  };

  const handleResend = (m: Member) =>
    withRowBusy(m.id, async () => {
      const result = await resendFn({ data: { organizationMemberId: m.id } });
      setTempPassword(result.tempPassword);
    });

  const openRoleDialog = (m: Member) => {
    setRoleDialogMember(m);
    setRoleDialogValue((m.role as ClientRole) ?? "client_standard");
  };

  const confirmRoleChange = async () => {
    if (!roleDialogMember) return;
    await withRowBusy(roleDialogMember.id, async () => {
      await updateRoleFn({
        data: { organizationMemberId: roleDialogMember.id, role: roleDialogValue },
      });
    });
    setRoleDialogMember(null);
  };

  const openCampaignsDialog = (m: Member) => {
    setCampaignsDialogMember(m);
    setCampaignsDialogSelected(new Set(m.campaignIds));
  };

  const toggleCampaign = (id: string) => {
    setCampaignsDialogSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmCampaignsChange = async () => {
    if (!campaignsDialogMember) return;
    await withRowBusy(campaignsDialogMember.id, async () => {
      await updateCampaignsFn({
        data: {
          organizationMemberId: campaignsDialogMember.id,
          campaignIds: [...campaignsDialogSelected],
        },
      });
    });
    setCampaignsDialogMember(null);
  };

  const handleSuspend = (m: Member) =>
    withRowBusy(m.id, () => suspendFn({ data: { organizationMemberId: m.id } }).then(() => {}));
  const handleReactivate = (m: Member) =>
    withRowBusy(m.id, () => reactivateFn({ data: { organizationMemberId: m.id } }).then(() => {}));
  const handleRemove = (m: Member) => {
    if (
      !window.confirm(
        "Remover o acesso ao portal deste usuário? Esta ação pode ser revertida reativando o acesso depois.",
      )
    )
      return;
    return withRowBusy(m.id, () =>
      removeFn({ data: { organizationMemberId: m.id } }).then(() => {}),
    );
  };

  const handleDeactivateToken = async () => {
    if (
      !window.confirm(
        "Tem certeza? Isso desativa o link antigo do portal (/portal/...) para este cliente — " +
          "só faça isso depois de confirmar que ele já está usando o novo login. Essa ação não " +
          "tem volta automática (seria preciso gerar um link novo depois).",
      )
    )
      return;
    setDeactivatingToken(true);
    try {
      await deactivateTokenFn({ data: { clienteId } });
      clientesStore.set((prev) =>
        prev.map((cl) => (cl.id === clienteId ? { ...cl, publicToken: undefined } : cl)),
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Falha ao desativar o link.");
    } finally {
      setDeactivatingToken(false);
    }
  };

  if (!organizationId) return null;

  return (
    <div>
      {publicToken && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Acesso antigo ainda ativo
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Este cliente ainda pode acessar o portal pelo link compartilhado. Migre os usuários para
            login e senha antes de desativá-lo.
            {members && members.some((m) => m.status === "active") && (
              <> Recomendamos desativar assim que possível.</>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
              disabled={deactivatingToken}
              onClick={handleDeactivateToken}
            >
              Desativar acesso antigo
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(
                  `${window.location.origin}/portal/${publicToken}`,
                );
              }}
            >
              Copiar link antigo
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm">
                  Ver instruções de migração
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 text-xs text-text-secondary">
                Convide cada pessoa do cliente pelo botão "Convidar usuário" acima, usando o e-mail
                que ela vai usar para logar. Depois que todas confirmarem o novo acesso, desative o
                link antigo — ele deixa de funcionar imediatamente para quem ainda o usava.
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Acessos ao portal</h4>
          <p className="text-xs text-text-secondary">
            Pessoas autorizadas a acessar as campanhas deste cliente.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShowForm(true);
            setTempPassword(null);
            setError(null);
          }}
          className="shrink-0 gap-1.5"
        >
          <UserPlus2 className="h-3.5 w-3.5" /> Convidar usuário
        </Button>
      </div>

      <Dialog open={showForm} onOpenChange={(v) => (v ? setShowForm(true) : setShowForm(false))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar para o portal</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">
            Esta pessoa receberá um convite para acessar as campanhas da{" "}
            {clienteNome ? <strong>{clienteNome}</strong> : "empresa"}.
          </p>
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Nome</label>
              <input
                type="text"
                required
                placeholder="Nome"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">E-mail</label>
              <input
                type="email"
                required
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Tipo de acesso</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setRole("client_standard")}
                  className={`rounded-xl border p-3 text-left text-xs transition-colors ${
                    role === "client_standard"
                      ? "border-brand bg-brand/5"
                      : "border-border/60 hover:bg-muted/40"
                  }`}
                >
                  <p className="font-medium text-foreground">Acesso padrão</p>
                  <p className="mt-1 text-text-secondary">
                    Pode acompanhar campanhas, comentar e realizar aprovações.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setRole("client_viewer")}
                  className={`rounded-xl border p-3 text-left text-xs transition-colors ${
                    role === "client_viewer"
                      ? "border-brand bg-brand/5"
                      : "border-border/60 hover:bg-muted/40"
                  }`}
                >
                  <p className="font-medium text-foreground">Somente visualização</p>
                  <p className="mt-1 text-text-secondary">
                    Pode consultar informações, sem comentar ou aprovar.
                  </p>
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Campanhas liberadas</label>
              <div className="space-y-2 rounded-xl border border-border/60 p-2">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="campaignScope"
                    checked={campaignScope === "all"}
                    onChange={() => setCampaignScope("all")}
                  />
                  Todas as campanhas atuais e futuras
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="campaignScope"
                    checked={campaignScope === "specific"}
                    onChange={() => setCampaignScope("specific")}
                  />
                  Selecionar campanhas específicas
                </label>
                {campaignScope === "specific" && (
                  <div className="max-h-32 space-y-1 overflow-y-auto border-t border-border/60 pt-2">
                    {campaigns.length === 0 && (
                      <p className="text-xs text-text-secondary">Nenhuma campanha cadastrada.</p>
                    )}
                    {campaigns.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={inviteCampaignIds.has(c.id)}
                          onChange={() =>
                            setInviteCampaignIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.id)) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            })
                          }
                        />
                        {c.nome}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? "Enviando..." : "Enviar convite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {tempPassword && (
        <div className="mb-3 rounded-xl border border-border/60 bg-card p-3 text-xs">
          <p className="font-medium text-foreground">
            {inviteWasExistingAccount
              ? "Convite enviado — conta existente vinculada. Senha temporária (caso precise):"
              : "Convite enviado. Senha temporária para o primeiro acesso:"}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <p className="select-all rounded bg-muted px-2 py-1 font-mono text-foreground">
              {tempPassword}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(tempPassword)}
            >
              Copiar senha temporária
            </Button>
          </div>
          <p className="mt-1 text-text-secondary">
            Compartilhe manualmente (WhatsApp/e-mail) — não há envio automático nesta fase. Só é
            exibida agora; não fica disponível depois.
          </p>
        </div>
      )}

      {rowError && <p className="mb-2 text-xs text-destructive">{rowError}</p>}

      {members && members.length > 0 ? (
        <>
          {/* Mobile: cards, not a cramped table (spec requirement). */}
          <div className="space-y-2 sm:hidden">
            {members.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl border border-border/60 p-3 ${rowBusyId === m.id ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {m.fullName || "—"}
                    </p>
                    <p className="truncate text-xs text-text-secondary">{m.email || "—"}</p>
                  </div>
                  <MemberRowMenu
                    m={m}
                    rowBusyId={rowBusyId}
                    onResend={handleResend}
                    onRole={openRoleDialog}
                    onCampaigns={openCampaignsDialog}
                    onSuspend={handleSuspend}
                    onReactivate={handleReactivate}
                    onRemove={handleRemove}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant={statusVariant(m)}>{statusLabel(m)}</Badge>
                  <span className="text-xs text-text-secondary">
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-text-secondary">
                  <div>
                    <dt className="font-medium text-foreground">Campanhas</dt>
                    <dd className="truncate">
                      {m.campaignIds.length === 0
                        ? "Todas"
                        : m.campaignIds.map((id) => campaignNameById.get(id) ?? id).join(", ")}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">Convite</dt>
                    <dd>{formatDate(m.invited_at)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">Último acesso</dt>
                    <dd>{formatDate(m.last_access_at)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-border/60 sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Campanhas liberadas</TableHead>
                  <TableHead>Data do convite</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id} className={rowBusyId === m.id ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">{m.fullName || "—"}</TableCell>
                    <TableCell className="text-text-secondary">{m.email || "—"}</TableCell>
                    <TableCell>{ROLE_LABELS[m.role] ?? m.role}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(m)}>{statusLabel(m)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-text-secondary">
                      {m.campaignIds.length === 0
                        ? "Todas"
                        : m.campaignIds.map((id) => campaignNameById.get(id) ?? id).join(", ")}
                    </TableCell>
                    <TableCell className="text-text-secondary">
                      {formatDate(m.invited_at)}
                    </TableCell>
                    <TableCell className="text-text-secondary">
                      {formatDate(m.last_access_at)}
                    </TableCell>
                    <TableCell>
                      <MemberRowMenu
                        m={m}
                        rowBusyId={rowBusyId}
                        onResend={handleResend}
                        onRole={openRoleDialog}
                        onCampaigns={openCampaignsDialog}
                        onSuspend={handleSuspend}
                        onReactivate={handleReactivate}
                        onRemove={handleRemove}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4 text-center">
          <p className="text-sm font-medium text-foreground">Nenhum acesso ao portal</p>
          <p className="mt-1 text-xs text-text-secondary">
            Convide uma pessoa do cliente para acompanhar campanhas e aprovações.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-1.5"
            onClick={() => {
              setShowForm(true);
              setTempPassword(null);
              setError(null);
            }}
          >
            <UserPlus2 className="h-3.5 w-3.5" /> Convidar usuário
          </Button>
        </div>
      )}

      <Dialog open={!!roleDialogMember} onOpenChange={(v) => !v && setRoleDialogMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar função</DialogTitle>
          </DialogHeader>
          <Select
            value={roleDialogValue}
            onValueChange={(v) => setRoleDialogValue(v as ClientRole)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="client_standard">Acesso padrão</SelectItem>
              <SelectItem value="client_viewer">Somente visualização</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogMember(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={confirmRoleChange}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!campaignsDialogMember}
        onOpenChange={(v) => !v && setCampaignsDialogMember(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Campanhas liberadas</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-text-secondary">
            Nenhuma selecionada = acesso a todas as campanhas do cliente.
          </p>
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {campaigns.length === 0 && (
              <p className="text-xs text-text-secondary">Nenhuma campanha cadastrada.</p>
            )}
            {campaigns.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={campaignsDialogSelected.has(c.id)}
                  onChange={() => toggleCampaign(c.id)}
                  className="h-3.5 w-3.5 rounded border-input accent-foreground"
                />
                {c.nome}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignsDialogMember(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={confirmCampaignsChange}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
