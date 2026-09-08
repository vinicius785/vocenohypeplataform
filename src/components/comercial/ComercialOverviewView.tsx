import { AlertTriangle, Clock, Target, TrendingUp, Wallet, Layers, Info } from "lucide-react";
import { formatBRL, type Lead } from "@/lib/comercial";
import {
  OPPORTUNITY_KANBAN_ORDER,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_COLOR,
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
import { avatarAccent, initialsOf } from "@/components/team/member-ui";

/**
 * Visão geral — o que exige ação hoje, o que está em risco, o que está
 * mais avançado no funil, e como o pipeline se distribui por etapa/
 * responsável. Estatísticas em destaque no topo, barras proporcionais
 * (nunca decorativas — largura = valor real) e listas com a mesma
 * linguagem visual do card do Kanban (avatar do responsável, sem
 * inventar nenhum dado que não existe).
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
  const porResponsavel = groupByResponsible(leads).slice(0, 8);
  const acaoHoje = leadsNeedingActionToday(leads).slice(0, 5);
  const risco = leadsAtRisk(leads).slice(0, 5);
  const avancadas = leadsClosestToClosing(leads).slice(0, 5);

  const maxEtapaValor = Math.max(1, ...porEtapa.map((b) => b.value));
  const maxRespValor = Math.max(1, ...porResponsavel.map((b) => b.value));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={<Wallet className="h-4 w-4" />}
          label="Pipeline total"
          value={formatBRL(kpis.pipelineTotal)}
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="Ganho no período"
          value={formatBRL(kpis.valorGanhoNoPeriodo)}
          tone="success"
        />
        <StatTile
          icon={<Layers className="h-4 w-4" />}
          label="Oportunidades abertas"
          value={String(kpis.oportunidadesAbertas)}
        />
        <StatTile
          icon={<Clock className="h-4 w-4" />}
          label="Paradas (5+ dias)"
          value={String(kpis.oportunidadesParadas)}
          tone={kpis.oportunidadesParadas > 0 ? "warning" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Pipeline por etapa" icon={<Layers className="h-4 w-4" />}>
          {porEtapa.every((b) => b.count === 0) ? (
            <EmptyState text="Nenhuma oportunidade em aberto." />
          ) : (
            <div className="space-y-3">
              {porEtapa.map((b) => (
                <div key={b.stage}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      {OPPORTUNITY_STAGE_LABEL[b.stage]}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {b.count} · {formatBRL(b.value)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${OPPORTUNITY_STAGE_COLOR[b.stage]}`}
                      style={{ width: `${Math.max(3, (b.value / maxEtapaValor) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Pipeline por responsável" icon={<Target className="h-4 w-4" />}>
          {porResponsavel.length === 0 ? (
            <EmptyState text="Nenhuma oportunidade cadastrada ainda." />
          ) : (
            <div className="space-y-3">
              {porResponsavel.map((b) => (
                <div key={b.name} className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarAccent(
                      b.name,
                    )}`}
                  >
                    {initialsOf(b.name, "?")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="truncate font-medium text-foreground">{b.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {b.count} · {formatBRL(b.value)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground/70"
                        style={{ width: `${Math.max(3, (b.value / maxRespValor) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
          note="Proxy por etapa (Negociação/Proposta enviada) — não é uma probabilidade calculada, essa informação não existe hoje."
        />
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const toneCls =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className={`mt-1.5 text-xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {text}
    </p>
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
        <EmptyState text={emptyText} />
      ) : (
        <ul className="space-y-1">
          {leads.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => onOpenLead(l)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarAccent(
                    l.responsible || l.name,
                  )}`}
                >
                  {initialsOf(l.responsible || l.company || l.name, "?")}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {l.company || l.name}
                </span>
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
