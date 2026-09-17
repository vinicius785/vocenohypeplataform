/**
 * Componentes visuais das respostas estruturadas do Hypito — puro
 * frontend: LÊ um `HypitoMessage` (`hypito-messages.ts`) já validado e
 * escolhe o card certo por `kind`. Nunca interpreta texto, nunca decide
 * o que o backend já decidiu — só apresenta e encaminha cliques pros
 * handlers recebidos por prop (que quem monta este componente,
 * `ChatSection.tsx`, liga no router real e nas server functions de
 * confirmar/cancelar).
 *
 * Direção visual (pedido, seção 6): superfície levemente elevada em
 * relação ao chat (`Card variant="muted"`), raio canônico do design
 * system (`rounded-xl`, já usado em todo card da plataforma), sem
 * gradiente saturado/glow, azul da marca (`variant="primary"` do
 * `Button`, token `--brand`) só na ação principal.
 */
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar as CalendarIcon,
  ListChecks,
  Search,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Avatar, initialsOf, colorFor } from "@/components/tasks/TaskBoard";
import { STATUS_COLOR, STATUS_LABEL, type MemberStatus } from "@/lib/chat-store";
import { cn } from "@/lib/utils";
import type {
  HypitoMessage,
  HypitoEntityRef,
  HypitoAction,
  HypitoTaskFilterKind,
  SourceMessageRef,
} from "@/lib/hypito-messages";

export type HypitoCardHandlers = {
  onOpenEntity: (ref: HypitoEntityRef) => void;
  onOpenFilter: (filter: { kind: HypitoTaskFilterKind; scopeId?: string }) => void;
  onOpenAgenda: () => void;
  onConfirmTask: (pendingActionId: string) => Promise<void>;
  onEditTask: (pendingActionId: string) => Promise<void>;
  onCancelTask: (pendingActionId: string) => Promise<void>;
  /** Clique numa opção de `entity_choice` — reenvia a intenção anterior
   * com o nome exato da opção escolhida (o usuário não precisa digitar
   * de novo), sem exigir confirmação extra. */
  onSelectChoice: (name: string) => void;
  /** Cliques nos 3 pickers ricos do rascunho de tarefa (pedido, seção 1)
   * — nunca reprocessados como texto livre. */
  onPickScope: (ref: HypitoEntityRef) => void;
  onPickAssignee: (ref: HypitoEntityRef) => void;
  onPickDate: (isoDate: string) => void;
  onConfirmInterpretedDate: (confirmed: boolean) => void;
  /** "Ver mensagem original" (pedido, seção 5) — navega pro canal/DM e
   * mensagem exatos, nunca uma rota crua vinda do backend. */
  onOpenSourceMessage: (ref: SourceMessageRef) => void;
  /** Ações do alerta de tarefas atrasadas (pedido, seção 2) — "Concluir"
   * executa direto (o clique no botão nomeado já é a confirmação
   * explícita); "Replanejar"/"Bloquear" abrem a tarefa com o MESMO
   * questionário da Activity já pré-armado, nunca um questionário novo
   * dentro do chat. Opcionais porque só o card de alerta os usa. */
  onCompleteTaskFromAlert?: (ref: HypitoEntityRef) => Promise<void>;
  onReplanTaskFromAlert?: (ref: HypitoEntityRef) => void;
  onBlockTaskFromAlert?: (ref: HypitoEntityRef) => void;
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "sem prazo";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function CardShell({
  children,
  className,
  tone,
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "success" | "error" | "cancelled";
}) {
  return (
    <Card
      variant="muted"
      className={cn(
        "w-full max-w-[420px] space-y-2.5 border p-4 text-sm",
        tone === "success" && "border-success-soft/60",
        tone === "error" && "border-danger-soft/60",
        tone === "cancelled" && "opacity-80",
        className,
      )}
    >
      {children}
    </Card>
  );
}

/** Título+ícone alinhados, metadados em cinza — cabeçalho comum a quase
 * todos os cards (pedido, seção 6). */
function CardHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-tight text-foreground">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function EntityLink({
  entityRef,
  onOpen,
}: {
  entityRef: HypitoEntityRef;
  onOpen: (r: HypitoEntityRef) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entityRef)}
      className="rounded text-left font-medium text-foreground underline decoration-muted-foreground/40 decoration-1 underline-offset-2 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {entityRef.name}
    </button>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p className="text-[13px] text-foreground">
      <span className="text-muted-foreground">{label}: </span>
      {value}
    </p>
  );
}

