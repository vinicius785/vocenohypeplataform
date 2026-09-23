import type { Task } from "@/components/tasks/TaskBoard";
// `getTaskAssignees` importado de `projetos.ts` (não de `TaskBoard.tsx`)
// só pra evitar import circular — `TaskBoard.tsx` importa o tipo
// `ProjetoFase` deste arquivo. As duas versões são estruturalmente
// idênticas (mesmo `Pick<Task, "assignee" | "assignees">`), então tanto
// faz de qual arquivo vem pra este uso.
import { getTaskAssignees } from "./projetos";
import { OPEN_STATUSES } from "./score";
import { todayIsoInBrasilia } from "./timezone";

export type FaseStatus =
  | "nao_iniciada"
  | "em_andamento"
  | "em_risco"
  | "atrasada"
  | "pausada"
  | "concluida";

export const FASE_STATUS_LABEL: Record<FaseStatus, string> = {
  nao_iniciada: "Planejada",
  em_andamento: "Em andamento",
  em_risco: "Em risco",
  atrasada: "Atrasada",
  pausada: "Pausada",
  concluida: "Concluída",
};

/** Tom visual por status — mesma linguagem de `TASK_STATUS_TONE`
 * (`task-status.ts`): cor + texto, nunca só cor (a label já acompanha em
 * todo lugar que usa isto). */
export const FASE_STATUS_TONE: Record<FaseStatus, string> = {
  nao_iniciada: "bg-muted text-muted-foreground",
  em_andamento: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  em_risco: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  atrasada: "bg-destructive/10 text-destructive",
  pausada: "bg-muted text-muted-foreground",
  concluida: "bg-foreground text-background",
};

/** Cor sólida do ponto na linha do tempo — nunca usada pra pintar o
 * card inteiro (item 3 do pedido), só o marcador de posição. */
export const FASE_DOT_CLASS: Record<FaseStatus, string> = {
  nao_iniciada: "bg-muted-foreground/30",
  em_andamento: "bg-brand",
  em_risco: "bg-warning",
  atrasada: "bg-danger",
  pausada: "bg-muted-foreground/30",
  concluida: "bg-success",
};

/** Uma fase do roadmap de um projeto — vive na tabela `projeto_fases`
 * (jsonb por linha, escopada por `projeto_id`), mesmo padrão de
 * `projeto_tarefas`. Tarefas se vinculam por `Task.roadmapPhaseId`
 * apontando pra `ProjetoFase.id` — nunca o contrário (a fase não guarda
 * lista de ids de tarefa, pra nunca dessincronizar; quem quer "tarefas
 * desta fase" filtra as tarefas do projeto por `roadmapPhaseId`). */
