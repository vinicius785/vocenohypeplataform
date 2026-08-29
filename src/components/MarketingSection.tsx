import { useEffect, useMemo, useState } from "react";
import { SectionHeader } from "./SectionHeader";
import { TaskBoard, type Task as BoardTask, type TaskStatus } from "./tasks/TaskBoard";
import {
  loadRequests,
  onRequestsChange,
  removeRequest,
  projetoStatusToColumn,
  campanhaStatusToColumn,
  columnToProjetoStatus,
  columnToCampanhaStatus,
  loadStandalone,
  createStandalone,
  updateStandalone,
  removeStandalone,
  onStandaloneChange,
  type MktRequest,
  type MktStandalone,
} from "@/lib/marketing-tasks";
import { loadProjetos, onProjetosChange } from "@/lib/projetos";
import {
  loadCampanhaTarefas,
  saveCampanhaTarefas,
  onCampanhaTarefasChange,
} from "@/lib/campanha-scoped-store";
import { loadProjetoTarefas, saveProjetoTarefas } from "@/lib/projeto-scoped-store";

type RefMeta = { kind: "ref"; req: MktRequest } | { kind: "standalone"; id: string };

function resolveTasks(
  reqs: MktRequest[],
  standalones: MktStandalone[],
): { tasks: BoardTask[]; meta: Map<string, RefMeta> } {
  const projetos = loadProjetos();
  const tasks: BoardTask[] = [];
  const meta = new Map<string, RefMeta>();

  for (const r of reqs) {
    if (r.sourceKind === "projeto") {
      const p = projetos.find((x) => x.id === r.sourceId);
      const t = p?.tasks.find((x) => x.id === r.taskId);
      if (!p || !t) continue;
      const id = `ref:${r.id}`;
      // Carrega a tarefa inteira (não só um subconjunto de campos) — um
      // recorte manual aqui derrubava assignees/tags/subtasks/comentários/
      // timer sempre que a tarefa era editada a partir do board do
      // Marketing. `Task` existe duplicado em projetos.ts (mesmo formato,
      // `priority`/`createdAt` só que opcionais lá) — daí o cast: os dados
      // são compatíveis, só a assinatura diverge.
      tasks.push({
        ...(t as unknown as BoardTask),
        id,
        status: projetoStatusToColumn(t.status) as TaskStatus,
        priority: t.priority ?? "Normal",
        createdAt: t.createdAt ?? new Date().toISOString(),
      });
      meta.set(id, { kind: "ref", req: r });
    } else {
      const list = loadCampanhaTarefas(r.sourceId);
      const t = list.find((x) => x.id === r.taskId);
      if (!t) continue;
      const id = `ref:${r.id}`;
      tasks.push({
        ...t,
        id,
        status: campanhaStatusToColumn(String(t.status)) as TaskStatus,
      });
      meta.set(id, { kind: "ref", req: r });
    }
  }

  for (const s of standalones) {
    const id = `mkt:${s.id}`;
    tasks.push({
      id,
      title: s.title,
      status: s.status as TaskStatus,
      priority: "Normal",
      dueDate: s.dueDate,
      assignee: s.assignee,
      assignees: s.assignees,
      primaryAssignee: s.primaryAssignee,
      description: s.note,
      createdAt: s.createdAt,
      timerRunning: s.timerRunning,
      timerStartedAt: s.timerStartedAt,
      timeEntries: s.timeEntries,
      activity: s.activity,
      // Sem isso, uma tarefa avulsa do Marketing perdia o histórico de
      // prazo/performance ao ser aberta a partir deste board — lacuna
      // pré-existente da rodada anterior, corrigida aqui já que estes
      // mesmos 3 pontos estão sendo tocados pra `primaryAssignee`.
      completedAt: s.completedAt,
      originalDueDate: s.originalDueDate,
      performanceDueDate: s.performanceDueDate,
      deadlineHistory: s.deadlineHistory,
    });
    meta.set(id, { kind: "standalone", id: s.id });
  }

  return { tasks, meta };
}

/** Grava a tarefa inteira de volta na origem (projeto_tarefas/
 * campanha_tarefas, per-row) — precisa ser o objeto completo, não só o
 * status: o board do Marketing é a única tela usada pra editar essas
 * tarefas quando "puxadas" pra cá, então título/prioridade/prazo/
 * responsáveis/descrição editados aqui também precisam persistir na
 * origem, não só a coluna. Reescreve só a linha alterada (nunca a lista
 * inteira de projetos) pelo mesmo motivo de sempre: evitar que duas
 * abas/pessoas editando tarefas diferentes quase ao mesmo tempo
 * sobrescrevam uma à outra. */
