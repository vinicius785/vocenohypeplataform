/**
 * Vocabulário visual da Central de Problemas — mesma linguagem das tarefas
 * (`tasks/task-ui.tsx`): STATUS = selo suave com ícone; PRIORIDADE =
 * bandeira + texto, sem fundo; TIPO = ícone neutro. Cores discretas.
 */
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Circle,
  Flag,
  HelpCircle,
  Hourglass,
  Lightbulb,
  Search,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  PROBLEM_KIND_LABEL,
  PROBLEM_PRIORITY_LABEL,
  PROBLEM_STATUS_LABEL,
  type ProblemKind,
  type ProblemPriority,
  type ProblemStatus,
} from "@/lib/problems";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const KIND_ICON: Record<ProblemKind, LucideIcon> = {
  bug: Bug,
  problema: AlertTriangle,
  sugestao: Lightbulb,
  duvida: HelpCircle,
};

export function ProblemKindIcon({ kind, className }: { kind: ProblemKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return (
    <Icon
      aria-label={PROBLEM_KIND_LABEL[kind]}
      className={cx("shrink-0 text-muted-foreground", className)}
    />
  );
}

const STATUS_ICON: Record<ProblemStatus, LucideIcon> = {
  novo: Circle,
  em_analise: Search,
  em_correcao: Wrench,
  aguardando_info: Hourglass,
  resolvido: CheckCircle2,
  fechado: XCircle,
};

const STATUS_TONE: Record<ProblemStatus, string> = {
  novo: "bg-muted text-muted-foreground",
  em_analise: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  em_correcao: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  aguardando_info: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  resolvido: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  fechado: "bg-muted/70 text-muted-foreground",
};

export function ProblemStatusIcon({
  status,
  className,
}: {
  status: ProblemStatus;
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  return <Icon aria-hidden className={cx("h-3.5 w-3.5 shrink-0", className)} />;
}

export function ProblemStatusBadge({
  status,
  className,
}: {
  status: ProblemStatus;
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cx(
        "inline-flex max-w-full shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
        STATUS_TONE[status],
        className,
      )}
    >
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{PROBLEM_STATUS_LABEL[status]}</span>
    </span>
  );
}

export const PROBLEM_PRIORITY_TONE: Record<ProblemPriority, string> = {
  critica: "text-red-600 dark:text-red-400",
  alta: "text-amber-600 dark:text-amber-400",
  normal: "text-muted-foreground",
  baixa: "text-text-secondary",
};

export function ProblemPriorityFlag({
  priority,
  className,
}: {
  priority: ProblemPriority;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
        PROBLEM_PRIORITY_TONE[priority],
        className,
      )}
    >
      <Flag aria-hidden className="h-3 w-3 shrink-0" />
      {PROBLEM_PRIORITY_LABEL[priority]}
    </span>
  );
}

/** "Hoje", "Ontem", "há 3 dias", "02/10". */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff <= 0) return "Hoje";
  if (diff === 1) return "Ontem";
  if (diff < 7) return `há ${diff} dias`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}
