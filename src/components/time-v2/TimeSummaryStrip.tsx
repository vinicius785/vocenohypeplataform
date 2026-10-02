import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Link2,
  ListTodo,
  MessageSquare,
  Target,
} from "lucide-react";

/** Um número da faixa — rótulo curto, valor, contexto em uma linha. Itens
 * clicáveis levam à lista correspondente na própria página. */
function Item({
  icon,
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  hint?: string | null;
  tone?: "danger" | "warn";
  onClick?: () => void;
}) {
  const hot = typeof value === "number" ? value > 0 : true;
  const valueTone =
    tone === "danger" && hot
      ? "text-destructive"
      : tone === "warn" && hot
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  const body = (
    <>
      <p className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueTone}`}>{value}</p>
      {hint && (
        <p className="mt-0.5 truncate text-[11px] text-text-secondary" title={hint}>
          {hint}
        </p>
      )}
    </>
  );
  const cls = "min-w-0 rounded-2xl bg-card px-4 py-3 text-left dark:shadow-none";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${cls} cursor-pointer transition-colors hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Group({ title, children, cols }: { title: string; children: ReactNode; cols: string }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="px-1 text-[11px] font-medium text-text-secondary">{title}</p>
      <div className={`grid gap-3 ${cols}`}>{children}</div>
    </div>
  );
}

const ICON = "h-3 w-3";

/**
 * Faixa de resumo operacional — responde de relance: quantas abertas,
 * quantas vencem hoje, quantas atrasadas, quantas bloqueadas (estado
 * ATUAL) e, no período escolhido, quantas foram concluídas, quanto saiu no
 * prazo e como está a resposta no chat. Sem ranking, sem número gigante.
 */
export function TimeSummaryStrip({
  openCount,
  dueTodayCount,
  overdueCount,
  blockedCount,
  blockedHint,
  completedCount,
  onTimePct,
  onTimeSample,
  responseLabel,
  responseHint,
  periodLabel,
  onOpenAberto,
  onOpenHoje,
  onOpenAtrasadas,
  onOpenBloqueadas,
}: {
  openCount: number;
  dueTodayCount: number;
  overdueCount: number;
  blockedCount: number;
  blockedHint: string | null;
  completedCount: number;
  onTimePct: number | null;
  onTimeSample: number;
  responseLabel: string;
  responseHint: string | null;
  periodLabel: string;
  onOpenAberto: () => void;
  onOpenHoje: () => void;
  onOpenAtrasadas: () => void;
  onOpenBloqueadas: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,4fr)_minmax(0,3fr)]">
      <Group title="Agora" cols="grid-cols-2 sm:grid-cols-4">
        <Item
          icon={<ListTodo className={ICON} />}
          label="Abertas"
          value={openCount}
          onClick={onOpenAberto}
        />
        <Item
          icon={<CalendarClock className={ICON} />}
          label="Vencem hoje"
          value={dueTodayCount}
          tone="warn"
          onClick={onOpenHoje}
        />
        <Item
          icon={<AlertTriangle className={ICON} />}
          label="Atrasadas"
          value={overdueCount}
          tone="danger"
          onClick={onOpenAtrasadas}
        />
        <Item
          icon={<Link2 className={ICON} />}
          label="Bloqueadas"
          value={blockedCount}
          hint={blockedHint}
          onClick={blockedCount > 0 ? onOpenBloqueadas : undefined}
        />
      </Group>
      <Group title={periodLabel} cols="grid-cols-2 sm:grid-cols-3">
        <Item icon={<CheckCircle2 className={ICON} />} label="Concluídas" value={completedCount} />
        <Item
          icon={<Target className={ICON} />}
          label="No prazo"
          value={onTimePct == null ? "—" : `${Math.round(onTimePct)}%`}
          hint={
            onTimeSample === 0
              ? "Sem conclusões avaliadas"
              : `${onTimeSample} ${onTimeSample === 1 ? "conclusão avaliada" : "conclusões avaliadas"}`
          }
        />
        <Item
          icon={<MessageSquare className={ICON} />}
          label="Resposta média"
          value={responseLabel}
          hint={responseHint}
        />
      </Group>
    </div>
  );
}
