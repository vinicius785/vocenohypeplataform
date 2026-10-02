/**
 * VOCABULÁRIO VISUAL ÚNICO DE TAREFAS — todo lugar da plataforma que
 * mostra status, prioridade, prazo/atraso, bloqueio, dependência ou um
 * cabeçalho de seção de tarefa usa estes componentes (Kanban, detalhe da
 * tarefa, subtarefas, Time, Início, Chat, roadmap). Nenhuma regra de
 * negócio vive aqui: quem decide se um status pode ser aplicado, se o
 * prazo está pausado ou se uma tarefa está atrasada continua sendo o
 * chamador / `performance-engine` / RPCs de bloqueio. Este módulo só
 * desenha.
 *
 * Linguagem (cada conceito com um tratamento próprio, nunca o mesmo):
 *  - STATUS = estado → selo preenchido (fundo suave + ícone + texto).
 *  - PRIORIDADE = importância → bandeira + texto colorido, sem fundo.
 *  - PRAZO = tempo → ponto colorido + texto (texto só colorido quando
 *    pede ação: vence hoje / atrasada). Prazo pausado usa ícone de pausa.
 *  - BLOQUEIO = impedimento → contorno âmbar; 🔒 dependência de outra
 *    tarefa × ⏸ bloqueio operacional (cliente, aprovação, time...).
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Flag,
  Hourglass,
  Link2,
  Lock,
  PauseCircle,
  PenLine,
  PlayCircle,
  Plus,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  PRIORITY_TONE,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_GROUP_LABEL,
  TASK_STATUS_GROUP_ORDER,
  TASK_STATUS_TONE,
  groupForStatus,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/task-status";
import { taskDeadlineHealth, type TaskDeadlineHealthLike } from "@/lib/performance-engine";
import { TASK_BLOCK_CATEGORY_LABEL } from "@/lib/task-blocks-rules";
import type { TaskBlockedState } from "@/lib/projetos";
import type { DashTask } from "@/lib/task-aggregation";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const fmtDayMonth = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

/* ================================================================== */
/* STATUS                                                               */
/* ================================================================== */

export const TASK_STATUS_ICON: Record<TaskStatus, LucideIcon> = {
  Aberto: Circle,
  "Em andamento": PlayCircle,
  "Em aprovação": Hourglass,
  "Em ajustes": PenLine,
  Bloqueada: Lock,
  Aprovado: ThumbsUp,
  Concluído: CheckCircle2,
  Arquivado: Archive,
};

/** Cor do ÍCONE isolado (sem selo) — mesma família de `TASK_STATUS_TONE`. */
export const TASK_STATUS_ICON_TONE: Record<TaskStatus, string> = {
  Aberto: "text-muted-foreground",
  "Em andamento": "text-sky-600 dark:text-sky-400",
  "Em aprovação": "text-amber-600 dark:text-amber-400",
  "Em ajustes": "text-orange-600 dark:text-orange-400",
  Bloqueada: "text-amber-700 dark:text-amber-300",
  Aprovado: "text-emerald-600 dark:text-emerald-400",
  Concluído: "text-emerald-600 dark:text-emerald-400",
  Arquivado: "text-muted-foreground/70",
};

export function isTaskStatus(v: unknown): v is TaskStatus {
  return (TASK_STATUSES as string[]).includes(v as string);
}

export function TaskStatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const Icon = TASK_STATUS_ICON[status];
  return <Icon aria-hidden className={cx("shrink-0", TASK_STATUS_ICON_TONE[status], className)} />;
}

/** Selo de status — ícone + texto + cor, igual em qualquer tela. */
export function TaskStatusBadge({
  status,
  size = "sm",
  className,
}: {
  status: TaskStatus;
  size?: "xs" | "sm";
  className?: string;
}) {
  const Icon = TASK_STATUS_ICON[status];
  return (
    <span
      className={cx(
        "inline-flex max-w-full shrink-0 items-center gap-1 rounded-md font-medium",
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        TASK_STATUS_TONE[status],
        className,
      )}
    >
      <Icon aria-hidden className={size === "xs" ? "h-3 w-3 shrink-0" : "h-3.5 w-3.5 shrink-0"} />
      <span className="truncate">{status}</span>
    </span>
  );
}

