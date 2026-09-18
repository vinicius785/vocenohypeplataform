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

/**
 * Full "Acessos ao portal" management table (Phase 2a, see CLAUDE.md piece
 * A). Phase 1 only shipped invite-creation + a flat list; this expands it
 * with the full row-action set (reenviar convite, alterar função, alterar
 * campanhas liberadas, suspender, reativar, remover).
 */
type ClientRole = "client_admin" | "client_member" | "client_viewer";

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
  client_admin: "Administrador do cliente",
  client_member: "Membro",
  client_viewer: "Visualizador",
};

const STATUS_LABELS: Record<string, string> = {
  invited: "Convidado",
  active: "Ativo",
  suspended: "Suspenso",
  removed: "Removido",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  invited: "outline",
  active: "default",
  suspended: "secondary",
  removed: "destructive",
};

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

export function PortalAccessSection({ clienteId }: { clienteId: string }) {
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

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<ClientRole>("client_member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [roleDialogMember, setRoleDialogMember] = useState<Member | null>(null);
  const [roleDialogValue, setRoleDialogValue] = useState<ClientRole>("client_member");
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
      setTempPassword(result.tempPassword);
      setEmail("");
      setFullName("");
      setRole("client_member");
      await refreshMembers(organizationId);
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
    setRoleDialogValue((m.role as ClientRole) ?? "client_member");
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

  if (!organizationId) return null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Acessos ao portal
        </h4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShowForm((v) => !v);
            setTempPassword(null);
            setError(null);
          }}
          className="gap-1.5"
        >
          <UserPlus2 className="h-3.5 w-3.5" /> Convidar
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={handleInvite}
          className="mb-3 space-y-2 rounded-xl border border-border/60 bg-muted/40 p-3"
        >
          <input
            type="email"
            required
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          <input
            type="text"
            placeholder="Nome"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ClientRole)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          >
            <option value="client_admin">Administrador do cliente</option>
            <option value="client_member">Membro</option>
            <option value="client_viewer">Visualizador</option>
          </select>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" variant="primary" size="sm" disabled={loading}>
            {loading ? "Convidando..." : "Convidar"}
          </Button>
        </form>
      )}

      {tempPassword && (
        <div className="mb-3 rounded-xl border border-border/60 bg-card p-3 text-xs">
          <p className="font-medium text-foreground">Senha temporária:</p>
          <p className="mt-1 select-all rounded bg-muted px-2 py-1 font-mono text-foreground">
            {tempPassword}
          </p>
          <p className="mt-1 text-text-secondary">
            Compartilhe manualmente (WhatsApp/e-mail) — não há envio automático nesta fase.
          </p>
        </div>
      )}

      {rowError && <p className="mb-2 text-xs text-destructive">{rowError}</p>}

      {members && members.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border/60">
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
                    <Badge variant={STATUS_VARIANT[m.status] ?? "outline"}>
                      {STATUS_LABELS[m.status] ?? m.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-text-secondary">
                    {m.campaignIds.length === 0
                      ? "Todas"
                      : m.campaignIds.map((id) => campaignNameById.get(id) ?? id).join(", ")}
                  </TableCell>
                  <TableCell className="text-text-secondary">{formatDate(m.invited_at)}</TableCell>
                  <TableCell className="text-text-secondary">
                    {formatDate(m.last_access_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={rowBusyId === m.id}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={m.status !== "invited"}
                          onClick={() => handleResend(m)}
                        >
                          Reenviar convite
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openRoleDialog(m)}>
                          Alterar função
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openCampaignsDialog(m)}>
                          Alterar campanhas liberadas
                        </DropdownMenuItem>
                        {m.status === "active" && (
                          <DropdownMenuItem onClick={() => handleSuspend(m)}>
                            Suspender
                          </DropdownMenuItem>
                        )}
                        {m.status === "suspended" && (
                          <DropdownMenuItem onClick={() => handleReactivate(m)}>
                            Reativar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={m.status === "removed"}
                          onClick={() => handleRemove(m)}
                        >
                          Remover acesso
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-text-secondary">
          Nenhum acesso ao portal ainda.
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
              <SelectItem value="client_admin">Administrador do cliente</SelectItem>
              <SelectItem value="client_member">Membro</SelectItem>
              <SelectItem value="client_viewer">Visualizador</SelectItem>
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