/* ---------------- task_draft ---------------- */

function TaskDraftCard({
  payload,
  handlers,
}: {
  payload: Extract<HypitoMessage, { kind: "task_draft" }>;
  handlers: HypitoCardHandlers;
}) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | "edit" | null>(null);
  const [done, setDone] = useState(false);
  const d = payload.data;

  const run = async (kind: "confirm" | "cancel" | "edit", fn: () => Promise<void>) => {
    if (busy || done) return;
    setBusy(kind);
    try {
      await fn();
      setDone(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <CardShell>
      <CardHeading
        icon={<ListChecks className="h-4 w-4" />}
        title={payload.title ?? "Criar tarefa"}
      />
      <div className="space-y-1">
        <Field label="Título" value={d.title} />
        <Field
          label="Responsável"
          value={d.assigneeIsRequester ? "você" : (d.assignee?.name ?? "não definido")}
        />
        <Field label="Projeto/campanha" value={d.scope?.name ?? "sem projeto/campanha"} />
        <Field
          label="Prazo"
          value={d.dueAtIso ? `${fmtDate(d.dueAtIso)} às ${fmtTime(d.dueAtIso)}` : "sem prazo"}
        />
        <Field label="Prioridade" value={d.priority} />
      </div>
      {!done && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant="primary"
            size="sm"
            isLoading={busy === "confirm"}
            disabled={busy !== null}
            onClick={() => run("confirm", () => handlers.onConfirmTask(payload.pendingActionId))}
          >
            Confirmar criação
          </Button>
          <Button
            variant="outline"
            size="sm"
            isLoading={busy === "edit"}
            disabled={busy !== null}
            onClick={() => run("edit", () => handlers.onEditTask(payload.pendingActionId))}
          >
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            isLoading={busy === "cancel"}
            disabled={busy !== null}
            onClick={() => run("cancel", () => handlers.onCancelTask(payload.pendingActionId))}
          >
            Cancelar
          </Button>
        </div>
      )}
    </CardShell>
  );
}

/* ---------------- task_created ---------------- */

function TaskCreatedCard({
  payload,
  handlers,
}: {
  payload: Extract<HypitoMessage, { kind: "task_created" }>;
  handlers: HypitoCardHandlers;
}) {
  const d = payload.data;
  return (
    <CardShell tone="success">
      <CardHeading
        icon={<CheckCircle2 className="h-4 w-4 text-success-soft-foreground" />}
        title="Tarefa criada"
      />
      <p className="text-[13px] font-medium text-foreground">{d.task.name}</p>
      <div className="space-y-1">
        <Field
          label="Prazo"
          value={d.dueAtIso ? `${fmtDate(d.dueAtIso)} às ${fmtTime(d.dueAtIso)}` : "sem prazo"}
        />
        <Field
          label="Responsável"
          value={d.assigneeIsRequester ? "você" : (d.assignee?.name ?? "não definido")}
        />
        {d.scope && (
          <Field label={d.scope.type === "project" ? "Projeto" : "Campanha"} value={d.scope.name} />
        )}
        <Field label="Prioridade" value={d.priority} />
      </div>
      {d.sourceMessage && (
        <p className="text-xs text-muted-foreground">Criada a partir de uma conversa no Chat.</p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="primary" size="sm" onClick={() => handlers.onOpenEntity(d.task)}>
          Abrir tarefa
        </Button>
        {d.sourceMessage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlers.onOpenSourceMessage(d.sourceMessage!)}
          >
            Ver mensagem original
          </Button>
        )}
      </div>
    </CardShell>
  );
}