/* ================================================================== */
/* SELETOR GENÉRICO (status, prioridade, fase...)                       */
/* ================================================================== */

export type PickerOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Texto auxiliar à direita (ex.: datas da fase). */
  hint?: string;
  group?: string;
  disabled?: boolean;
};

/**
 * Dropdown único de tarefas — Popover + Command: busca (quando há muitos
 * itens), grupos, ícones, seleção marcada, hover/foco e teclado nativos
 * do `cmdk`. Status, prioridade e fase usam este mesmo componente.
 */
export function TaskOptionPicker<T extends string>({
  value,
  options,
  groups,
  onSelect,
  trigger,
  ariaLabel,
  searchPlaceholder = "Buscar...",
  emptyText = "Nada encontrado.",
  searchable,
  align = "start",
  widthClass = "w-60",
}: {
  value: T | null;
  options: PickerOption<T>[];
  /** Ordem/rótulo dos grupos; opções sem grupo ficam num bloco único. */
  groups?: { key: string; label: string }[];
  onSelect: (v: T) => void;
  trigger: ReactNode;
  ariaLabel: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Padrão: busca só quando há mais de 7 opções. */
  searchable?: boolean;
  align?: "start" | "end" | "center";
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const showSearch = searchable ?? options.length > 7;
  const sections = useMemo(() => {
    if (!groups) return [{ key: "_", label: undefined as string | undefined, items: options }];
    return groups
      .map((g) => ({ key: g.key, label: g.label, items: options.filter((o) => o.group === g.key) }))
      .filter((g) => g.items.length > 0);
  }, [groups, options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild aria-label={ariaLabel}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        collisionPadding={12}
        className={cx("overflow-hidden p-0", widthClass)}
        onClick={(e) => e.stopPropagation()}
      >
        <Command>
          {showSearch && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {sections.map((sec) => (
              <CommandGroup key={sec.key} heading={sec.label}>
                {sec.items.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ""}`}
                    disabled={o.disabled}
                    onSelect={() => {
                      setOpen(false);
                      onSelect(o.value);
                    }}
                    className="flex items-center gap-2"
                  >
                    {o.icon}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">{o.hint}</span>
                    )}
                    {o.value === value && (
                      <Check aria-label="Selecionado" className="h-3.5 w-3.5 shrink-0 text-brand" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const STATUS_GROUPS = TASK_STATUS_GROUP_ORDER.map((key) => ({
  key,
  label: TASK_STATUS_GROUP_LABEL[key],
}));

/**
 * Seletor de status único (tarefa, subtarefa, chat). Escolher "Bloqueada"
 * NUNCA aplica o status aqui — chama `onSelectBlocked` (o chamador abre o
 * questionário de bloqueio; o status só muda depois da confirmação, regra
 * existente). `exclude` remove opções que o contexto não permite.
 */
export function TaskStatusSelect({
  value,
  onChange,
  onSelectBlocked,
  variant = "badge",
  exclude,
  trigger,
}: {
  value: TaskStatus;
  onChange: (next: TaskStatus) => void;
  onSelectBlocked?: () => void;
  /** `badge` = selo clicável (detalhe); `icon` = só o ícone (linha de subtarefa). */
  variant?: "badge" | "icon";
  exclude?: TaskStatus[];
  /** Gatilho próprio (ex.: botão "Alterar status" do card do chat). */
  trigger?: ReactNode;
}) {
  const options: PickerOption<TaskStatus>[] = TASK_STATUSES.filter(
    (s) => !exclude?.includes(s) && (s !== "Bloqueada" || !!onSelectBlocked || value === s),
  ).map((s) => ({
    value: s,
    label: s,
    group: groupForStatus(s),
    icon: <TaskStatusIcon status={s} className="h-3.5 w-3.5" />,
  }));
  return (
    <TaskOptionPicker
      value={value}
      options={options}
      groups={STATUS_GROUPS}
      ariaLabel={`Status: ${value}. Alterar status`}
      searchPlaceholder="Buscar status..."
      emptyText="Nenhum status encontrado."
      searchable
      widthClass="w-56"
      onSelect={(s) => {
        if (s === value) return;
        if (s === "Bloqueada" && onSelectBlocked) onSelectBlocked();
        else onChange(s);
      }}
      trigger={
        trigger ??
        (variant === "icon" ? (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            title={value}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand"
          >
            <TaskStatusIcon status={value} className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex max-w-full items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <TaskStatusBadge status={value} />
          </button>
        ))
      }
    />
  );
}

/* ================================================================== */
/* PRIORIDADE                                                           */
/* ================================================================== */

export function TaskPriorityFlag({
  priority,
  size = "sm",
  className,
}: {
  priority: TaskPriority;
  size?: "xs" | "sm";
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 font-medium",
        size === "xs" ? "text-[11px]" : "text-xs",
        PRIORITY_TONE[priority],
        className,
      )}
    >
      <Flag aria-hidden className="h-3 w-3 shrink-0" />
      {priority}
    </span>
  );
}

export function TaskPrioritySelect({
  value,
  onChange,
  size = "sm",
}: {
  value: TaskPriority;
  onChange: (next: TaskPriority) => void;
  size?: "xs" | "sm";
}) {
  return (
    <TaskOptionPicker
      value={value}
      options={TASK_PRIORITIES.map((p) => ({
        value: p,
        label: p,
        icon: <Flag aria-hidden className={cx("h-3.5 w-3.5 shrink-0", PRIORITY_TONE[p])} />,
      }))}
      ariaLabel={`Prioridade: ${value}. Alterar prioridade`}
      widthClass="w-44"
      onSelect={(p) => p !== value && onChange(p)}
      trigger={
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-6 items-center rounded-md px-1 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-brand"
        >
          <TaskPriorityFlag priority={value} size={size} />
        </button>
      }
    />
  );
}

/* ================================================================== */
/* PRAZO / ATRASO                                                       */
/* ================================================================== */

export type DeadlineState =
  | "sem_prazo"
  | "no_prazo"
  | "vence_hoje"
  | "atrasada"
  | "pausado"
  | "concluida_no_prazo"
  | "concluida_com_atraso"
  | "neutro";

export type DeadlineView = { state: DeadlineState; label: string; title?: string };

const DEADLINE_DOT: Record<DeadlineState, string> = {
  sem_prazo: "bg-muted-foreground/40",
  no_prazo: "bg-emerald-500",
  vence_hoje: "bg-amber-500",
  atrasada: "bg-red-500",
  pausado: "",
  concluida_no_prazo: "bg-emerald-500",
  concluida_com_atraso: "bg-red-500",
  neutro: "bg-muted-foreground/40",
};

const DEADLINE_TEXT: Record<DeadlineState, string> = {
  sem_prazo: "text-muted-foreground",
  no_prazo: "text-muted-foreground",
  vence_hoje: "text-amber-700 dark:text-amber-400",
  atrasada: "text-red-700 dark:text-red-400",
  pausado: "text-amber-700 dark:text-amber-300",
  concluida_no_prazo: "text-muted-foreground",
  concluida_com_atraso: "text-red-700 dark:text-red-400",
  neutro: "text-muted-foreground",
};

/** Rótulo padrão de atraso — o mesmo texto em toda a plataforma. */
export const overdueLabel = (days: number) => `Atrasada · ${Math.max(1, days)}d`;

/** Prazo a partir de uma tarefa completa (Kanban/detalhe). Pausa vem do
 * bloqueio ativo (`blockedState.pausesDeadline`, decidido no servidor);
 * saúde do prazo vem de `taskDeadlineHealth` (mesma regra do Score). */
export function deadlineViewFromTask(
  task: TaskDeadlineHealthLike & { blockedState?: TaskBlockedState | null },
  cutoffHour: number,
  opts: { dateLabel?: string } = {},
): DeadlineView {
  if (task.status === "Bloqueada" && task.blockedState?.pausesDeadline) {
    return {
      state: "pausado",
      label: "Prazo pausado",
      title: "O prazo está pausado enquanto o bloqueio estiver ativo.",
    };
  }
  const h = taskDeadlineHealth(task, undefined, cutoffHour);
  switch (h.health) {
    case "atrasada":
      return { state: "atrasada", label: overdueLabel(h.delayDays ?? 1) };
    case "vence_hoje":
      return { state: "vence_hoje", label: "Vence hoje" };
    case "no_prazo":
      return { state: "no_prazo", label: opts.dateLabel ?? "No prazo", title: "No prazo" };
    case "sem_prazo":
      return { state: "sem_prazo", label: "Sem prazo" };
    default:
      return { state: h.health, label: h.label };
  }
}

/** Prazo a partir de uma `DashTask` (Time, Início, perfil) — reaproveita o
 * `bucket` já calculado (mesma regra de atraso do Score), sem recalcular. */
export function deadlineViewFromDashTask(
  t: Pick<DashTask, "status" | "bucket" | "due" | "dueISO" | "overdueDays" | "deadlinePaused">,
): DeadlineView {
  if (t.status === "Bloqueada" && t.deadlinePaused) {
    return { state: "pausado", label: "Prazo pausado" };
  }
  if (t.status === "Concluído" || t.status === "Arquivado") {
    return { state: "neutro", label: t.due || "—" };
  }
  if (t.bucket === "atrasada")
    return { state: "atrasada", label: overdueLabel(t.overdueDays ?? 1) };
  if (t.bucket === "hoje") return { state: "vence_hoje", label: "Vence hoje" };
  if (!t.dueISO) return { state: "sem_prazo", label: "Sem prazo" };
  return { state: "no_prazo", label: t.due || "No prazo", title: "No prazo" };
}

export function TaskDeadlineBadge({
  view,
  size = "sm",
  className,
}: {
  view: DeadlineView;
  size?: "xs" | "sm";
  className?: string;
}) {
  return (
    <span
      title={view.title}
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 tabular-nums",
        size === "xs" ? "text-[11px]" : "text-xs",
        view.state === "atrasada" || view.state === "vence_hoje" ? "font-semibold" : "font-medium",
        DEADLINE_TEXT[view.state],
        className,
      )}
    >
      {view.state === "pausado" ? (
        <PauseCircle aria-hidden className="h-3 w-3 shrink-0" />
      ) : (
        <span
          aria-hidden
          className={cx("h-1.5 w-1.5 shrink-0 rounded-full", DEADLINE_DOT[view.state])}
        />
      )}
      {view.label}
    </span>
  );
}

/* ================================================================== */
/* BLOQUEIO / DEPENDÊNCIA                                               */
/* ================================================================== */

/** 🔒 dependência de outra tarefa × ⏸ bloqueio operacional. */
export type BlockKind = "dependencia" | "operacional";

export function blockKindOf(b: Pick<TaskBlockedState, "category">): BlockKind {
  return b.category === "dependencia_tarefa" ? "dependencia" : "operacional";
}

/** Frase curta de "por que não avança" — linguagem neutra, nunca culpa. */
export function blockHeadline(b: TaskBlockedState): string {
  if (blockKindOf(b) === "dependencia") {
    return b.relatedTaskTitle ? `Depende de: ${b.relatedTaskTitle}` : "Depende de outra tarefa";
  }
  // Quem/o que está envolvido: a pessoa do time, ou a entidade descrita
  // (cliente/fornecedor) — os mesmos campos que o questionário grava.
  const who = b.responsibleForUnblockingName || b.relatedEntityType;
  return who
    ? `${TASK_BLOCK_CATEGORY_LABEL[b.category]} · ${who}`
    : TASK_BLOCK_CATEGORY_LABEL[b.category];
}

/** Indicador compacto (card, subtarefa, listas). */
export function TaskBlockIndicator({
  blocked,
  size = "sm",
  className,
}: {
  blocked: TaskBlockedState;
  size?: "xs" | "sm";
  className?: string;
}) {
  const kind = blockKindOf(blocked);
  const Icon = kind === "dependencia" ? Lock : PauseCircle;
  return (
    <span
      className={cx(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-amber-500/40 px-1.5 py-0.5 font-medium text-amber-800 dark:text-amber-300",
        size === "xs" ? "text-[10px]" : "text-[11px]",
        className,
      )}
    >
      <Icon aria-hidden className="h-3 w-3 shrink-0" />
      <span className="truncate">{blockHeadline(blocked)}</span>
    </span>
  );
}

/** Detalhe completo do bloqueio (topo do detalhe da tarefa). */
export function TaskBlockPanel({
  blocked,
  onResolve,
  onViewHistory,
}: {
  blocked: TaskBlockedState;
  onResolve: () => void;
  onViewHistory: () => void;
}) {
  const kind = blockKindOf(blocked);
  const Icon = kind === "dependencia" ? Lock : PauseCircle;
  return (
    <div
      role="status"
      className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-4 py-3 text-xs"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <Icon
            aria-hidden
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
              {kind === "dependencia" ? "Bloqueada por dependência" : "Bloqueio operacional"}
            </p>
            <p className="text-sm font-medium text-foreground">{blockHeadline(blocked)}</p>
            <p className="break-words text-muted-foreground">{blocked.reason}</p>
            {blocked.requiredAction && (
              <p className="break-words text-foreground">
                <span className="text-muted-foreground">Precisa acontecer: </span>
                {blocked.requiredAction}
              </p>
            )}
            <p className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
              <span>Desde {fmtDayMonth(blocked.blockedAt)}</span>
              {blocked.expectedResolutionAt && (
                <span>· Previsão {fmtDayMonth(blocked.expectedResolutionAt)}</span>
              )}
              <span
                className={
                  blocked.pausesDeadline ? "font-medium text-amber-800 dark:text-amber-300" : ""
                }
              >
                · {blocked.pausesDeadline ? "Prazo pausado" : "Prazo continua correndo"}
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:pt-0.5">
          <button
            type="button"
            onClick={onViewHistory}
            className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Ver histórico
          </button>
          <button
            type="button"
            onClick={onResolve}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Resolver bloqueio
          </button>
        </div>
      </div>
    </div>
  );
}

/** "🔗 Aguardando N dependência(s)" — dependência (task_dependencies) é
 * diferente de bloqueio manual: não muda status, só impede "Em andamento". */
export function TaskDependencyIndicator({
  pendingTitles,
  onClick,
}: {
  pendingTitles: string[];
  onClick?: () => void;
}) {
  if (pendingTitles.length === 0) return null;
  const n = pendingTitles.length;
  const label = `Aguardando ${n} dependência${n === 1 ? "" : "s"}`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Depende de: ${pendingTitles.join(", ")}`}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Link2 aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
      {label}
    </button>
  );
}

/* ================================================================== */
/* SEÇÕES DO DETALHE (Subtarefas, Dependências, Anexos)                 */
/* ================================================================== */

/** Cabeçalho único das seções recolhíveis do detalhe da tarefa:
 * "↳ Subtarefas 0/1", "🔗 Dependências 1", "📎 Anexos 2". */
export function TaskSectionHeader({
  icon,
  label,
  count,
  open,
  onToggle,
  onAdd,
  addLabel = "Adicionar",
  children,
}: {
  icon: ReactNode;
  label: string;
  count?: ReactNode;
  open: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  addLabel?: string;
  /** Conteúdo extra no meio (ex.: barra de progresso). */
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-w-0 items-center gap-1.5 rounded-md py-1 pr-1 text-xs font-semibold text-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ChevronRight
          aria-hidden
          className={cx(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="truncate">{label}</span>
        {count != null && (
          <span className="shrink-0 font-medium tabular-nums text-muted-foreground">{count}</span>
        )}
      </button>
      {children}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
          {addLabel}
        </button>
      )}
    </div>
  );
}

/** Estado vazio padrão dentro de uma seção de tarefa. */
export function TaskEmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-1 pl-5 text-xs text-muted-foreground">{children}</p>;
}
