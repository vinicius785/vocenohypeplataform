import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpDown,
  Check,
  CircleDot,
  Flag,
  LayoutGrid,
  Plus,
  RefreshCw,
  Search,
  Shapes,
  Smile,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { TaskOptionPicker } from "@/components/tasks/task-ui";
import { useMyAccess } from "@/lib/permissions";
import { getMe } from "@/lib/chat-store";
import { openReportProblem } from "@/lib/problem-context";
import {
  isLegacyProblemsSchema,
  listProblems,
  PRIORITY_RANK,
  PROBLEM_AREAS,
  PROBLEM_KIND_LABEL,
  PROBLEM_KINDS,
  PROBLEM_PRIORITIES,
  PROBLEM_PRIORITY_LABEL,
  PROBLEM_STATUS_LABEL,
  PROBLEM_STATUS_OPTIONS,
  summarizeProblems,
  type Problem,
  type ProblemKind,
  type ProblemPriority,
  type ProblemStatus,
} from "@/lib/problems";
import { PROBLEM_CREATED_EVENT } from "./ReportProblemSheet";
import { ProblemDetailSheet } from "./ProblemDetailSheet";
import {
  KIND_ICON,
  PROBLEM_PRIORITY_TONE,
  ProblemKindIcon,
  ProblemPriorityFlag,
  ProblemStatusBadge,
  ProblemStatusIcon,
  relativeDay,
} from "./problem-ui";

type View = "meus" | "todos" | "resolvidos";
type SortKey = "recentes" | "antigos" | "prioridade" | "atualizacao";

const SORT_LABEL: Record<SortKey, string> = {
  recentes: "Mais recentes",
  antigos: "Mais antigos",
  prioridade: "Prioridade",
  atualizacao: "Última atualização",
};

type Filters = {
  status: ProblemStatus | null;
  kind: ProblemKind | null;
  priority: ProblemPriority | null;
  area: string | null;
  assignee: string | null;
};

const NO_FILTERS: Filters = {
  status: null,
  kind: null,
  priority: null,
  area: null,
  assignee: null,
};
const ALL = "__all";

