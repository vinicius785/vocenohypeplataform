import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { EmptyState } from "@/components/shared/EmptyState";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { Cliente } from "@/lib/clientes-store";
import { listAuditLog } from "@/lib/audit-log.functions";
import { ClienteSection } from "./ClienteSection";
import { initialsOf } from "./cliente-ui";
import {
  HISTORICO_INICIAL,
  buildClienteHistorico,
  historicoDateLabel,
  type AuditRowLike,
} from "./cliente-historico";
import type { PortalMember } from "./use-cliente-portal-members";

/**
 * Linha do tempo do cliente. Fontes que já existem: `cliente.activity[]` (sempre) e o log de acessos
 * (só para admin; quem não pode consultá-lo vê apenas o restante, sem erro nem aviso técnico).
 */
export function ClienteHistorico({
  cliente,
  organizationId,
  members,
  canSeeAccessLog,
  portalLoading,
}: {
  cliente: Cliente;
  organizationId: string | null;
  members: readonly PortalMember[] | null;
  canSeeAccessLog: boolean;
  portalLoading: boolean;
}) {
  const listAuditFn = useServerFn(listAuditLog);
  const [audit, setAudit] = useState<AuditRowLike[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!canSeeAccessLog || !organizationId) return;
    let cancelled = false;
    listAuditFn({ data: { organizationId, page: 0, pageSize: 50 } })
      .then((res) => {
        if (!cancelled) setAudit(res.rows as AuditRowLike[]);
      })
      .catch(() => {
        // Sem permissão ou falha: o histórico segue só com o que já existe, sem aviso.
        if (!cancelled) setAudit(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `listAuditFn` (useServerFn) não é estável
  }, [organizationId, canSeeAccessLog]);

  const events = useMemo(
    () => buildClienteHistorico({ activity: cliente.activity, audit, members: members ?? [] }),
    [cliente.activity, audit, members],
  );
  const shown = expanded ? events : events.slice(0, HISTORICO_INICIAL);
  const waiting = canSeeAccessLog && portalLoading && events.length === 0;

  return (
    <ClienteSection title="Histórico">
      {waiting ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-5 w-full max-w-md" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<History className="h-5 w-5" />}
          compact
          title="Nenhum evento registrado ainda."
          description="Mudanças de status, novas campanhas e acessos ao portal aparecem aqui."
        />
      ) : (
        <>
          <ol className="divide-y divide-border/40">
            {shown.map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-2.5">
                <span className="w-[4.5rem] shrink-0 pt-0.5 text-xs tabular-nums text-text-secondary">
                  {historicoDateLabel(e.at)}
                </span>
                {e.person ? (
                  <Avatar className="mt-0.5 h-5 w-5">
                    <AvatarFallback className="bg-muted text-[9px] font-semibold text-text-secondary">
                      {initialsOf(e.person)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <span className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm text-foreground">{e.text}</span>
                  {e.note && (
                    <span className="mt-0.5 block break-words text-xs italic text-text-secondary">
                      “{e.note}”
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          {events.length > HISTORICO_INICIAL && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-2 text-xs font-medium text-text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? "Ver menos" : `Ver mais (${events.length - HISTORICO_INICIAL})`}
            </button>
          )}
        </>
      )}
    </ClienteSection>
  );
}