export type ProjetoFase = {
  id: string;
  nome: string;
  descricao?: string;
  dataInicio: string; // ISO yyyy-mm-dd
  dataFim: string;
  /** Status MANUAL (escolhido por quem edita a fase). Nunca é
   * sobrescrito pelo cálculo automático — `faseStatusEfetivo` só usa
   * "em_risco"/"atrasada" automáticos quando o status manual ainda é
   * "nao_iniciada"/"em_andamento" (uma fase marcada como concluída ou
   * em_risco manualmente por quem edita nunca é revertida por um
   * cálculo). */
  status: FaseStatus;
  responsavelPrincipal?: string; // nome do membro, mesmo padrão de Task.assignee
  /** Outros membros envolvidos na fase, além do responsável principal —
   * aditivo (fases antigas não têm isso, tratado como lista vazia). Só
   * complementa os responsáveis já derivados das tarefas vinculadas
   * (`faseResponsaveis`), nunca substitui. */
  participantes?: string[];
  /** Marca manual de "esta é a fase atual", prioridade 1 de `faseAtual`.
   * Aditivo — fases antigas não têm isso. Só uma fase deveria estar
   * marcada por vez; se mais de uma estiver (edição concorrente), a
   * primeira em `sortOrder` vence, nunca é um erro. */
  manualCurrent?: boolean;
  cor: string; // mesmo formato de valor usado em TASK_TAG_COLORS
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type FaseTaskCounts = {
  total: number;
  concluidas: number;
  emAndamento: number;
  atrasadas: number;
  bloqueadas: number;
};

function tasksDaFase(faseId: string, tasks: Task[]): Task[] {
  return tasks.filter((t) => t.roadmapPhaseId === faseId);
}

/** Tarefas do projeto sem nenhuma fase vinculada — inclui tarefas cujo
 * `roadmapPhaseId` aponta pra uma fase que já foi excluída (nunca ficam
 * "perdidas": excluir fase só desvincula, tratado aqui como "sem
 * fase"). */
export function tarefasSemFase(tasks: Task[], fases: ProjetoFase[]): Task[] {
  const idsValidos = new Set(fases.map((f) => f.id));
  return tasks.filter((t) => !t.roadmapPhaseId || !idsValidos.has(t.roadmapPhaseId));
}

/** Contagens por fase — reaproveita `OPEN_STATUSES` (score.ts, a MESMA
 * fonte de verdade que o Kanban/Score Operacional já usam pra "tarefa
 * aberta") em vez de inventar uma segunda regra de status. */
export function faseTaskCounts(fase: Pick<ProjetoFase, "id">, tasks: Task[]): FaseTaskCounts {
  // "Arquivado" não é "tarefa válida da fase" (item 7 do pedido) — fica
  // de fora do `total` também, não só dos outros baldes. Antes só ficava
  // de fora de `concluidas`/`emAndamento`/`atrasadas`, mas continuava
  // inflando `total` (o comentário dizia "não conta em nenhum balde",
  // só não era verdade pra este) — inflava o denominador do progresso
  // sem motivo (achado real ao escrever os testes desta rodada).
  const validas = tasksDaFase(fase.id, tasks).filter((t) => t.status !== "Arquivado");
  const today = todayIsoInBrasilia();
  let concluidas = 0;
  let emAndamento = 0;
  let atrasadas = 0;
  const bloqueadas = 0; // sem um status "bloqueada" hoje na plataforma — reservado pro futuro, nunca inventado
  for (const t of validas) {
    if (t.status === "Concluído") {
      concluidas++;
      continue;
    }
    if (!OPEN_STATUSES.has(t.status)) continue;
    if (t.dueDate && t.dueDate < today) atrasadas++;
    else emAndamento++;
  }
  return { total: validas.length, concluidas, emAndamento, atrasadas, bloqueadas };
}

/** `null` quando a fase não tem nenhuma tarefa vinculada — quem
 * renderiza deve mostrar "Nenhuma tarefa vinculada", nunca "0%" (uma
 * fase sem tarefa não é uma fase atrasada/fracassada, é só vazia). */
export function faseProgresso(fase: Pick<ProjetoFase, "id">, tasks: Task[]): number | null {
  const { total, concluidas } = faseTaskCounts(fase, tasks);
  if (total === 0) return null;
  return Math.round((concluidas / total) * 100);
}

/** Responsáveis envolvidos na fase — todo `assignee`/`assignees` de
 * toda tarefa vinculada, sem duplicar nomes (mesma regra de crédito
 * integral por responsável já usada em `score.ts`/`getTaskAssignees` —
 * não divide, só não repete o mesmo nome duas vezes aqui). */
export function faseResponsaveis(fase: Pick<ProjetoFase, "id">, tasks: Task[]): string[] {
  const nomes = new Set<string>();
  for (const t of tasksDaFase(fase.id, tasks)) {
    for (const nome of getTaskAssignees(t)) nomes.add(nome);
  }
  return Array.from(nomes);
}

/** Status efetivo pra EXIBIÇÃO — combina o status manual com os sinais
 * automáticos de atraso/risco baseados em data + tarefas pendentes
 * (item 7 do pedido). Uma fase marcada manualmente como "concluida"
 * nunca é rebaixada por este cálculo. Fases sem tarefa vinculada também
 * nunca ficam "atrasada" automaticamente (nada pra atrasar). */
export function faseStatusEfetivo(fase: ProjetoFase, tasks: Task[]): FaseStatus {
  if (fase.status === "concluida" || fase.status === "pausada") return fase.status;
  const { total, concluidas } = faseTaskCounts(fase, tasks);
  const today = todayIsoInBrasilia();
  const prazoVencido = !!fase.dataFim && fase.dataFim < today;
  const pendencias = total - concluidas;

  if (prazoVencido && pendencias > 0) return "atrasada";

  if (!prazoVencido && total > 0 && fase.dataFim) {
    // "Em risco": faltam ≤ 7 dias pro fim da fase e o progresso ainda
    // está abaixo de 60% — limiares nomeados aqui, nunca soltos no JSX.
    const diasRestantes = diasEntre(today, fase.dataFim);
    const progresso = (concluidas / total) * 100;
    if (diasRestantes <= RISCO_DIAS_RESTANTES && progresso < RISCO_PROGRESSO_MINIMO) {
      return "em_risco";
    }
  }

  if (fase.status === "em_risco" || fase.status === "atrasada") return fase.status;
  return total > 0 ? "em_andamento" : fase.status;
}

const RISCO_DIAS_RESTANTES = 7;
const RISCO_PROGRESSO_MINIMO = 60;

function diasEntre(isoA: string, isoB: string): number {
  const a = new Date(`${isoA}T00:00:00`).getTime();
  const b = new Date(`${isoB}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** ID de DOM de cada fase na linha do tempo — usado como âncora pra
 * rolar/destacar a fase a partir de um link externo (ex.: alerta do
 * cabeçalho do projeto). Aplicado em cada card de `PhaseTimeline.tsx`. */
export function faseDomId(faseId: string): string {
  return `roadmap-fase-${faseId}`;
}

/** Fase "atual" — regra centralizada e previsível (item 6 do pedido),
 * em ordem de prioridade:
 *   1. fase marcada manualmente como atual (`manualCurrent`);
 *   2. fase "em andamento" (status manual) cujo período contém hoje;
 *   3. primeira fase não concluída/pausada, na ordem do roadmap
 *      (`sortOrder`) — mesmo fallback de sempre.
 * Nunca mais de uma fase é retornada como atual; se mais de uma
 * qualificar num nível, a de menor `sortOrder` vence. `null` quando
 * nenhuma fase se enquadra (todas concluídas/pausadas, ou nenhuma
 * fase existe) — quem renderiza deve mostrar um estado neutro
 * explícito ("Nenhuma fase em andamento"), nunca inventar uma. */
export function faseAtual(fases: ProjetoFase[], tasks: Task[]): ProjetoFase | null {
  const ordenadas = [...fases].sort((a, b) => a.sortOrder - b.sortOrder);

  const marcadaManualmente = ordenadas.find((f) => f.manualCurrent);
  if (marcadaManualmente) return marcadaManualmente;

  const today = todayIsoInBrasilia();
  const emAndamentoNoPeriodo = ordenadas.find(
    (f) => f.status === "em_andamento" && f.dataInicio <= today && today <= f.dataFim,
  );
  if (emAndamentoNoPeriodo) return emAndamentoNoPeriodo;

  return (
    ordenadas.find((f) => {
      const s = faseStatusEfetivo(f, tasks);
      return s !== "concluida" && s !== "pausada";
    }) ?? null
  );
}

/** Progresso agregado do Roadmap inteiro — soma de tarefas válidas
 * vinculadas a QUALQUER fase, dividida pelo total, nunca a média das
 * porcentagens de cada fase (item 7 do pedido: uma fase de 2 tarefas
 * 100% concluída não pode pesar igual a uma de 20 tarefas 10%
 * concluída). Tarefas sem fase nunca entram aqui — ver `tarefasSemFase`.
 * `null` quando nenhuma tarefa está vinculada a nenhuma fase. */
export function roadmapProgressoGeral(
  fases: ProjetoFase[],
  tasks: Task[],
): { total: number; concluidas: number; pct: number | null } {
  let total = 0;
  let concluidas = 0;
  for (const fase of fases) {
    const counts = faseTaskCounts(fase, tasks);
    total += counts.total;
    concluidas += counts.concluidas;
  }
  return { total, concluidas, pct: total === 0 ? null : Math.round((concluidas / total) * 100) };
}

/** `true` quando uma fase foi marcada manualmente como "concluida" mas
 * ainda tem tarefas pendentes vinculadas — inconsistência real que quem
 * edita a fase deveria resolver, não escondida (item 7, último tópico:
 * "aviso administrativo"). Nunca força um status diferente sozinho. */
export function faseConcluidaComPendencias(fase: ProjetoFase, tasks: Task[]): boolean {
  if (fase.status !== "concluida") return false;
  const { total, concluidas } = faseTaskCounts(fase, tasks);
  return total - concluidas > 0;
}