/* ---------------- task_list ---------------- */

function TaskListCard({
  payload,
  handlers,
}: {
  payload: Extract<HypitoMessage, { kind: "task_list" }>;
  handlers: HypitoCardHandlers;
}) {
  const d = payload.data;
  return (
    <CardShell className="max-w-[440px]">
      <CardHeading
        icon={<ListChecks className="h-4 w-4" />}
        title={payload.title ?? "Tarefas"}
        subtitle={`${d.total} encontrada${d.total === 1 ? "" : "s"}`}
      />
      <ul className="divide-y divide-border/60">
        {d.items.map((item) => (
          <li
            key={item.task.id}
            className="flex items-center justify-between gap-2 py-1.5 text-[13px]"
          >
            <button
              type="button"
              onClick={() => handlers.onOpenEntity(item.task)}
              className="min-w-0 flex-1 truncate text-left font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {item.task.name}
            </button>
            <span className="shrink-0 text-xs text-muted-foreground">
              {fmtDate(item.dueDateIso)}
            </span>
          </li>
        ))}
      </ul>
      {payload.actions.map((a) => (
        <ActionButton key={a.id} action={a} handlers={handlers} />
      ))}
    </CardShell>
  );
}

/* ---------------- campaign_summary / project_summary ---------------- */

function ScopeSummaryCard({
  payload,
  handlers,
}: {
  payload: Extract<HypitoMessage, { kind: "campaign_summary" | "project_summary" }>;
  handlers: HypitoCardHandlers;
}) {
  const d = payload.data;
  const parts: string[] = [];
  if (d.openTasks > 0)
    parts.push(
      `${d.openTasks} tarefa${d.openTasks === 1 ? "" : "s"} aberta${d.openTasks === 1 ? "" : "s"}`,
    );
  if (d.overdueTasks > 0)
    parts.push(`${d.overdueTasks} atrasada${d.overdueTasks === 1 ? "" : "s"}`);
  return (
    <CardShell>
      <CardHeading
        icon={<ListChecks className="h-4 w-4" />}
        title={payload.kind === "project_summary" ? "Projeto" : "Campanha"}
      />
      <EntityLink entityRef={d.entity} onOpen={handlers.onOpenEntity} />
      <p className="text-[13px] text-muted-foreground">
        {parts.length > 0 ? parts.join(" · ") : "Sem tarefas em aberto no momento."}
        {d.pendingApprovals > 0 && ` · ${d.pendingApprovals} aguardando aprovação`}
      </p>
      {d.nextDueTask && (
        <p className="text-[13px] text-foreground">
          Próxima entrega:{" "}
          <button
            type="button"
            className="font-medium underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
            onClick={() => d.nextDueTask?.task && handlers.onOpenEntity(d.nextDueTask.task)}
          >
            {d.nextDueTask.title}
          </button>{" "}
          em {fmtDate(d.nextDueTask.dueDateIso)}
        </p>
      )}
      {d.attentionNote && (
        <div className="flex items-start gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-[12px] text-warning-soft-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{d.attentionNote}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {payload.actions.map((a) => (
          <ActionButton key={a.id} action={a} handlers={handlers} />
        ))}
      </div>
    </CardShell>
  );
}

/* ---------------- agenda_summary ---------------- */

