import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getClienteOrganizationId,
  inviteClientUser,
  listOrganizationMembers,
} from "@/lib/organization-invites.functions";

/**
 * Minimal admin entry point for Fase 1 (see CLAUDE.md, section 5): list
 * existing `organization_members` for this client's org + a simple invite
 * form. The full "Acessos ao portal" management table (reenviar convite,
 * alterar função, suspender, reativar, remover, campanhas liberadas) is
 * explicitly phase 2 — this only proves invite-creation works end-to-end.
 */
type Member = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  email: string | null;
  fullName: string | null;
};

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

export function PortalAccessSection({ clienteId }: { clienteId: string }) {
  const getOrgIdFn = useServerFn(getClienteOrganizationId);
  const listMembersFn = useServerFn(listOrganizationMembers);
  const inviteFn = useServerFn(inviteClientUser);

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"client_admin" | "client_member" | "client_viewer">(
    "client_member",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

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
        if (orgId) await refreshMembers(orgId);
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
            onChange={(e) => setRole(e.target.value as typeof role)}
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
          <p className="font-medium text-foreground">Usuário criado. Senha temporária:</p>
          <p className="mt-1 select-all rounded bg-muted px-2 py-1 font-mono text-foreground">
            {tempPassword}
          </p>
          <p className="mt-1 text-text-secondary">
            Compartilhe manualmente (WhatsApp/e-mail) — não há envio automático nesta fase.
          </p>
        </div>
      )}

      {members && members.length > 0 ? (
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {m.fullName || m.email || m.user_id}
                </p>
                <p className="truncate text-xs text-text-secondary">
                  {ROLE_LABELS[m.role] ?? m.role}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
                {STATUS_LABELS[m.status] ?? m.status}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-text-secondary">
          Nenhum acesso ao portal ainda.
        </div>
      )}
    </div>
  );
}
