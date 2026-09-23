/** Lógica pura da listagem de Projetos — progresso, saúde operacional,
 * responsáveis, filtros e ordenação. Um único lugar pra tudo isso
 * (nenhum cálculo duplicado em `ProjectCard.tsx`/`ProjetosSection.tsx`),
 * mesmo espírito de `cliente-ui.ts`/`campanha-ui.ts`. Nenhuma chamada
 * remota nova — opera só sobre o que `loadProjetos()` já carrega.
 */
import type { ComponentType } from "react";
import {
  Map as MapIcon,
  KanbanSquare,
  Users,
  FileText,
  CalendarDays,
  Megaphone,
  Newspaper,
  Radar,
  Bug,
  Mail,
} from "lucide-react";
import type { FeatureKey, Project, ProjectStatus, Task, TeamMemberLite } from "@/lib/projetos";
import { getTaskAssignees, loadTeamMembers } from "@/lib/projetos";
import { OPEN_STATUSES } from "@/lib/score";
import { todayIsoInBrasilia } from "@/lib/timezone";
import { timeAgo } from "@/components/metas/metas-ui-utils";

/** Ícone por funcionalidade — usado tanto no card quanto no wizard
 * (`ProjetosSection.tsx`), um lugar só pra não divergir. */
export const FEATURE_ICONS: Record<FeatureKey, ComponentType<{ className?: string }>> = {
  roadmap: MapIcon,
  kanban: KanbanSquare,
  influenciadores: Users,
  documentos: FileText,
  calendario_editorial: CalendarDays,
  trafego_pago: Megaphone,
  blog: Newspaper,
  aeo_monitor: Radar,
  bugs_sugestoes: Bug,
  fluxos_email: Mail,
};

/* ============================================================
 * Saúde operacional — calculada, nunca armazenada. Não existia nenhuma
 * regra de "projeto em risco" no sistema antes disso (só a nível de FASE
 * de roadmap, em `roadmap-engine.ts`'s `faseStatusEfetivo`) — os
 * limiares abaixo são os "sugestão inicial" do pedido, adotados por
 * ausência de uma regra prévia pra reaproveitar.
 * ============================================================ */

export type ProjectHealth = "saudavel" | "atencao" | "em_risco";

export const PROJECT_HEALTH_LABEL: Record<ProjectHealth, string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  em_risco: "Em risco",
};

export const PROJECT_HEALTH_BADGE_VARIANT: Record<ProjectHealth, "success" | "warning" | "danger"> =
  {
    saudavel: "success",
    atencao: "warning",
    em_risco: "danger",
  };

export const PROJECT_STATUS_BADGE_VARIANT: Record<
  ProjectStatus,
  "brand" | "secondary" | "outline"
> = {
  ativo: "brand",
  pausado: "secondary",
  concluido: "outline",
  arquivado: "outline",
};

/** % de tarefas abertas atrasadas a partir do qual o projeto vira
 * "Atenção"/"Em risco". Nomeados aqui, nunca soltos no JSX — mesma
 * convenção de `roadmap-engine.ts`'s `RISCO_DIAS_RESTANTES`. */
const RISK_ATENCAO_MIN_PCT = 10;
const RISK_EM_RISCO_MIN_PCT = 25;
/** Dias até o prazo pra contar como "vencendo em breve" — mesmo valor de
 * `roadmap-engine.ts`'s `RISCO_DIAS_RESTANTES`, por consistência. */
export const DUE_SOON_DAYS = 7;
/** Dias sem nenhuma atividade (projeto ou tarefa) pra contar como
 * "ausência prolongada" (item de Atenção). */
const INACTIVITY_ATENCAO_DAYS = 14;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isOverdue(t: Task, today: string): boolean {
  return !!t.dueDate && t.dueDate < today && OPEN_STATUSES.has(t.status);
}

function isDueSoon(t: Task, today: string, limitIso: string): boolean {
  return !!t.dueDate && t.dueDate >= today && t.dueDate <= limitIso && OPEN_STATUSES.has(t.status);
}