function FilterChip({
  icon,
  label,
  active,
  ...rest
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex h-8 max-w-[200px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-text-secondary hover:text-foreground"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * Central de Problemas — reportar algo e acompanhar o que já foi
 * reportado. Números e listas vêm dos registros reais (`bug_reports`,
 * source='plataforma'), sempre filtrados pela RLS do usuário.
 */
export function ProblemasSection() {
  const access = useMyAccess();
  const isAdmin = !!access?.isAdmin;
  const canManage = !!access && (access.isAdmin || access.permissions.includes("problemas"));
  const meId = useMemo(() => {
    try {
      return getMe().id || null;
    } catch {
      return null;
    }
  }, []);

  const [items, setItems] = useState<Problem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [view, setView] = useState<View>("todos");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>("atualizacao");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listProblems());
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    // Mudanças feitas por outras pessoas aparecem sem refresh manual: ao
    // voltar para a aba e a cada minuto enquanto ela estiver visível.
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    const timer = window.setInterval(onVisible, 60_000);
    window.addEventListener(PROBLEM_CREATED_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(PROBLEM_CREATED_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  /** Atualização otimista da linha (e dos indicadores, derivados de
   * `items`) assim que o painel altera algo; o recarregamento confirma. */
  const patchItem = useCallback((id: string, patch: Partial<Problem>) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const summary = useMemo(() => summarizeProblems(items), [items]);
  const assignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of items)
      if (p.assigneeId && p.assigneeName) map.set(p.assigneeId, p.assigneeName);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    );
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((p) => {
      if (view === "meus" && p.reporterId !== meId) return false;
      if (view === "resolvidos" && p.status !== "resolvido") return false;
      // Arquivados só aparecem quando filtrados explicitamente.
      if (p.status === "fechado" && filters.status !== "fechado") return false;
      if (filters.status && p.status !== filters.status) return false;
      if (filters.kind && p.kind !== filters.kind) return false;
      if (filters.priority && p.priority !== filters.priority) return false;
      if (filters.area && (p.area ?? "Outro") !== filters.area) return false;
      if (filters.assignee && p.assigneeId !== filters.assignee) return false;
      if (q && !`${p.title} ${p.description} ${p.reporterName}`.toLowerCase().includes(q))
        return false;
      return true;
    });
    return list.sort((a, b) => {
      switch (sort) {
        case "antigos":
          return a.createdAt.localeCompare(b.createdAt);
        case "recentes":
          return b.createdAt.localeCompare(a.createdAt);
        case "prioridade":
          return (
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            b.updatedAt.localeCompare(a.updatedAt)
          );
        default:
          return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
  }, [items, view, filters, query, sort, meId]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const openProblem = items.find((p) => p.id === openId) ?? null;

  const statTile = (label: string, value: number, onClick?: () => void, hint?: string) => {
    const body = (
      <>
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
          {state === "loading" ? "…" : value}
        </p>
        {hint && <p className="truncate text-[11px] text-text-secondary">{hint}</p>}
      </>
    );
    const cls = "surface-card min-w-0 px-4 py-3 text-left";
    return onClick ? (
      <button
        type="button"
        onClick={onClick}
        className={`${cls} transition-colors hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      >
        {body}
      </button>
    ) : (
      <div className={cls}>{body}</div>
    );
  };

  return (
    <PageContainer variant="wide">
      <div className="space-y-6">
        <PageHeader
          title="Problemas"
          description="Reporte problemas, acompanhe solicitações e veja o que já foi identificado."
          actionsSlot={
            <>
              <Button variant="primary" size="comfortable" onClick={() => openReportProblem()}>
                <Plus className="h-4 w-4" />
                Reportar problema
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statTile("Abertos", summary.abertos, undefined, "novos e aguardando informações")}
          {statTile("Em análise", summary.emAnalise, () => {
            setView("todos");
            setFilters({ ...NO_FILTERS, status: "em_analise" });
          })}
          {statTile("Em correção", summary.emCorrecao, () => {
            setView("todos");
            setFilters({ ...NO_FILTERS, status: "em_correcao" });
          })}
          {statTile("Resolvidos", summary.resolvidos, () => {
            setView("resolvidos");
            setFilters(NO_FILTERS);
          })}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              aria-label="Visão"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "meus", label: "Meus reports" },
                { value: "todos", label: "Todos" },
                { value: "resolvidos", label: "Resolvidos" },
              ]}
            />
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar problemas..."
                aria-label="Buscar problemas"
                className="h-9 border-0 bg-card pl-9 text-sm"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5 text-xs">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  {SORT_LABEL[sort]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <DropdownMenuItem key={k} onSelect={() => setSort(k)} className="gap-2">
                    <Check className={`h-3.5 w-3.5 ${sort === k ? "opacity-100" : "opacity-0"}`} />
                    {SORT_LABEL[k]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div
            role="group"
            aria-label="Filtros"
            className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            <TaskOptionPicker
              value={filters.status ?? ALL}
              ariaLabel="Filtrar por status"
              widthClass="w-60"
              options={[
                { value: ALL, label: "Todos os status" },
                ...PROBLEM_STATUS_OPTIONS.map((s) => ({
                  value: s,
                  label: PROBLEM_STATUS_LABEL[s],
                  icon: <ProblemStatusIcon status={s} />,
                })),
              ]}
              onSelect={(v) =>
                setFilters((f) => ({ ...f, status: v === ALL ? null : (v as ProblemStatus) }))
              }
              trigger={
                <FilterChip
                  icon={<CircleDot className="h-3.5 w-3.5" />}
                  label={filters.status ? PROBLEM_STATUS_LABEL[filters.status] : "Status"}
                  active={!!filters.status}
                />
              }
            />
            <TaskOptionPicker
              value={filters.kind ?? ALL}
              ariaLabel="Filtrar por tipo"
              widthClass="w-48"
              options={[
                { value: ALL, label: "Todos os tipos" },
                ...PROBLEM_KINDS.map((k) => {
                  const Icon = KIND_ICON[k];
                  return {
                    value: k,
                    label: PROBLEM_KIND_LABEL[k],
                    icon: <Icon aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />,
                  };
                }),
              ]}
              onSelect={(v) =>
                setFilters((f) => ({ ...f, kind: v === ALL ? null : (v as ProblemKind) }))
              }
              trigger={
                <FilterChip
                  icon={<Shapes className="h-3.5 w-3.5" />}
                  label={filters.kind ? PROBLEM_KIND_LABEL[filters.kind] : "Tipo"}
                  active={!!filters.kind}
                />
              }
            />
            <TaskOptionPicker
              value={filters.priority ?? ALL}
              ariaLabel="Filtrar por prioridade"
              widthClass="w-48"
              options={[
                { value: ALL, label: "Todas as prioridades" },
                ...PROBLEM_PRIORITIES.map((p) => ({
                  value: p,
                  label: PROBLEM_PRIORITY_LABEL[p],
                  icon: <Flag aria-hidden className={`h-3.5 w-3.5 ${PROBLEM_PRIORITY_TONE[p]}`} />,
                })),
              ]}
              onSelect={(v) =>
                setFilters((f) => ({ ...f, priority: v === ALL ? null : (v as ProblemPriority) }))
              }
              trigger={
                <FilterChip
                  icon={<Flag className="h-3.5 w-3.5" />}
                  label={filters.priority ? PROBLEM_PRIORITY_LABEL[filters.priority] : "Prioridade"}
                  active={!!filters.priority}
                />
              }
            />
            <TaskOptionPicker
              value={filters.area ?? ALL}
              ariaLabel="Filtrar por área"
              widthClass="w-56"
              searchable
              searchPlaceholder="Buscar área..."
              options={[
                { value: ALL, label: "Todas as áreas" },
                ...PROBLEM_AREAS.map((a) => ({ value: a as string, label: a })),
              ]}
              onSelect={(v) => setFilters((f) => ({ ...f, area: v === ALL ? null : v }))}
              trigger={
                <FilterChip
                  icon={<LayoutGrid className="h-3.5 w-3.5" />}
                  label={filters.area ?? "Área"}
                  active={!!filters.area}
                />
              }
            />
            <TaskOptionPicker
              value={filters.assignee ?? ALL}
              ariaLabel="Filtrar por responsável"
              widthClass="w-60"
              searchable={assignees.length > 6}
              options={[
                { value: ALL, label: "Qualquer responsável" },
                ...assignees.map((a) => ({ value: a.id, label: a.name })),
              ]}
              onSelect={(v) => setFilters((f) => ({ ...f, assignee: v === ALL ? null : v }))}
              trigger={
                <FilterChip
                  icon={<User className="h-3.5 w-3.5" />}
                  label={
                    filters.assignee
                      ? (assignees.find((a) => a.id === filters.assignee)?.name ?? "Responsável")
                      : "Responsável"
                  }
                  active={!!filters.assignee}
                />
              }
            />
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => setFilters(NO_FILTERS)}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-text-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> Limpar filtros
              </button>
            )}
          </div>
        </div>

        <section className="surface-card overflow-hidden">
          {state === "error" ? (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
              <p className="text-sm text-text-secondary">Não foi possível carregar os problemas.</p>
              <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
              </Button>
            </div>
          ) : state === "loading" ? (
            <p className="px-5 py-12 text-center text-sm text-text-secondary">Carregando…</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
              <Smile aria-hidden className="h-8 w-8 text-text-secondary" />
              <p className="text-sm font-medium text-foreground">Nenhum problema reportado</p>
              <p className="max-w-sm text-xs text-text-secondary">
                Está tudo tranquilo por aqui. Quando alguém reportar um problema, ele aparecerá
                nesta lista.
              </p>
              <Button
                variant="primary"
                size="sm"
                className="mt-2 gap-1.5"
                onClick={() => openReportProblem()}
              >
                <Plus className="h-3.5 w-3.5" /> Reportar problema
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-text-secondary">
              {view === "meus"
                ? "Você ainda não reportou nada com esses filtros."
                : "Nenhum problema encontrado com esses filtros."}
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {visible.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(p.id)}
                    className="grid w-full min-w-0 grid-cols-[20px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-5 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none md:grid-cols-[20px_minmax(0,1fr)_110px_84px_150px_130px_72px] md:items-center"
                  >
                    <ProblemKindIcon kind={p.kind} className="mt-0.5 h-4 w-4 md:mt-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground" title={p.title}>
                        {p.title}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-secondary md:hidden">
                        <span>{p.area ?? "Sem área"}</span>
                        <ProblemPriorityFlag priority={p.priority} className="text-[11px]" />
                        <ProblemStatusBadge status={p.status} />
                        <span>{relativeDay(p.updatedAt)}</span>
                      </p>
                    </div>
                    <span className="hidden truncate text-xs text-text-secondary md:block">
                      {p.area ?? "—"}
                    </span>
                    <span className="hidden md:block">
                      <ProblemPriorityFlag priority={p.priority} />
                    </span>
                    <span className="hidden min-w-0 md:block">
                      <ProblemStatusBadge status={p.status} />
                    </span>
                    <span
                      className="hidden truncate text-xs text-text-secondary md:block"
                      title={p.reporterName}
                    >
                      {p.reporterName}
                    </span>
                    <span className="hidden text-right text-xs tabular-nums text-text-secondary md:block">
                      {relativeDay(p.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!canManage && (
          <p className="text-[11px] text-text-secondary">
            Triagem (status, prioridade, responsável) é feita por quem tem a permissão “Gerenciar
            problemas”. Você pode comentar e acompanhar todos os reports.
          </p>
        )}

        <ProblemDetailSheet
          problem={openProblem}
          meId={meId}
          canManage={canManage}
          isAdmin={isAdmin}
          legacy={isLegacyProblemsSchema()}
          onClose={() => setOpenId(null)}
          onPatched={patchItem}
          onDeleted={(id) => {
            setItems((prev) => prev.filter((p) => p.id !== id));
            setOpenId(null);
            void load();
          }}
          onChanged={() => void load()}
        />
      </div>
    </PageContainer>
  );
}
