import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { KpiCell, KpiStrip } from "@/components/shared/Kpi";
import { AlertTriangle, Loader2, Plus, Search, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FilterChips,
  FilterGroup,
  FilterPill,
  FilterPopover,
  FilterRow,
  FilterSearch,
  FilterToolbar,
  SortMenu,
} from "@/components/shared/FilterToolbar";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
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
  ProblemKindIcon,
  ProblemPriorityFlag,
  ProblemStatusBadge,
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

  const kpiValue = (n: number) => (state === "loading" ? "…" : n);

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

        <KpiStrip aria-label="Resumo de problemas">
          <KpiCell
            label="Abertos"
            value={kpiValue(summary.abertos)}
            complement="novos e aguardando informações"
          />
          <KpiCell
            label="Em análise"
            value={kpiValue(summary.emAnalise)}
            onClick={() => {
              setView("todos");
              setFilters({ ...NO_FILTERS, status: "em_analise" });
            }}
          />
          <KpiCell
            label="Em correção"
            value={kpiValue(summary.emCorrecao)}
            onClick={() => {
              setView("todos");
              setFilters({ ...NO_FILTERS, status: "em_correcao" });
            }}
          />
          <KpiCell
            label="Resolvidos"
            value={kpiValue(summary.resolvidos)}
            onClick={() => {
              setView("resolvidos");
              setFilters(NO_FILTERS);
            }}
          />
        </KpiStrip>

        <div className="space-y-3">
          {/* Divisão primária da lista (quais reports ver) — não é filtro. */}
          <div className="-mx-4 max-w-full overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
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
          </div>

          <FilterToolbar>
            <FilterRow>
              <FilterSearch value={query} onChange={setQuery} placeholder="Buscar problemas..." />
              <FilterPopover
                title="Filtrar problemas"
                activeCount={activeFilterCount}
                onClear={() => setFilters(NO_FILTERS)}
              >
                <FilterGroup label="Status">
                  {PROBLEM_STATUS_OPTIONS.map((st) => (
                    <FilterPill
                      key={st}
                      active={filters.status === st}
                      onClick={() =>
                        setFilters((f) => ({ ...f, status: f.status === st ? null : st }))
                      }
                    >
                      {PROBLEM_STATUS_LABEL[st]}
                    </FilterPill>
                  ))}
                </FilterGroup>
                <FilterGroup label="Tipo">
                  {PROBLEM_KINDS.map((k) => (
                    <FilterPill
                      key={k}
                      active={filters.kind === k}
                      onClick={() => setFilters((f) => ({ ...f, kind: f.kind === k ? null : k }))}
                    >
                      {PROBLEM_KIND_LABEL[k]}
                    </FilterPill>
                  ))}
                </FilterGroup>
                <FilterGroup label="Prioridade">
                  {PROBLEM_PRIORITIES.map((pr) => (
                    <FilterPill
                      key={pr}
                      active={filters.priority === pr}
                      onClick={() =>
                        setFilters((f) => ({ ...f, priority: f.priority === pr ? null : pr }))
                      }
                    >
                      {PROBLEM_PRIORITY_LABEL[pr]}
                    </FilterPill>
                  ))}
                </FilterGroup>
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Área</p>
                  <NativeSelect
                    aria-label="Filtrar por área"
                    value={filters.area ?? ALL}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        area: e.target.value === ALL ? null : e.target.value,
                      }))
                    }
                  >
                    <option value={ALL}>Todas as áreas</option>
                    {PROBLEM_AREAS.map((ar) => (
                      <option key={ar} value={ar}>
                        {ar}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Responsável</p>
                  <NativeSelect
                    aria-label="Filtrar por responsável"
                    value={filters.assignee ?? ALL}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        assignee: e.target.value === ALL ? null : e.target.value,
                      }))
                    }
                  >
                    <option value={ALL}>Qualquer responsável</option>
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </FilterPopover>
              <SortMenu value={sort} options={SORT_LABEL} onChange={setSort} />
            </FilterRow>
            <FilterChips
              chips={[
                ...(filters.status
                  ? [
                      {
                        id: "status",
                        label: `Status: ${PROBLEM_STATUS_LABEL[filters.status]}`,
                        onRemove: () => setFilters((f) => ({ ...f, status: null })),
                      },
                    ]
                  : []),
                ...(filters.kind
                  ? [
                      {
                        id: "kind",
                        label: `Tipo: ${PROBLEM_KIND_LABEL[filters.kind]}`,
                        onRemove: () => setFilters((f) => ({ ...f, kind: null })),
                      },
                    ]
                  : []),
                ...(filters.priority
                  ? [
                      {
                        id: "priority",
                        label: `Prioridade: ${PROBLEM_PRIORITY_LABEL[filters.priority]}`,
                        onRemove: () => setFilters((f) => ({ ...f, priority: null })),
                      },
                    ]
                  : []),
                ...(filters.area
                  ? [
                      {
                        id: "area",
                        label: `Área: ${filters.area}`,
                        onRemove: () => setFilters((f) => ({ ...f, area: null })),
                      },
                    ]
                  : []),
                ...(filters.assignee
                  ? [
                      {
                        id: "assignee",
                        label: `Responsável: ${assignees.find((a) => a.id === filters.assignee)?.name ?? "—"}`,
                        onRemove: () => setFilters((f) => ({ ...f, assignee: null })),
                      },
                    ]
                  : []),
              ]}
              onClear={() => setFilters(NO_FILTERS)}
            />
          </FilterToolbar>
        </div>

        <section className="surface-card overflow-hidden">
          {state === "error" ? (
            <EmptyState
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Não foi possível carregar os problemas"
              primaryAction={{ label: "Tentar novamente", onClick: () => void load() }}
            />
          ) : state === "loading" ? (
            <div
              className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-text-secondary"
              role="status"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Smile className="h-5 w-5" />}
              title="Nenhum problema reportado"
              description="Está tudo tranquilo por aqui. Quando alguém reportar um problema, ele aparecerá nesta lista."
              primaryAction={{ label: "Reportar problema", onClick: () => openReportProblem() }}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title={
                view === "meus"
                  ? "Você ainda não reportou nada com esses filtros"
                  : "Nenhum problema encontrado"
              }
              description="Ajuste a busca ou os filtros para ver outros problemas."
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {visible.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(p.id)}
                    className="grid w-full min-w-0 grid-cols-[20px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-5 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none md:grid-cols-[20px_minmax(0,1fr)_96px_84px_150px_130px_110px_72px] md:items-center"
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
                      className={`hidden truncate text-xs md:block ${p.assigneeName ? "text-foreground" : "text-text-secondary/70"}`}
                      title={p.assigneeName ? `Responsável: ${p.assigneeName}` : "Sem responsável"}
                    >
                      {p.assigneeName ?? "Sem responsável"}
                    </span>
                    <span
                      className="hidden truncate text-xs text-text-secondary md:block"
                      title={`Reportado por ${p.reporterName}`}
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
