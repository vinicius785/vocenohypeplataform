import { AlertTriangle, Clock, Target, Users2 } from "lucide-react";
import { formatBRL, type Lead } from "@/lib/comercial";
import {
  OPPORTUNITY_KANBAN_ORDER,
  OPPORTUNITY_STAGE_LABEL,
  daysSinceLastStageChange,
} from "@/lib/comercial-engine";
import {
  computeComercialKpis,
  groupPipelineByStage,
  groupByResponsible,
  leadsNeedingActionToday,
  leadsAtRisk,
  leadsClosestToClosing,
  type DateRange,
} from "@/lib/comercial-metrics";

/**
 * Visão geral — página gerencial: o que exige ação hoje, o que está em
 * risco, o que está mais avançado no funil, e como o pipeline se
 * distribui por etapa/responsável. Cada bloco vem de dado real; nada
 * aparece só pra preencher espaço.
 */
export function ComercialOverviewView({
  leads,
  range,
  onOpenLead,
}: {
  leads: Lead[];
  range: DateRange;
  onOpenLead: (lead: Lead) => void;
}) {
  const kpis = computeComercialKpis(leads, range);
  const porEtapa = groupPipelineByStage(leads, OPPORTUNITY_KANBAN_ORDER);
  const porResponsavel = groupByResponsible(leads);
  const acaoHoje = leadsNeedingActionToday(leads).slice(0, 6);
  const risco = leadsAtRisk(leads).slice(0, 6);
  const avancadas = leadsClosestToClosing(leads).slice(0, 6);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <LeadListCard
        title="Precisam de ação hoje"
        icon={<Clock className="h-4 w-4" />}
        leads={acaoHoje}
        emptyText="Nada pendente do time agora."
        onOpenLead={onOpenLead}
        badge={(l) => `${daysSinceLastStageChange(l)}d parado`}
      />
      <LeadListCard
        title="Em risco"
        icon={<AlertTriangle className="h-4 w-4" />}
        leads={risco}
        emptyText="Nenhuma oportunidade em risco."
        onOpenLead={onOpenLead}
        badge={() => "Risco"}
        badgeTone="danger"
      />
      <LeadListCard
        title="Mais avançadas no funil"
        icon={<Target className="h-4 w-4" />}
        leads={avancadas}
        emptyText="Nenhuma oportunidade em negociação ou proposta enviada."
        onOpenLead={onOpenLead}
        badge={(l) => formatBRL(l.value || 0)}
        note="Proxy por etapa (Negociação/Proposta enviada), não uma probabilidade calculada — essa informação não existe hoje."
      />

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Users2 className="h-4 w-4" /> Pipeline por etapa
        </h3>
        <div className="space-y-2">
          {porEtapa.map((b) => (
            <div key={b.stage} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{OPPORTUNITY_STAGE_LABEL[b.stage]}</span>
              <span className="font-medium tabular-nums text-foreground">
                {b.count} · {formatBRL(b.value)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Users2 className="h-4 w-4" /> Pipeline por responsável
        </h3>
        {porResponsavel.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem oportunidades.</p>
        ) : (
          <div className="space-y-2">
            {porResponsavel.map((b) => (
              <div key={b.name} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{b.name}</span>
                <span className="font-medium tabular-nums text-foreground">
                  {b.count} · {formatBRL(b.value)}
                  {b.won > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {" "}
                      · {b.won} ganho(s)
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LeadListCard({
  title,
  icon,
  leads,
  emptyText,
  onOpenLead,
  badge,
  badgeTone = "neutral",
  note,
}: {
  title: string;
  icon: React.ReactNode;
  leads: Lead[];
  emptyText: string;
  onOpenLead: (lead: Lead) => void;
  badge: (l: Lead) => string;
  badgeTone?: "neutral" | "danger";
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        {icon} {title}
      </h3>
      {leads.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {leads.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => onOpenLead(l)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span className="min-w-0 truncate text-foreground">{l.company || l.name}</span>
                <span
                  className={`shrink-0 font-medium ${
                    badgeTone === "danger"
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {badge(l)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-2 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}