function updateRef(req: MktRequest, patch: BoardTask) {
  if (req.sourceKind === "projeto") {
    const list = loadProjetoTarefas(req.sourceId);
    const next = list.map((t) =>
      t.id === req.taskId
        ? { ...patch, id: req.taskId, status: columnToProjetoStatus(patch.status) }
        : t,
    );
    saveProjetoTarefas(req.sourceId, next);
  } else {
    const list = loadCampanhaTarefas(req.sourceId);
    const next = list.map((t) =>
      t.id === req.taskId
        ? {
            ...patch,
            id: req.taskId,
            status: columnToCampanhaStatus(patch.status) as BoardTask["status"],
          }
        : t,
    );
    saveCampanhaTarefas(req.sourceId, next);
  }
}

export function MarketingSection({
  initialOpenTaskId,
  onInitialOpenTaskHandled,
}: {
  /** Deep-link vindo de "Meu trabalho" (Início) ou do indicador de timer
   * ativo — mesmo search param `taskId` que `/projeto/$id` já usa pra
   * projetos normais, só que aqui o id já vem prefixado (`ref:`/`mkt:`,
   * ver `resolveTasks` acima) porque o board do Marketing mistura
   * tarefas de fontes diferentes sob um id "achatado" só dele. */
  initialOpenTaskId?: string;
  onInitialOpenTaskHandled?: () => void;
} = {}) {
  const [reqs, setReqs] = useState<MktRequest[]>(() => loadRequests());
  const [standalones, setStandalones] = useState<MktStandalone[]>(() => loadStandalone());
  const [tick, setTick] = useState(0);

  useEffect(
    () =>
      onRequestsChange(() => {
        setReqs(loadRequests());
        setStandalones(loadStandalone());
        setTick((t) => t + 1);
      }),
    [],
  );
  useEffect(() => onCampanhaTarefasChange(() => setTick((t) => t + 1)), []);
  // Sem isso, uma tarefa de PROJETO solicitada pro Marketing (`sourceKind:
  // "projeto"`) nunca atualizava aqui quando editada/criada na tela do
  // Projeto — só as mudanças de tarefas de Campanha disparavam refresh
  // (linha acima), dando a impressão de que a solicitação "não espelhava".
  useEffect(() => onProjetosChange(() => setTick((t) => t + 1)), []);
  // Tarefas "avulsas" do Marketing (não vinculadas a projeto/campanha) vivem
  // só no localStorage (`marketing-tasks.ts`), sem sincronização em tempo
  // real como as outras — sem esse listener, criar/editar/excluir uma
  // salvava certinho, mas a tela só refletia depois de um F5 (parecia que
  // "não criava").
  useEffect(
    () =>
      onStandaloneChange(() => {
        setStandalones(loadStandalone());
        setTick((t) => t + 1);
      }),
    [],
  );

  const { tasks, meta } = useMemo(() => resolveTasks(reqs, standalones), [reqs, standalones, tick]);

  const onChange = (next: BoardTask[]) => {
    // Compute diff based on meta map.
    const prevIds = new Set(tasks.map((t) => t.id));
    const nextIds = new Set(next.map((t) => t.id));

    // Removed tasks
    for (const id of prevIds) {
      if (!nextIds.has(id)) {
        const m = meta.get(id);
        if (!m) continue;
        if (m.kind === "ref") removeRequest(m.req.sourceKind, m.req.sourceId, m.req.taskId);
        else removeStandalone(m.id);
      }
    }

    // Updated / created
    for (const t of next) {
      const m = meta.get(t.id);
      if (!m) {
        // New standalone task created in Marketing
        createStandalone({
          title: t.title,
          status: t.status,
          assignee: t.assignee,
          assignees: t.assignees,
          primaryAssignee: t.primaryAssignee,
          dueDate: t.dueDate,
          note: t.description,
          activity: t.activity,
        });
        continue;
      }
      if (m.kind === "ref") {
        updateRef(m.req, t);
      } else {
        updateStandalone(m.id, {
          title: t.title,
          status: t.status,
          assignee: t.assignee,
          assignees: t.assignees,
          primaryAssignee: t.primaryAssignee,
          dueDate: t.dueDate,
          note: t.description,
          timerRunning: t.timerRunning,
          timerStartedAt: t.timerStartedAt,
          timeEntries: t.timeEntries,
          activity: t.activity,
          // Mesma correção da leitura (`resolveTasks` acima) — sem isso o
          // histórico de prazo/performance era descartado a cada save
          // feito a partir do board do Marketing.
          completedAt: t.completedAt,
          originalDueDate: t.originalDueDate,
          performanceDueDate: t.performanceDueDate,
          deadlineHistory: t.deadlineHistory,
        });
      }
    }

    setTick((x) => x + 1);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Marketing"
        subtitle="Kanban compartilhado do time de marketing. Crie tarefas aqui ou puxe de projetos e campanhas."
      />
      <TaskBoard
        tasks={tasks}
        onChange={onChange}
        scope={{ kind: "marketing" }}
        breadcrumb="Marketing"
        title="Tarefas do Marketing"
        initialOpenTaskId={initialOpenTaskId}
        onInitialOpenTaskHandled={onInitialOpenTaskHandled}
      />
    </div>
  );
}
