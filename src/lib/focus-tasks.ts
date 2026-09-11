import { useEffect, useMemo, useState } from "react";
import { useClientes } from "@/lib/clientes-store";
import { getMe } from "@/lib/chat-store";
import { loadAllTasksFlat, type DashTaskFlat } from "@/lib/task-aggregation";
import { onProjetosChange } from "@/lib/projetos";
import { onCampanhaTarefasChange } from "@/lib/campanha-scoped-store";
import { onStandaloneChange } from "@/lib/marketing-tasks";
import { findTaskContext } from "@/lib/task-directory";
import { withStatusChange } from "@/components/tasks/TaskBoard";
import { usePerformanceSettings } from "@/lib/performance-events-store";
import { pushTaskModal } from "@/lib/task-modal-stack";
import type { FocusSelectedTask, FocusTaskOrigin } from "@/lib/focus-mode-store";

/** Origem da tarefa a partir do `DashTaskFlat` — mesma convenção de
 * `task-directory.ts`/`findTaskContext`: `campanhaId` presente = campanha,
 * `id` prefixado `mkt:` = Marketing avulsa, senão projeto. Reaproveitado
 * (não reimplementado) pra resolver qual store atualizar ao concluir. */
function originOf(t: DashTaskFlat): FocusTaskOrigin {
  if (t.campanhaId) return "campanha";
  if (t.id.startsWith("mkt:")) return "marketing";
  return "projeto";
}

export type FocusTaskFilter = "hoje" | "atrasadas" | "semana" | "pessoais" | "todas";

export type FocusTaskItem = DashTaskFlat & { rawId: string; origin: FocusTaskOrigin };

/** Tarefas reais atribuídas ao usuário autenticado, consolidadas pela
 * MESMA camada compartilhada que "Meu trabalho" do Início já usa
 * (`loadAllTasksFlat`, `task-aggregation.ts`) — nenhuma tarefa nova é
 * inventada aqui, só filtrada/rotulada pro Modo Foco (item 5 e 18: não
 * duplicar regra de negócio). Exclui concluídas/arquivadas (item 5:
 * "não incluir tarefas concluídas entre as opções principais") e
 * subtarefas sem tarefa-mãe própria não recebem entrada separada (mesma
 * regra de `loadAllTasksFlat`, que já achata por nó — subtarefas
 * aparecem como itens próprios, igual ao board). */
export function useFocusTasks(): {
  tasks: FocusTaskItem[];
  loading: boolean;
} {
  const clientes = useClientes();
  const { settings: performanceSettings } = usePerformanceSettings();
  const [, forceReload] = useState(0);

  useEffect(() => onProjetosChange(() => forceReload((n) => n + 1)), []);
  useEffect(() => onCampanhaTarefasChange(() => forceReload((n) => n + 1)), []);
  useEffect(() => onStandaloneChange(() => forceReload((n) => n + 1)), []);

  const campanhaNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clientes) {
      for (const camp of c.campanhas ?? []) map.set(camp.id, camp.nome);
    }
    return map;
  }, [clientes]);

  const tasks = useMemo(() => {
    const myName = getMe().name;
    const all = loadAllTasksFlat(campanhaNameMap, performanceSettings.deadlineCutoffHour);
    return all
      .filter((t) => t.status !== "Concluído" && t.status !== "Arquivado")
      .filter((t) => t.assignees.includes(myName))
      .map((t) => ({
        ...t,
        rawId: t.id.replace(/^mkt:/, ""),
        origin: originOf(t),
      }));
  }, [campanhaNameMap, performanceSettings.deadlineCutoffHour]);

  return { tasks, loading: false };
}

export function filterFocusTasks(
  tasks: FocusTaskItem[],
  filter: FocusTaskFilter,
  search: string,
): FocusTaskItem[] {
  let out = tasks;
  if (filter === "hoje") out = out.filter((t) => t.bucket === "hoje");
  else if (filter === "atrasadas") out = out.filter((t) => t.bucket === "atrasada");
  else if (filter === "semana")
    out = out.filter((t) => t.bucket === "hoje" || t.bucket === "amanha" || t.bucket === "semana");
  // "Pessoais" = tarefas avulsas do Marketing (não vinculadas a um
  // projeto de cliente nem a uma campanha) — a única noção de "tarefa
  // pessoal" que o modelo de dados atual sustenta sem inventar um campo
  // novo (Project/Task não têm um flag "pessoal").
  else if (filter === "pessoais") out = out.filter((t) => t.origin === "marketing");

  const q = search.trim().toLowerCase();
  if (q) out = out.filter((t) => t.title.toLowerCase().includes(q));

  return out;
}

export const FOCUS_TASK_FILTER_LABEL: Record<FocusTaskFilter, string> = {
  hoje: "Hoje",
  atrasadas: "Atrasadas",
  semana: "Próximos 7 dias",
  pessoais: "Pessoais",
  todas: "Todas",
};

export function taskCountLabel(n: number): string {
  return `${n} ${n === 1 ? "tarefa" : "tarefas"}`;
}

export function toFocusSelectedTask(t: FocusTaskItem): FocusSelectedTask {
  return { rawId: t.rawId, title: t.title, projectName: t.projectName, origin: t.origin };
}

/** Marca a tarefa como concluída na origem, reaproveitando exatamente
 * `findTaskContext` (resolve em qual dos 3 stores ela mora) e
 * `withStatusChange` (mesma função usada pelo drag-and-drop do Kanban —
 * cuida de status/`completedAt`/atividade/parar cronômetro). Item 18:
 * não duplica a regra, chama a mesma função pura já usada pelo board.
 *
 * Limitação assumida conscientemente: o crédito de XP/ledger de
 * performance e o replanejamento automático de tarefas recorrentes só
 * acontecem hoje dentro do fluxo de salvar do `TaskDialog` (que depende
 * de contexto adicional — lista de membros da equipe, configurações de
 * performance — não disponível de forma leve fora dele). Concluir pelo
 * Modo Foco atualiza status/data de conclusão/atividade normalmente
 * (idêntico ao Kanban), mas não emite esses efeitos colaterais; tarefas
 * recorrentes ou que dependam de pontuação devem ser concluídas pelo
 * diálogo da tarefa (acessível pelo botão "Ver detalhes" do próprio
 * Modo Foco) quando isso importar. */
export function completeFocusTask(rawId: string): boolean {
  const ctx = findTaskContext(rawId);
  if (!ctx) return false;
  ctx.save(withStatusChange(ctx.task, "Concluído"));
  return true;
}

export function openFocusTaskDetail(rawId: string): void {
  pushTaskModal(rawId);
}
