import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Users, Search, ChevronRight, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { getTeamDirectory, updateTeamMember } from "@/lib/team.functions";
import { unenrollUserMfaFactor } from "@/lib/mfa.functions";
import { withRetry, friendlyNetworkError } from "@/lib/net-retry";
import { MemberDialog, type Member, type MemberFormPayload } from "@/components/TimeSection";
import type { Permission } from "@/lib/permissions";
import type { TimeField } from "@/components/TimeSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { SettingsCard, SettingsSectionHeader } from "./settings-shared";

type TeamDirEntry = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  salary?: string;
  birthday?: string | null;
  photo?: string;
  permissions?: string[];
  timeView?: string[];
  startTimes?: Record<string, string>;
  isAdmin?: boolean;
};

const mapDirToMembers = (dir: TeamDirEntry[]): Member[] =>
  dir.map((d) => ({
    id: d.id,
    email: d.email ?? "",
    name: d.name === "Sem nome" ? "" : (d.name ?? ""),
    role: d.role ?? "",
    salary: d.salary ?? "",
    birthday: d.birthday ?? "",
    photo: d.photo ?? undefined,
    permissions: (d.permissions ?? []) as Permission[],
    timeView: (d.timeView ?? []) as TimeField[],
    startTimes: d.startTimes ?? {},
    isAdmin: Boolean(d.isAdmin),
  }));

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Lista de membros com permissões, dentro de Configurações → Workspace.
 * NÃO duplica a página Time (que continua sendo a ferramenta operacional
 * de gestão do time) — aqui é só "quem tem acesso a quê", pra configurar
 * o workspace, não pra acompanhar produtividade. Clicar num membro abre o
 * mesmo `MemberDialog` já usado em Time, então editar permissões aqui e
 * lá é literalmente a mesma ação. */
export function TimePermissoesTab({ isAdmin = false }: { isAdmin?: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);
  const [mfaBusyId, setMfaBusyId] = useState<string | null>(null);

  const updateFn = useServerFn(updateTeamMember);
  const unenrollMfaFn = useServerFn(unenrollUserMfaFactor);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const dir = await withRetry(() => getTeamDirectory());
      setMembers(mapDirToMembers(dir));
    } catch (e) {
      setError(friendlyNetworkError(e, "Falha ao carregar o time."));
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async (payload: MemberFormPayload) => {
    if (!payload.id) return;
    await withRetry(() =>
      updateFn({
        data: {
          id: payload.id!,
          fullName: payload.name,
          roleLabel: payload.role,
          salary: payload.salary,
          birthday: payload.birthday,
          permissions: payload.permissions,
          timeView: payload.timeView,
          role: payload.isAdminRole ? "admin" : "member",
        },
      }),
    );
    setEditing(null);
    window.dispatchEvent(new Event("time:membros:changed"));
    await load();
  };

  /** Admin-assisted recovery path for a user who lost their MFA device (see
   * `mfa.functions.ts` — Supabase's native MFA has no backup-code flow in
   * this SDK version, so this IS the recovery path). Confirmation-gated
   * with `window.confirm`, matching `PortalAccessSection.tsx`'s pattern for
   * other destructive-ish actions. */
  const handleRemoveMfa = async (m: Member) => {
    if (
      !window.confirm(
        `Remover a autenticação em duas etapas de ${m.name || "este membro"}? Ele(a) voltará a entrar só com e-mail e senha até reativar.`,
      )
    )
      return;
    setMfaBusyId(m.id);
    try {
      await unenrollMfaFn({ data: { userId: m.id } });
      toast.success("Autenticação em duas etapas removida.");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível remover a autenticação em duas etapas.",
      );
    } finally {
      setMfaBusyId(null);
    }
  };

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.role.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        icon={<Users className="h-4 w-4" />}
        title="Time e permissões"
        description="Clique em um membro para configurar o que ele pode acessar na plataforma."
      />

      <SettingsCard>
        <div className="relative mb-3 w-64 max-w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar membro"
            className="h-9 w-full pl-8 text-xs"
          />
        </div>

        {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
        {loading && <p className="text-xs text-muted-foreground">Carregando...</p>}

        <div className="divide-y divide-border">
          {!loading && filtered.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nenhum membro encontrado.
            </p>
          )}
          {filtered.map((m) => (
            <div key={m.id} className="flex w-full items-center gap-3 py-3">
              <button
                type="button"
                onClick={() => setEditing(m)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={m.photo} alt={m.name} />
                  <AvatarFallback className="text-[11px]">
                    {initialsOf(m.name || "?")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {m.name || "Sem nome"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{m.role || "Sem cargo"}</p>
                </div>
                {m.isAdmin && <Badge className="shrink-0">Admin</Badge>}
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {m.isAdmin
                    ? "Acesso total"
                    : `${m.permissions.length} permissõe${m.permissions.length === 1 ? "" : "s"}`}
                </span>
              </button>
              {isAdmin && (
                <IconButton
                  label="Remover autenticação em duas etapas"
                  tone="destructive"
                  disabled={mfaBusyId === m.id}
                  onClick={() => void handleRemoveMfa(m)}
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                </IconButton>
              )}
              <button
                type="button"
                onClick={() => setEditing(m)}
                aria-label={`Editar ${m.name || "membro"}`}
                className="shrink-0"
              >
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </SettingsCard>

      <MemberDialog
        open={!!editing}
        initial={editing}
        isSelf={false}
        onOpenChange={(v) => !v && setEditing(null)}
        onSave={handleSave}
      />
    </div>
  );
}