/** Só tarefas de primeiro nível (`project.tasks`) — nunca desce em
 * `Task.subtasks` aqui, de propósito: subtarefas ficam ANINHADAS dentro
 * da tarefa-mãe (não são linhas à parte em `projeto_tarefas`), então
 * somar os dois níveis contaria a mesma entrega duas vezes. */
function computeProgress(tasks: Task[]): { total: number; completed: number; pct: number | null } {
  const validas = tasks.filter((t) => t.status !== "Arquivado");
  const total = validas.length;
  if (total === 0) return { total: 0, completed: 0, pct: null };
  const completed = validas.filter((t) => t.status === "Concluído").length;
  return { total, completed, pct: Math.round((completed / total) * 100) };
}

/** "Prazo final do projeto" — não existe um campo dedicado pra isso
 * (nunca existiu), então é derivado da data do marco (`Milestone`) mais
 * distante já cadastrado, reaproveitando um dado que já existe em vez de
 * inventar campo novo que ficaria vazio em todo projeto antigo. */
function projectDeadlineIso(project: Project): string | null {
  const datas = project.milestones.map((m) => m.date).filter(Boolean);
  if (datas.length === 0) return null;
  return [...datas].sort().at(-1) ?? null;
}

function taskLastActivityMs(t: Task): number {
  let max = t.createdAt ? Date.parse(t.createdAt) : NaN;
  if (t.completedAt) {
    const ms = Date.parse(t.completedAt);
    if (!Number.isNaN(ms)) max = Number.isNaN(max) ? ms : Math.max(max, ms);
  }
  for (const a of t.activity ?? []) {
    const ms = Date.parse(a.createdAt);
    if (!Number.isNaN(ms)) max = Number.isNaN(max) ? ms : Math.max(max, ms);
  }
  return Number.isNaN(max) ? 0 : max;
}

/** Última atividade do projeto — o mais recente entre a última edição do
 * PRÓPRIO projeto (`Project.updatedAt`) e a atividade mais recente de
 * qualquer tarefa dele (criação, conclusão, entradas do log de
 * atividade). */
function projectLastActivityMs(project: Project, tasks: Task[]): number {
  let max = project.updatedAt ?? project.createdAt;
  for (const t of tasks) max = Math.max(max, taskLastActivityMs(t));
  return max;
}

function computeHealth(input: {
  openCount: number;
  overdueCount: number;
  blockedCount: number;
  deadlineIso: string | null;
  lastActivityMs: number;
  today: string;
}): ProjectHealth {
  const { openCount, overdueCount, blockedCount, deadlineIso, lastActivityMs, today } = input;
  const deadlineVencido = !!deadlineIso && deadlineIso < today;
  const pctAtrasadas = openCount > 0 ? (overdueCount / openCount) * 100 : 0;
  const inatividadeDias = Math.floor((Date.now() - lastActivityMs) / 86_400_000);
  // "Bloqueio crítico": a plataforma não modela graus de criticidade de
  // bloqueio hoje (`TaskBlockedState` não tem um campo de severidade),
  // então todo bloqueio ativo é tratado como crítico — simplificação
  // deliberada, documentada aqui.
  if (
    pctAtrasadas > RISK_EM_RISCO_MIN_PCT ||
    blockedCount > 0 ||
    (deadlineVencido && openCount > 0)
  ) {
    return "em_risco";
  }
  const prazoProximo =
    !!deadlineIso && !deadlineVencido && deadlineIso <= addDaysIso(today, DUE_SOON_DAYS);
  if (
    pctAtrasadas >= RISK_ATENCAO_MIN_PCT ||
    prazoProximo ||
    inatividadeDias >= INACTIVITY_ATENCAO_DAYS
  ) {
    return "atencao";
  }
  return "saudavel";
}

/* ============================================================
 * Responsabilidade — não existe campo de "dono do projeto"; o
 * responsável principal e os participantes são derivados de quem mais
 * aparece como assignee nas tarefas ABERTAS do projeto (mesma regra de
 * crédito integral por responsável de `score.ts`/`getTaskAssignees` —
 * não divide, só não repete o mesmo nome duas vezes).
 * ============================================================ */

