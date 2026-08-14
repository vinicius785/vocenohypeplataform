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
      tasks.push({
        id,
        title: t.title,
        status: projetoStatusToColumn(t.status) as TaskStatus,
        priority: (t.priority ?? "Normal") as BoardTask["priority"],
        dueDate: t.dueDate,
        assignee: t.assignee,
        description: t.description,
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
      description: s.note,
      createdAt: s.createdAt,
    });
    meta.set(id, { kind: "standalone", id: s.id });
  }

  return { tasks, meta };
}

function moveRef(req: MktRequest, col: TaskStatus) {
  if (req.sourceKind === "projeto") {
    // Grava só a tarefa alterada (projeto_tarefas, per-row) — nunca a lista
    // inteira de projetos. Reescrever todos os projetos aqui (como era
    // antes) corria o risco de sobrescrever, com dados desatualizados,
    // qualquer edição concorrente feita por outra aba/pessoa entre o
    // `loadProjetos()` e este save.
    const list = loadProjetoTarefas(req.sourceId);
    const next = list.map((t) =>
      t.id === req.taskId ? { ...t, status: columnToProjetoStatus(col) } : t,
    );
    saveProjetoTarefas(req.sourceId, next);
  } else {
    const list = loadCampanhaTarefas(req.sourceId);
    const next = list.map((t) =>
      t.id === req.taskId
        ? { ...t, status: columnToCampanhaStatus(col) as BoardTask["status"] }
        : t,
    );
    saveCampanhaTarefas(req.sourceId, next);
  }
}

export function MarketingSection() {
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
          dueDate: t.dueDate,
          note: t.description,
        });
        continue;
      }
      if (m.kind === "ref") {
        const prev = tasks.find((x) => x.id === t.id);
        if (prev && prev.status !== t.status) moveRef(m.req, t.status);
      } else {
        updateStandalone(m.id, {
          title: t.title,
          status: t.status,
          assignee: t.assignee,
          dueDate: t.dueDate,
          note: t.description,
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
      />
    </div>
  );
}
