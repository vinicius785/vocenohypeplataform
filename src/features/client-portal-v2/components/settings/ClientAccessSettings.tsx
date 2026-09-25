import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, UserPlus, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import {
  listClientAccessMembers,
  resendClientAccessInvite,
  cancelClientAccessInvite,
  updateClientAccessMemberRole,
  removeClientAccessMember,
} from "@/lib/client-access.functions";
import { initialsFromName } from "../../lib/client-profile";
import { InviteClientMemberDialog } from "./InviteClientMemberDialog";
import { RemoveClientAccessDialog } from "./RemoveClientAccessDialog";

const ROLE_LABEL: Record<string, string> = {
  client_standard: "Administrador",
  client_approver: "Aprovador",
  client_viewer: "Visualizador",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  invited: "Convite pendente",
  removed: "Acesso removido",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `hoje, ${time}`;
  return `${d.toLocaleDateString("pt-BR")}, ${time}`;
}

const QUERY_KEY = ["portal-v2-client-access-members"] as const;

/**
 * "Pessoas e acessos" — só existe DENTRO de Configurações (nunca uma
 * entrada própria na sidebar) e só é RENDERIZADA quando o próprio
 * `usePortalSessionData().role` é `client_standard` — quem não administra
 * membros nunca vê nem uma tela bloqueada, a seção simplesmente não
 * existe pra ela (o backend também recusa cada ação, defesa em
 * profundidade: nunca confia só no que a interface esconde).
 */
export function ClientAccessSettings() {
  const { data } = usePortalSessionData();
  if (data.role !== "client_standard") return null;
  return <ClientAccessSettingsContent clienteName={data.clienteNome} />;
}

function ClientAccessSettingsContent({ clienteName }: { clienteName: string }) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listClientAccessMembers);
  const resendFn = useServerFn(resendClientAccessInvite);
  const cancelFn = useServerFn(cancelClientAccessInvite);
  const updateRoleFn = useServerFn(updateClientAccessMemberRole);
  const removeFn = useServerFn(removeClientAccessMember);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState("");

  const {
    data: members,
    isLoading,
    error,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const filtered = (members ?? []).filter((m) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  const handleResend = async (memberId: string, email: string) => {
    try {
      await resendFn({ data: { memberId } });
      toast.success(`Convite reenviado para ${email}.`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível reenviar o convite.");
    }
  };

  const handleCancel = async (memberId: string, email: string) => {
    try {
      await cancelFn({ data: { memberId } });
      toast.success(`Convite de ${email} cancelado.`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível cancelar o convite.");
    }
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    try {
      await updateRoleFn({
        data: { memberId, role: role as "client_standard" | "client_approver" | "client_viewer" },
      });
      toast.success("Nível de acesso atualizado.");
      refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível alterar o nível de acesso.",
      );
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    await removeFn({ data: { memberId: removeTarget.id } });
    toast.success("Acesso removido.");
    setRemoveTarget(null);
    refresh();
  };

  return (
    <section id="pessoas-e-acessos" className="space-y-4 scroll-mt-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Pessoas e acessos</h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            Gerencie quem pode acessar o portal da sua empresa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3.5 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Convidar pessoa
        </button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          Não foi possível carregar a lista de pessoas.
        </p>
      )}

      {members && members.length === 0 && (
        <div className="rounded-2xl bg-card p-6 text-center dark:shadow-none">
          <Users className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">
            Nenhuma outra pessoa possui acesso
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Convide pessoas da sua empresa para acompanhar campanhas, aprovar conteúdos e visualizar
            relatórios.
          </p>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3.5 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Convidar pessoa
          </button>
        </div>
      )}

      {members && members.length > 3 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          className="h-9 w-full max-w-sm rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      )}

      {members && members.length > 0 && (
        <div className="divide-y divide-border/70 rounded-2xl bg-card dark:shadow-none">
          {filtered.map((m) => {
            const pending = m.status === "invited";
            const initials = initialsFromName(m.name || m.email);
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground">
                  {m.photoUrl ? (
                    <img src={m.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {m.name || m.email}
                  </p>
                  <p className="truncate text-xs text-text-secondary">
                    {ROLE_LABEL[m.role] ?? m.role} · {STATUS_LABEL[m.status] ?? m.status}
                  </p>
                  {pending && m.invitedByName && m.invitedAt && (
                    <p className="truncate text-xs text-text-secondary">
                      Enviado por {m.invitedByName} em{" "}
                      {new Date(m.invitedAt).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                  {!pending && m.lastAccessAt && (
                    <p className="truncate text-xs text-text-secondary">
                      Último acesso {formatDateTime(m.lastAccessAt)}
                    </p>
                  )}
                </div>
                {pending && (
                  <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning-soft-foreground">
                    Pendente
                  </span>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Mais ações para ${m.name || m.email}`}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {pending ? (
                      <>
                        <DropdownMenuItem onSelect={() => void handleResend(m.id, m.email)}>
                          Reenviar convite
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void handleCancel(m.id, m.email)}>
                          Cancelar convite
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {Object.keys(ROLE_LABEL)
                      .filter((r) => r !== m.role)
                      .map((r) => (
                        <DropdownMenuItem key={r} onSelect={() => void handleRoleChange(m.id, r)}>
                          Definir como {ROLE_LABEL[r]}
                        </DropdownMenuItem>
                      ))}
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => setRemoveTarget({ id: m.id, name: m.name || m.email })}
                    >
                      Remover acesso
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      <InviteClientMemberDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={refresh}
      />
      <RemoveClientAccessDialog
        open={!!removeTarget}
        personName={removeTarget?.name ?? ""}
        clienteName={clienteName}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
      />
    </section>
  );
}
