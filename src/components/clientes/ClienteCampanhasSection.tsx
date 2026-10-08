import { ChevronRight, Megaphone } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import { CAMPANHA_STATUS_LABEL, campanhaStatus } from "@/components/campanhas/campanha-ui";
import { cn, formatIsoDate } from "@/lib/utils";
import { ClienteSection } from "./ClienteSection";
import { CAMPANHAS_INICIAIS, visibleCampanhas } from "./cliente-overview";

function planned(c: Campaign): number {
  return (c.linhas ?? []).reduce((s, l) => s + (l.quantidade || 0), 0);
}

/** Visão contextual das campanhas do cliente: lista compacta, com expansão "Ver todas". Clicar numa
 * linha abre o mesmo diálogo de edição de sempre. Sem fonte de dados nova. */
export function ClienteCampanhasSection({
  campanhas,
  expanded,
  onToggleExpanded,
  canCreate,
  disabledReason,
  onOpen,
}: {
  campanhas: Campaign[];
  expanded: boolean;
  onToggleExpanded: () => void;
  canCreate: boolean;
  disabledReason: string;
  onOpen: (c: Campaign) => void;
}) {
  const shown = visibleCampanhas(campanhas, expanded);
  return (
    <ClienteSection id="campanhas-do-cliente" title="Campanhas" count={campanhas.length}>
      {campanhas.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-5 w-5" />}
          compact
          title="Nenhuma campanha criada para este cliente."
          description={
            canCreate ? "Crie a primeira campanha para começar a operação." : disabledReason
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border/60">
            {shown.map((c) => {
              const status = campanhaStatus(c);
              const n = planned(c);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(c)}
                    className="group flex w-full items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground group-hover:underline">
                        {c.nome}
                      </span>
                      <span className="block text-xs text-text-secondary">
                        {[
                          n > 0
                            ? `${n} ${n === 1 ? "influenciador planejado" : "influenciadores planejados"}`
                            : null,
                          c.prazo ? `Prazo ${formatIsoDate(c.prazo)}` : "Sem prazo",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-medium",
                        status === "active" ? "text-foreground" : "text-text-secondary",
                      )}
                    >
                      {CAMPANHA_STATUS_LABEL[status]}
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-text-secondary"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          {campanhas.length > CAMPANHAS_INICIAIS && (
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              className="mt-1 text-xs font-medium text-text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? "Ver menos" : `Ver todas (${campanhas.length})`}
            </button>
          )}
        </>
      )}
    </ClienteSection>
  );
}
