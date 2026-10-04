/**
 * Visibilidade da Demo no TIME (docs/decisions/0004-demo-operacional.md, Etapa 2).
 *
 * A Demo é um cliente real do banco, marcado em `clientes.data.demoSessionId` (marcador
 * imutável garantido por gatilho). Este módulo concentra, em funções PURAS, as regras de
 * "isto é demo?" usadas pelos stores e agregadores — para a Demo nunca aparecer em listas,
 * KPIs, tarefas globais, Banco de Influenciadores, notificações, financeiro etc., mas
 * continuar acessível pelo detalhe da campanha (aberto a partir do lead).
 *
 * Fonte única do conjunto de campanhas de demo: as `campanhas[]` dos clientes marcados. Assim
 * não há segunda consulta (nem janela de falha de rede): se o cliente chegou ao cache, o
 * conjunto já o conhece.
 */

type CampanhaRef = { id: string };

type MaybeDemoCliente = {
  demoSessionId?: unknown;
  campanhas?: ReadonlyArray<CampanhaRef> | undefined;
};

/** O cliente é uma demonstração? (marcador presente e não vazio) */
export function isDemoCliente(cliente: { demoSessionId?: unknown } | null | undefined): boolean {
  return typeof cliente?.demoSessionId === "string" && cliente.demoSessionId.length > 0;
}

export const NO_DEMO_IDS: ReadonlySet<string> = new Set<string>();

/** Ids das campanhas que pertencem a clientes de demonstração. */
export function demoCampanhaIdsOf(clientes: ReadonlyArray<MaybeDemoCliente>): ReadonlySet<string> {
  let ids: Set<string> | null = null;
  for (const c of clientes) {
    if (!isDemoCliente(c)) continue;
    for (const camp of c.campanhas ?? []) (ids ??= new Set()).add(camp.id);
  }
  return ids ?? NO_DEMO_IDS;
}

/** Assinatura estável do conjunto (para detectar mudança sem comparar referências). */
export function demoIdsKey(ids: ReadonlySet<string>): string {
  return [...ids].sort().join(",");
}

/**
 * Mapa `campanhaId → valor` sem as campanhas de demo. Sem nenhuma demo no mapa devolve o
 * PRÓPRIO mapa (mesma referência): o caminho comum fica idêntico ao de antes da Demo.
 */
export function withoutDemoCampanhas<V>(
  map: Map<string, V>,
  demoIds: ReadonlySet<string>,
): Map<string, V> {
  if (demoIds.size === 0) return map;
  let hasDemo = false;
  for (const id of demoIds) {
    if (map.has(id)) {
      hasDemo = true;
      break;
    }
  }
  if (!hasDemo) return map;
  const out = new Map<string, V>();
  for (const [id, value] of map) if (!demoIds.has(id)) out.set(id, value);
  return out;
}

type TaskLike = { id: string; subtasks?: ReadonlyArray<TaskLike> | undefined };

/** Ids (inclusive de subtarefas) das tarefas das campanhas de demo. */
export function demoTaskIdsOf(
  tarefasByCampanha: ReadonlyMap<string, ReadonlyArray<TaskLike>>,
  demoIds: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  const walk = (tasks: ReadonlyArray<TaskLike>) => {
    for (const t of tasks) {
      out.add(t.id);
      if (t.subtasks?.length) walk(t.subtasks);
    }
  };
  for (const id of demoIds) {
    const tasks = tarefasByCampanha.get(id);
    if (tasks) walk(tasks);
  }
  return out;
}