function AgendaSummaryCard({
  payload,
  handlers,
}: {
  payload: Extract<HypitoMessage, { kind: "agenda_summary" }>;
  handlers: HypitoCardHandlers;
}) {
  const d = payload.data;
  return (
    <CardShell className="max-w-[460px]">
      <CardHeading
        icon={<CalendarIcon className="h-4 w-4" />}
        title={d.periodLabel}
        subtitle={`${d.total} compromisso${d.total === 1 ? "" : "s"} encontrado${d.total === 1 ? "" : "s"}`}
      />
      <div className="space-y-2.5">
        {d.groups.map((g) => (
          <div key={g.dateIso}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {g.label}
            </p>
            <ul className="mt-1 divide-y divide-border/60">
              {g.items.map((it) => (
                <li key={it.meeting.id}>
                  <button
                    type="button"
                    onClick={() => handlers.onOpenEntity(it.meeting)}
                    className="flex w-full items-center gap-2 py-1 text-left text-[13px] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                      {fmtTime(it.whenIso)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {it.meeting.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {payload.actions.map((a) => (
        <ActionButton key={a.id} action={a} handlers={handlers} />
      ))}
    </CardShell>
  );
}

/* ---------------- entity_choice ---------------- */

function EntityChoiceCard({
  payload,
  handlers,
}: {
  payload: Extract<HypitoMessage, { kind: "entity_choice" }>;
  handlers: HypitoCardHandlers;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const d = payload.data;
  return (
    <CardShell>
      <p className="text-[13px] text-foreground">{payload.textFallback}</p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {d.options.map((opt) => (
          <button
            key={opt.ref.id}
            type="button"
            disabled={chosen !== null}
            onClick={() => {
              setChosen(opt.ref.id);
              handlers.onSelectChoice(opt.ref.name);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              chosen === opt.ref.id
                ? "border-brand bg-brand-subtle text-brand"
                : "border-border text-foreground hover:bg-muted disabled:opacity-50",
            )}
          >
            {opt.ref.name}
          </button>
        ))}
      </div>
    </CardShell>
  );
}

/* ---------------- scope_picker ---------------- */

function ScopePickerCard({
  payload,
  handlers,
}: {
  payload: Extract<HypitoMessage, { kind: "scope_picker" }>;
  handlers: HypitoCardHandlers;
}) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const d = payload.data;
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(query);
  const filter = (opts: typeof d.projects) =>
    q ? opts.filter((o) => norm(o.ref.name).includes(q)) : opts;

  const pick = (ref: HypitoEntityRef) => {
    setChosen(ref.id);
    handlers.onPickScope(ref);
  };

  const renderGroup = (label: string, options: typeof d.projects) => {
    const items = filter(options);
    if (items.length === 0) return null;
    return (
      <div key={label}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <ul className="mt-1 divide-y divide-border/60">
          {items.map((opt) => (
            <li key={opt.ref.id}>
              <button
                type="button"
                disabled={chosen !== null}
                onClick={() => pick(opt.ref)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded px-1.5 py-1.5 text-left text-[13px] hover:bg-muted disabled:opacity-50",
                  chosen === opt.ref.id && "bg-brand-subtle text-brand",
                )}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{opt.ref.name}</span>
                {opt.clientName && (
                  <span className="shrink-0 text-xs text-muted-foreground">{opt.clientName}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <CardShell className="max-w-[440px]">
      <CardHeading icon={<ListChecks className="h-4 w-4" />} title="Projeto ou campanha" />
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar..."
          className="h-8 pl-7 text-sm"
        />
      </div>
      <div className="max-h-64 space-y-2.5 overflow-y-auto">
        {d.recent.length > 0 && renderGroup("Recentes", d.recent)}
        {renderGroup("Projetos", d.projects)}
        {renderGroup("Campanhas", d.campaigns)}
      </div>
    </CardShell>
  );
}

/* ---------------- assignee_picker ---------------- */

function AssigneePickerCard({
  payload,
  handlers,
}: {
  payload: Extract<HypitoMessage, { kind: "assignee_picker" }>;
  handlers: HypitoCardHandlers;
}) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const d = payload.data;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return d.options;
    return d.options.filter((o) => o.ref.name.toLowerCase().includes(q));
  }, [d.options, query]);

  return (
    <CardShell className="max-w-[420px]">
      <CardHeading
        icon={<ListChecks className="h-4 w-4" />}
        title="Responsável"
        subtitle={d.scope?.name}
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar pessoa..."
          className="h-8 pl-7 text-sm"
        />
      </div>
      <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto">
        {filtered.map((opt) => (
          <li key={opt.ref.id}>
            <button
              type="button"
              disabled={chosen !== null}
              onClick={() => {
                setChosen(opt.ref.id);
                handlers.onPickAssignee(opt.ref);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-[13px] hover:bg-muted disabled:opacity-50",
                chosen === opt.ref.id && "bg-brand-subtle text-brand",
              )}
            >
              <span className="relative shrink-0">
                <Avatar
                  member={{
                    name: opt.ref.name,
                    initials: initialsOf(opt.ref.name) || "?",
                    color: colorFor(opt.ref.name),
                  }}
                  size={24}
                />
                {opt.availability && (
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-card",
                      STATUS_COLOR[opt.availability as MemberStatus],
                    )}
                    title={STATUS_LABEL[opt.availability as MemberStatus]}
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{opt.ref.name}</span>
                {opt.role && (
                  <span className="block truncate text-xs text-muted-foreground">{opt.role}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

/* ---------------- date_picker ---------------- */

function DatePickerCard({
  payload,
  handlers,
}: {
  payload: Extract<HypitoMessage, { kind: "date_picker" }>;
  handlers: HypitoCardHandlers;
}) {
  const [answered, setAnswered] = useState(false);
  const [showCalendar, setShowCalendar] = useState(!payload.data.interpretedIso);
  const d = payload.data;

  if (!showCalendar && d.interpretedIso) {
    return (
      <CardShell>
        <p className="text-[13px] text-foreground">{payload.textFallback}</p>
        {!answered && (
          <div className="flex gap-2 pt-1">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setAnswered(true);
                handlers.onConfirmInterpretedDate(true);
              }}
            >
              Sim
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAnswered(true);
                setShowCalendar(true);
                handlers.onConfirmInterpretedDate(false);
              }}
            >
              Não, escolher outra data
            </Button>
          </div>
        )}
      </CardShell>
    );
  }

  return (
    <CardShell className="w-auto">
      <CardHeading icon={<CalendarIcon className="h-4 w-4" />} title="Qual o prazo?" />
      <Calendar
        mode="single"
        disabled={answered}
        onSelect={(date) => {
          if (!date || answered) return;
          setAnswered(true);
          const iso = new Date(date.getFullYear(), date.getMonth(), date.getDate())
            .toISOString()
            .slice(0, 10);
          handlers.onPickDate(iso);
        }}
      />
    </CardShell>
  );
}

/* ---------------- overdue_alert ---------------- */

function OverdueAlertCard({
  payload,
  handlers,
}: {
  payload: Extract<HypitoMessage, { kind: "overdue_alert" }>;
  handlers: HypitoCardHandlers;
}) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const d = payload.data;
  return (
    <CardShell className="max-w-[460px]">
      <CardHeading
        icon={<AlertTriangle className="h-4 w-4 text-warning-soft-foreground" />}
        title="Tarefas atrasadas"
        subtitle={`${d.totalCount} no total`}
      />
      <ul className="divide-y divide-border/60">
        {d.items.map((item) => {
          const done = resolvedIds.has(item.task.id);
          return (
            <li key={item.task.id} className={cn("space-y-1.5 py-2", done && "opacity-50")}>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handlers.onOpenEntity(item.task)}
                  className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-foreground hover:underline"
                >
                  {item.task.name}
                </button>
                <span className="shrink-0 text-xs font-medium text-danger-soft-foreground">
                  {item.daysLate} dia{item.daysLate === 1 ? "" : "s"} atrasada
                </span>
              </div>
              {item.scope && <p className="text-xs text-muted-foreground">{item.scope.name}</p>}
              {!done && (
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => handlers.onOpenEntity(item.task)}
                  >
                    Abrir
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={async () => {
                      await handlers.onCompleteTaskFromAlert?.(item.task);
                      setResolvedIds((prev) => new Set(prev).add(item.task.id));
                    }}
                  >
                    Concluir
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => handlers.onReplanTaskFromAlert?.(item.task)}
                  >
                    Replanejar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => handlers.onBlockTaskFromAlert?.(item.task)}
                  >
                    <Lock className="h-3 w-3" /> Bloquear
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}

/* ---------------- friendly_error / success ---------------- */

function StatusCard({
  payload,
}: {
  payload: Extract<HypitoMessage, { kind: "friendly_error" | "success" }>;
}) {
  const isError = payload.kind === "friendly_error" && payload.state === "error";
  const isCancelled = payload.state === "cancelled";
  return (
    <CardShell tone={isError ? "error" : isCancelled ? "cancelled" : "success"}>
      <CardHeading
        icon={
          isError ? (
            <XCircle className="h-4 w-4 text-danger-soft-foreground" />
          ) : isCancelled ? (
            <XCircle className="h-4 w-4 text-muted-foreground" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-success-soft-foreground" />
          )
        }
        title={payload.title ?? payload.textFallback}
      />
      {payload.kind === "friendly_error" && payload.data.whatWasNotChanged && (
        <p className="text-xs text-muted-foreground">{payload.data.whatWasNotChanged}</p>
      )}
    </CardShell>
  );
}

/* ---------------- action button (compartilhado) ---------------- */

function ActionButton({
  action,
  handlers,
}: {
  action: HypitoAction;
  handlers: HypitoCardHandlers;
}) {
  const variant =
    action.variant === "primary"
      ? "primary"
      : action.variant === "destructive"
        ? "destructive"
        : action.variant === "link"
          ? "link"
          : "outline";
  const onClick = () => {
    if (action.entity) return handlers.onOpenEntity(action.entity);
    if (action.filter) return handlers.onOpenFilter(action.filter);
    if (action.id === "open_agenda") return handlers.onOpenAgenda();
  };
  return (
    <Button variant={variant} size="sm" onClick={onClick}>
      {action.label}
    </Button>
  );
}

/* ---------------- router ---------------- */

export function HypitoMessageCard({
  payload,
  handlers,
}: {
  payload: HypitoMessage;
  handlers: HypitoCardHandlers;
}) {
  switch (payload.kind) {
    case "text":
      return null;
    case "task_draft":
      return <TaskDraftCard payload={payload} handlers={handlers} />;
    case "task_created":
      return <TaskCreatedCard payload={payload} handlers={handlers} />;
    case "task_list":
      return <TaskListCard payload={payload} handlers={handlers} />;
    case "campaign_summary":
    case "project_summary":
      return <ScopeSummaryCard payload={payload} handlers={handlers} />;
    case "agenda_summary":
      return <AgendaSummaryCard payload={payload} handlers={handlers} />;
    case "entity_choice":
      return <EntityChoiceCard payload={payload} handlers={handlers} />;
    case "scope_picker":
      return <ScopePickerCard payload={payload} handlers={handlers} />;
    case "assignee_picker":
      return <AssigneePickerCard payload={payload} handlers={handlers} />;
    case "date_picker":
      return <DatePickerCard payload={payload} handlers={handlers} />;
    case "overdue_alert":
      return <OverdueAlertCard payload={payload} handlers={handlers} />;
    case "friendly_error":
    case "success":
      return <StatusCard payload={payload} />;
    default:
      return null;
  }
}

/** `true` quando o payload é de um tipo com card próprio — usado por
 * `ChatSection.tsx` pra decidir se ainda mostra a bolha de texto normal
 * (kind `"text"`) ou só o card (os outros kinds já incluem o texto
 * relevante dentro do próprio componente visual). */
export function hasOwnCard(payload: HypitoMessage): boolean {
  return payload.kind !== "text";
}