export type ProjectPerson = { id: string; name: string; photo?: string };

function resolvePerson(name: string, team: TeamMemberLite[]): ProjectPerson {
  const match = team.find((m) => m.name === name);
  return { id: match?.id ?? name, name, photo: match?.photo };
}

function deriveResponsibility(
  tasks: Task[],
  team: TeamMemberLite[],
): { principal: ProjectPerson | null; participantes: ProjectPerson[] } {
  const abertas = tasks.filter((t) => OPEN_STATUSES.has(t.status));
  const counts = new Map<string, number>();
  for (const t of abertas) {
    for (const name of getTaskAssignees(t)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  if (counts.size === 0) return { principal: null, participantes: [] };
  const ranked = Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"),
  );
  const principal = resolvePerson(ranked[0][0], team);
  const participantes = ranked.slice(1).map(([name]) => resolvePerson(name, team));
  return { principal, participantes };
}

/* ============================================================
 * Métricas agregadas — uma função só por projeto, chamada uma vez por
 * render da listagem (nenhuma consulta nova por card: tudo já está em
 * memória via `loadProjetos()`/`loadTeamMembers()`).
 * ============================================================ */

export type ProjectMetrics = {
  total: number;
  completed: number;
  progressPct: number | null;
  openCount: number;
  overdueCount: number;
  dueSoonCount: number;
  blockedCount: number;
  deadlineIso: string | null;
  lastActivityMs: number;
  lastActivityLabel: string;
  /** `null` quando o projeto não está "ativo" — saúde operacional só faz
   * sentido pra trabalho em andamento. */
  health: ProjectHealth | null;
  principal: ProjectPerson | null;
  participantes: ProjectPerson[];
};

export function computeProjectMetrics(
  project: Project,
  team: TeamMemberLite[] = loadTeamMembers(),
): ProjectMetrics {
  const tasks = project.tasks ?? [];
  const today = todayIsoInBrasilia();
  const { total, completed, pct: progressPct } = computeProgress(tasks);
  const openTasks = tasks.filter((t) => OPEN_STATUSES.has(t.status));
  const overdueCount = openTasks.filter((t) => isOverdue(t, today)).length;
  const dueSoonLimit = addDaysIso(today, DUE_SOON_DAYS);
  const dueSoonCount = openTasks.filter((t) => isDueSoon(t, today, dueSoonLimit)).length;
  const blockedCount = openTasks.filter((t) => !!t.blockedState).length;
  const deadlineIso = projectDeadlineIso(project);
  const lastActivityMs = projectLastActivityMs(project, tasks);
  const { principal, participantes } = deriveResponsibility(tasks, team);
  const status: ProjectStatus = project.status ?? "ativo";
  const health =
    status === "ativo"
      ? computeHealth({
          openCount: openTasks.length,
          overdueCount,
          blockedCount,
          deadlineIso,
          lastActivityMs,
          today,
        })
      : null;

  return {
    total,
    completed,
    progressPct,
    openCount: openTasks.length,
    overdueCount,
    dueSoonCount,
    blockedCount,
    deadlineIso,
    lastActivityMs,
    lastActivityLabel:
      lastActivityMs > 0
        ? timeAgo(new Date(lastActivityMs).toISOString())
        : "Sem atividade recente",
    health,
    principal,
    participantes,
  };
}

/* ============================================================
 * Filtros e ordenação — mesma forma de `ClienteFiltersState`/
 * `CampanhaFiltersState`.
 * ============================================================ */

export type ProjectStatusFilter =
  | "todos"
  | "ativo"
  | "em_risco"
  | "pausado"
  | "concluido"
  | "arquivado";

export const PROJECT_STATUS_FILTER_LABEL: Record<ProjectStatusFilter, string> = {
  todos: "Todos",
  ativo: "Ativos",
  em_risco: "Em risco",
  pausado: "Pausados",
  concluido: "Concluídos",
  arquivado: "Arquivados",
};

export type ProjectSortKey =
  | "atualizados"
  | "criados"
  | "nome"
  | "atrasadas"
  | "prazo"
  | "progresso_desc"
  | "progresso_asc";

export const PROJECT_SORT_LABEL: Record<ProjectSortKey, string> = {
  atualizados: "Atualizados recentemente",
  criados: "Criados recentemente",
  nome: "Nome (A–Z)",
  atrasadas: "Mais tarefas atrasadas",
  prazo: "Prazo mais próximo",
  progresso_desc: "Maior progresso",
  progresso_asc: "Menor progresso",
};

export type ProjectFiltersState = {
  status: ProjectStatusFilter;
  responsavel: string | "todos";
  feature: FeatureKey | "todas";
  sort: ProjectSortKey;
};

export const DEFAULT_PROJECT_FILTERS: ProjectFiltersState = {
  status: "todos",
  responsavel: "todos",
  feature: "todas",
  sort: "atualizados",
};

export function countActiveProjectFilters(f: ProjectFiltersState): number {
  let n = 0;
  if (f.status !== "todos") n += 1;
  if (f.responsavel !== "todos") n += 1;
  if (f.feature !== "todas") n += 1;
  return n;
}

function matchesSearch(p: Project, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
}

export function filterProjects(
  projects: Project[],
  metricsById: Map<string, ProjectMetrics>,
  query: string,
  filters: ProjectFiltersState,
): Project[] {
  return projects.filter((p) => {
    if (!matchesSearch(p, query)) return false;
    const status: ProjectStatus = p.status ?? "ativo";
    const metrics = metricsById.get(p.id);
    if (filters.status === "em_risco") {
      if (metrics?.health !== "em_risco") return false;
    } else if (filters.status !== "todos" && status !== filters.status) {
      return false;
    }
    if (filters.feature !== "todas" && !p.features?.includes(filters.feature)) return false;
    if (filters.responsavel !== "todos") {
      const nomes = [
        metrics?.principal?.name,
        ...(metrics?.participantes.map((x) => x.name) ?? []),
      ].filter((n): n is string => !!n);
      if (!nomes.includes(filters.responsavel)) return false;
    }
    return true;
  });
}

export function sortProjects(
  projects: Project[],
  metricsById: Map<string, ProjectMetrics>,
  sort: ProjectSortKey,
): Project[] {
  const sorted = [...projects];
  const metricsOf = (p: Project) => metricsById.get(p.id);
  switch (sort) {
    case "nome":
      sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      break;
    case "criados":
      sorted.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case "atrasadas":
      sorted.sort((a, b) => (metricsOf(b)?.overdueCount ?? 0) - (metricsOf(a)?.overdueCount ?? 0));
      break;
    case "prazo":
      sorted.sort((a, b) => {
        const da = metricsOf(a)?.deadlineIso;
        const db = metricsOf(b)?.deadlineIso;
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.localeCompare(db);
      });
      break;
    case "progresso_desc":
      sorted.sort((a, b) => (metricsOf(b)?.progressPct ?? -1) - (metricsOf(a)?.progressPct ?? -1));
      break;
    case "progresso_asc":
      sorted.sort(
        (a, b) => (metricsOf(a)?.progressPct ?? 101) - (metricsOf(b)?.progressPct ?? 101),
      );
      break;
    case "atualizados":
    default:
      sorted.sort(
        (a, b) => (metricsOf(b)?.lastActivityMs ?? 0) - (metricsOf(a)?.lastActivityMs ?? 0),
      );
      break;
  }
  return sorted;
}

/** Quais ações rápidas de status mostrar no menu de três pontos. */
export function statusMenuActions(status: ProjectStatus): {
  canPause: boolean;
  canReactivate: boolean;
  canArchive: boolean;
} {
  return {
    canPause: status === "ativo",
    canReactivate: status !== "ativo",
    canArchive: status !== "arquivado",
  };
}
