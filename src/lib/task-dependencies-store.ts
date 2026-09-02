import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TaskDependency = {
  id: string;
  blockingTaskId: string;
  blockedTaskId: string;
  createdBy?: string;
  createdAt: string;
};

type Row = {
  id: string;
  blocking_task_id: string;
  blocked_task_id: string;
  created_by: string | null;
  created_at: string;
};

function fromRow(r: Row): TaskDependency {
  return {
    id: r.id,
    blockingTaskId: r.blocking_task_id,
    blockedTaskId: r.blocked_task_id,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
  };
}

let cache: TaskDependency[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function init(): Promise<void> {
  if (loaded) return;
  try {
    const { data, error } = await supabase.from("task_dependencies").select("*");
    if (error) throw error;
    cache = (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    console.warn("[task_dependencies] initial load failed", e);
  } finally {
    loaded = true;
    emit();
  }
}

let channel: ReturnType<typeof supabase.channel> | null = null;
function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel(`rt-task_dependencies-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "task_dependencies" },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as { id?: string } | null;
          if (!old?.id) return;
          cache = cache.filter((x) => x.id !== old.id);
        } else {
          const row = payload.new as Row | null;
          if (!row) return;
          const item = fromRow(row);
          const idx = cache.findIndex((x) => x.id === item.id);
          cache = idx >= 0 ? cache.map((x, i) => (i === idx ? item : x)) : [...cache, item];
        }
        emit();
      },
    )
    .subscribe();
}

export function initTaskDependenciesSync(): Promise<void> {
  const p = init();
  subscribeRealtime();
  return p;
}

export function useTaskDependencies(): TaskDependency[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cache,
    () => cache,
  );
}

/** Ids das duas pontas da relação, vistos a partir de `taskId`. */
export function dependenciesOf(
  taskId: string,
  all: TaskDependency[],
): { dependsOn: string[]; blocks: string[] } {
  const dependsOn: string[] = [];
  const blocks: string[] = [];
  for (const d of all) {
    if (d.blockedTaskId === taskId) dependsOn.push(d.blockingTaskId);
    if (d.blockingTaskId === taskId) blocks.push(d.blockedTaskId);
  }
  return { dependsOn, blocks };
}

/** Adicionar a aresta blockingId→blockedId (blockedId passa a depender de
 * blockingId) cria um ciclo sse `blockingId` já é alcançável a partir de
 * `blockedId` no grafo atual — nesse caso já existe um caminho
 * blockedId → ... → blockingId, e a nova aresta fecharia o círculo. */
export function wouldCreateCycle(
  blockingId: string,
  blockedId: string,
  all: TaskDependency[],
): boolean {
  if (blockingId === blockedId) return true;
  const forward = new Map<string, string[]>();
  for (const d of all) {
    const list = forward.get(d.blockingTaskId) ?? [];
    list.push(d.blockedTaskId);
    forward.set(d.blockingTaskId, list);
  }
  const visited = new Set<string>();
  const queue = [blockedId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === blockingId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of forward.get(current) ?? []) queue.push(next);
  }
  return false;
}

/** Cria a dependência, validando duplicidade e ciclo ANTES de gravar —
 * evita round-trip pra descobrir que o banco rejeitou (a constraint
 * `task_dependencies_unique` cobre duplicidade, mas não ciclo). */
export async function createDependency(
  blockingId: string,
  blockedId: string,
): Promise<{ error?: string }> {
  const already = cache.some(
    (d) => d.blockingTaskId === blockingId && d.blockedTaskId === blockedId,
  );
  if (already) return { error: "Essa dependência já existe." };
  if (wouldCreateCycle(blockingId, blockedId, cache)) {
    return { error: "Essa dependência criaria um ciclo entre tarefas." };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("task_dependencies").insert({
    blocking_task_id: blockingId,
    blocked_task_id: blockedId,
    created_by: user?.id,
  });
  if (error) return { error: "Não foi possível salvar a dependência." };
  return {};
}

export async function removeDependency(id: string): Promise<void> {
  await supabase.from("task_dependencies").delete().eq("id", id);
}

/** Chamado ao excluir uma tarefa — remove qualquer relação em que ela
 * apareça em qualquer ponta, pra não deixar referência órfã em
 * `task_dependencies` (não há FK real, ver migration). */
export async function cleanupDependenciesForTask(taskId: string): Promise<void> {
  await supabase
    .from("task_dependencies")
    .delete()
    .or(`blocking_task_id.eq.${taskId},blocked_task_id.eq.${taskId}`);
}
