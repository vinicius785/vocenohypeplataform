import { useConfirm } from "@/hooks/use-confirm";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, UserPlus2, Users } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
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
import {
  inviteClientUser,
  reactivateClientMember,
  removeClientAccess,
  resendClientInvite,
  suspendClientMember,
  updateClientMemberCampaigns,
  updateClientMemberRole,
} from "@/lib/organization-invites.functions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ClienteSection } from "./ClienteSection";
import {
  accessActivity,
  accessState,
  memberActions,
  removeActionLabel,
  type AccessTone,
} from "./portal-access-ui";
import { initialsOf } from "./cliente-ui";
import type { ClientePortalData, PortalMember } from "./use-cliente-portal-members";

/**
 * Full "Acessos ao portal" management table (Phase 2a, see CLAUDE.md piece
 * A). Phase 1 only shipped invite-creation + a flat list; this expands it
 * with the full row-action set (reenviar convite, alterar função, alterar
 * campanhas liberadas, suspender, reativar, remover).
 */
type ClientRole = "client_standard" | "client_viewer";

type Member = PortalMember;
const ROLE_LABELS: Record<string, string> = {
  client_standard: "Acesso padrão",
  client_viewer: "Somente visualização",
};

/** Menu de ações da linha: só as ações possíveis para o estado do acesso (`memberActions`). */
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
  const actions = memberActions(m.status);
  // Revogado é final no domínio atual: sem menu, em vez de um botão que não faz nada.
  if (actions.length === 0) return <span className="h-9 w-9 shrink-0" aria-hidden="true" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={rowBusyId === m.id}
          aria-label={`Ações para ${m.fullName || m.email || "este acesso"}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.includes("resend") && (
          <DropdownMenuItem onClick={() => onResend(m)}>Reenviar convite</DropdownMenuItem>
        )}
        {actions.includes("reactivate") && (
          <DropdownMenuItem onClick={() => onReactivate(m)}>Reativar acesso</DropdownMenuItem>
        )}
        {actions.includes("role") && (
          <DropdownMenuItem onClick={() => onRole(m)}>Alterar função</DropdownMenuItem>
        )}
        {actions.includes("campaigns") && (
          <DropdownMenuItem onClick={() => onCampaigns(m)}>
            Alterar campanhas liberadas
          </DropdownMenuItem>
        )}
        {actions.includes("suspend") && (
          <DropdownMenuItem onClick={() => onSuspend(m)}>Suspender acesso</DropdownMenuItem>
        )}
        {actions.includes("remove") && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onRemove(m)}
          >
            {removeActionLabel(m.status)}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const TONE_DOT: Record<AccessTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  muted: "bg-muted-foreground/50",
};
const TONE_TEXT: Record<AccessTone, string> = {
  success: "text-foreground",
  warning: "text-foreground",
  danger: "text-destructive",
  muted: "text-text-secondary",
};

/** Estado do acesso ("pode acessar?"): ponto semântico + rótulo; o texto vale mesmo sem a cor. */
function AccessStateLabel({ status }: { status: string }) {
  const st = accessState(status);
  return (
    <span
      title={st.hint}
      className={`inline-flex items-center gap-1.5 text-sm font-medium ${TONE_TEXT[st.tone]}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[st.tone]}`} aria-hidden="true" />
      {st.label}
    </span>
  );
}

export function PortalAccessSection({
  portal,
  clienteNome,
}: {
  /** Dados compartilhados (uma única busca por página) — ver `useClientePortalData`. */
  portal: ClientePortalData;
  clienteNome?: string;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const inviteFn = useServerFn(inviteClientUser);
  const resendFn = useServerFn(resendClientInvite);
  const updateRoleFn = useServerFn(updateClientMemberRole);
  const updateCampaignsFn = useServerFn(updateClientMemberCampaigns);
  const suspendFn = useServerFn(suspendClientMember);
  const reactivateFn = useServerFn(reactivateClientMember);
  const removeFn = useServerFn(removeClientAccess);

  const { organizationId, members, campaigns } = portal;
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
  /** Resultado do último envio de e-mail do convite (null = nenhum convite recente). */
  const [inviteEmail, setInviteEmail] = useState<{
    to: string;
    sent: boolean;
    error: string | null;
  } | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [roleDialogMember, setRoleDialogMember] = useState<Member | null>(null);
  const [roleDialogValue, setRoleDialogValue] = useState<ClientRole>("client_standard");
  const [campaignsDialogMember, setCampaignsDialogMember] = useState<Member | null>(null);
  const [campaignsDialogSelected, setCampaignsDialogSelected] = useState<Set<string>>(new Set());

  const refreshMembers = async (_orgId: string) => {
    await portal.refreshMembers();
  };

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
      setInviteEmail({ to: email.trim(), sent: result.emailSent, error: result.emailError });
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
        const freshList = (await portal.refreshMembers()) ?? [];
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
      setInviteEmail({
        to: m.email ?? "o convidado",
        sent: result.emailSent,
        error: result.emailError,
      });
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
  const handleRemove = async (m: Member) => {
    if (
      !(await confirm("Esta ação pode ser revertida reativando o acesso depois.", {
        title: "Remover acesso ao portal?",
        confirmLabel: "Remover acesso",
        destructive: true,
      }))
    )
      return;
    return withRowBusy(m.id, () =>
      removeFn({ data: { organizationMemberId: m.id } }).then(() => {}),
    );
  };

  const openInvite = () => {
    setShowForm(true);
    setTempPassword(null);
    setError(null);
  };

  if (portal.status === "loading") {
    return (
      <ClienteSection id="acessos-ao-portal" title="Acessos ao portal">
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </ClienteSection>
    );
  }
  if (portal.status === "error") {
    return (
      <ClienteSection id="acessos-ao-portal" title="Acessos ao portal">
        <p role="alert" className="text-sm text-text-secondary">
          Não foi possível carregar os acessos agora. Atualize a página para tentar de novo.
        </p>
      </ClienteSection>
    );
  }
  // Cliente sem organização no portal: nada a administrar aqui.
  if (!organizationId) return null;

  return (
    <ClienteSection
      id="acessos-ao-portal"
      title="Acessos ao portal"
      count={members?.length ?? 0}
      action={
        <Button variant="outline" size="sm" onClick={openInvite} className="shrink-0 gap-1.5">
          <UserPlus2 className="h-3.5 w-3.5" aria-hidden="true" /> Convidar usuário
        </Button>
      }
    >
      {confirmDialog}

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

      {inviteEmail && (
        <div role="status" className="mb-3 rounded-xl border border-border/60 bg-card p-3 text-xs">
          <p className="font-medium text-foreground">
            {inviteEmail.sent
              ? `Convite enviado por e-mail para ${inviteEmail.to}.`
              : "O convite foi criado, mas o e-mail não foi enviado."}
          </p>
          {!inviteEmail.sent && (
            <p className="mt-1 text-text-secondary">
              {inviteEmail.error ? `${inviteEmail.error} ` : ""}
              {tempPassword
                ? "Compartilhe a senha temporária abaixo ou use “Reenviar convite” depois."
                : "Use “Reenviar convite” para tentar de novo."}
            </p>
          )}
        </div>
      )}

      {tempPassword && (
        <div className="mb-3 rounded-xl border border-border/60 bg-card p-3 text-xs">
          <p className="font-medium text-foreground">
            {inviteEmail?.sent
              ? "Senha temporária (opcional — o convidado recebeu um link por e-mail para criar a própria senha):"
              : inviteWasExistingAccount
                ? "Conta existente vinculada. Senha temporária (caso precise):"
                : "Senha temporária para o primeiro acesso:"}
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
            Só é exibida agora; não fica disponível depois.
          </p>
        </div>
      )}

      {rowError && <p className="mb-2 text-xs text-destructive">{rowError}</p>}

      {members && members.length > 0 ? (
        <div>
          <div
            aria-hidden="true"
            className="hidden border-b border-border/60 pb-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary md:grid md:grid-cols-[2rem_minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)_2.25rem] md:gap-x-3"
          >
            <span />
            <span>Pessoa</span>
            <span>E-mail</span>
            <span>Função</span>
            <span>Acesso</span>
            <span>Atividade</span>
            <span />
          </div>
          <ul className="divide-y divide-border/60">
            {members.map((m) => {
              const name = m.fullName || m.email || "Sem nome";
              const restricted = m.campaignIds.length > 0;
              const activity = accessActivity(m);
              const roleLabel = ROLE_LABELS[m.role] ?? m.role;
              const scope = restricted
                ? `${m.campaignIds.length} ${m.campaignIds.length === 1 ? "campanha" : "campanhas"}`
                : null;
              return (
                <li key={m.id} className={`py-3 ${rowBusyId === m.id ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3 md:grid md:grid-cols-[2rem_minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)_2.25rem] md:gap-x-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-muted text-[11px] font-semibold text-text-secondary">
                        {initialsOf(name) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 md:contents">
                      <p className="truncate text-sm font-medium text-foreground">
                        {m.fullName || "Sem nome"}
                      </p>
                      <p className="truncate text-xs text-text-secondary md:text-sm">
                        {m.email || "—"}
                      </p>
                      <p className="hidden truncate text-sm text-text-secondary md:block">
                        {roleLabel}
                        {scope && <span className="block text-xs">{scope}</span>}
                      </p>
                      <p className="hidden md:block">
                        <AccessStateLabel status={m.status} />
                      </p>
                      <p
                        title={activity.title}
                        className="hidden truncate text-sm text-text-secondary md:block"
                      >
                        {activity.text}
                      </p>
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
                  {/* Mobile: duas linhas separadas — estado do acesso e atividade. */}
                  <div className="mt-1.5 space-y-0.5 pl-11 md:hidden">
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-secondary">
                      <AccessStateLabel status={m.status} />
                      <span>
                        {roleLabel}
                        {scope ? ` · ${scope}` : ""}
                      </span>
                    </p>
                    <p title={activity.title} className="text-xs text-text-secondary">
                      {activity.text}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <EmptyState
          compact
          icon={<Users className="h-5 w-5" />}
          title="Nenhum acesso ao portal"
          description="Convide uma pessoa do cliente para acompanhar campanhas e aprovações."
        />
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
    </ClienteSection>
  );
}
