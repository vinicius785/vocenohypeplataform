import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { LockedSection } from "@/components/LockedSection";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAuditLog } from "@/lib/audit-log.functions";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SettingsSectionHeader } from "./settings-shared";

/**
 * Piece A of the 2026-09-18 security pass (see CLAUDE.md): admin-only
 * viewer for `access_audit_log`, extended this phase beyond Phase 2a's
 * admin-mutation-only scope to also cover login/logout/environment-switch
 * (see `audit-log.functions.ts`). Read-only — `listAuditLog` itself
 * re-asserts admin server-side (defense in depth, same as every other
 * admin tab here).
 */
const ACTION_LABELS: Record<string, string> = {
  login_success: "Login bem-sucedido",
  login_failed: "Login falhou",
  logout: "Logout",
  environment_switch: "Troca de ambiente",
  token_deactivated: "Link antigo desativado",
  invite_sent: "Convite enviado",
  invite_resent: "Convite reenviado",
  invite_revoked: "Convite revogado",
  role_changed: "Função alterada",
  member_suspended: "Membro suspenso",
  member_reactivated: "Membro reativado",
  member_removed: "Membro removido",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return value;
  }
}

/** Resumo curto do payload para a coluna "Detalhes" — o JSON completo abre no painel lateral. */
function summarizeDetails(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "object") return String(value);
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return "—";
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type Row = {
  id: string;
  actor_user_id: string;
  actorEmail: string | null;
  organization_id: string | null;
  action: string;
  target_user_id: string | null;
  previous_value: unknown;
  new_value: unknown;
  created_at: string;
};

const PAGE_SIZE = 25;

export function AuditLogTab({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) return <LockedSection title="Auditoria" />;
  return <AuditLogContent />;
}

function AuditLogContent() {
  const listFn = useServerFn(listAuditLog);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listFn({
      data: {
        page,
        pageSize: PAGE_SIZE,
        action: actionFilter === "all" ? undefined : actionFilter,
      },
    })
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows as Row[]);
        setTotal(res.total);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Falha ao carregar o log de auditoria.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listFn, page, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Auditoria"
        description="Histórico de eventos sensíveis: login, troca de ambiente e gestão de acessos ao portal do cliente."
        adminOnly
      />

      <div className="flex items-center justify-between gap-3">
        <Select
          value={actionFilter}
          onValueChange={(v) => {
            setActionFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="h-9 w-[240px]" aria-label="Filtrar por ação">
            <SelectValue placeholder="Todas as ações" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {total} {total === 1 ? "registro" : "registros"}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Autor</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  Nenhum evento registrado.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver detalhes: ${actionLabel(row.action)}`}
                  onClick={() => setSelected(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(row);
                    }
                  }}
                  className="cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{actionLabel(row.action)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.actorEmail ?? row.actor_user_id}
                  </TableCell>
                  <TableCell className="max-w-[360px] truncate text-xs text-muted-foreground">
                    {summarizeDetails(row.new_value)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Página {page + 1} de {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{actionLabel(selected.action)}</SheetTitle>
                <SheetDescription>{formatDateTime(selected.created_at)}</SheetDescription>
              </SheetHeader>
              <dl className="mt-6 space-y-4 text-sm">
                <DetailItem label="Autor" value={selected.actorEmail ?? selected.actor_user_id} />
                {selected.target_user_id && (
                  <DetailItem label="Usuário afetado" value={selected.target_user_id} mono />
                )}
                {selected.organization_id && (
                  <DetailItem label="Organização" value={selected.organization_id} mono />
                )}
                <JsonBlock label="Antes" value={selected.previous_value} />
                <JsonBlock label="Depois" value={selected.new_value} />
              </dl>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? "mt-0.5 break-all font-mono text-xs" : "mt-0.5 break-words"}>
        {value}
      </dd>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd>
        <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-muted p-3 text-xs">
          {prettyJson(value)}
        </pre>
      </dd>
    </div>
  );
}
