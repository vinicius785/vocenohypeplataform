import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Search } from "lucide-react";
import { getTeamDirectory, updateTeamMember } from "@/lib/team.functions";
import { withRetry, friendlyNetworkError } from "@/lib/net-retry";
import { MemberDialog, type Member, type MemberFormPayload } from "@/components/TimeSection";
import type { Permission } from "@/lib/permissions";
import type { TimeField } from "@/components/TimeSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

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
export function TimePermissoesTab() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);

  const updateFn = useServerFn(updateTeamMember);

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

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.role.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Time e permissões</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Clique em um membro para configurar o que ele pode acessar na plataforma.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar membro"
          className="h-9 w-full max-w-xs pl-8 text-xs"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {loading && <p className="text-xs text-muted-foreground">Carregando...</p>}

      <div className="divide-y divide-border rounded-lg border border-border bg-background">
        {!loading && filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Nenhum membro encontrado.
          </p>
        )}
        {filtered.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setEditing(m)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
          >
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={m.photo} alt={m.name} />
              <AvatarFallback className="text-[11px]">{initialsOf(m.name || "?")}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{m.name || "Sem nome"}</p>
              <p className="truncate text-xs text-muted-foreground">{m.role || "Sem cargo"}</p>
            </div>
            {m.isAdmin && (
              <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium text-foreground">
                Admin
              </span>
            )}
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {m.permissions.length} permissõe{m.permissions.length === 1 ? "" : "s"}
            </span>
          </button>
        ))}
      </div>

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
