import {
  loadProjetos,
  getTaskAssignees,
  type Task as ProjTask,
  type Project,
} from "@/lib/projetos";
import { getAllCampanhaTarefas } from "@/lib/campanha-scoped-store";
import { loadStandalone } from "@/lib/marketing-tasks";
import { deadlineCutoff } from "@/lib/performance-engine";
import { resolvedCompletionTimestamp } from "@/lib/score";

/** Nomes dos dias, compartilhado entre o cabeçalho do Início ("Segunda, 27
 * ago") e a formatação de prazo (`formatDue`) aqui embaixo — um só lugar
 * pra não desalinhar as duas datas se o formato mudar. */
export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export type DashTask = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  bucket: "hoje" | "amanha" | "semana" | "atrasada" | "outro";
  due: string;
  priority?: ProjTask["priority"];
  status: ProjTask["status"];
  /** Ausente = tarefa de projeto (rota própria); presente = tarefa de
   * campanha, que não tem rota própria e precisa do deep-link por
   * sessionStorage já usado pelo indicador de timer ativo. */
  campanhaId?: string;
  /** Presente = isso é uma subtarefa (título da tarefa-mãe direta, só pra
   * exibição). Subtarefas não têm dialog próprio pra abrir sozinhas — só
   * são editadas de dentro do dialog da tarefa de nível raiz, que é o que
   * `parentId` aponta (pode ser diferente de um `parentTitle` mais de um
   * nível acima, se houver subtarefa dentro de subtarefa). */
  parentTitle?: string;
  parentId?: string;
  /** Timestamp exato de conclusão (`resolvedCompletionTimestamp`,
   * `@/lib/score`) — só presente pra tarefas com `status === "Concluído"`.
   * Alimenta o drill-down de "Entregas por dia da semana" (aba Time). */
  completedAt?: string;
};

/** Mais urgente primeiro — ordem de prioridade visual reaproveitada em
 * toda lista de `DashTask` (Início, aba Time, visão individual do
 * membro), pra não duplicar o mesmo mapa em cada lugar. */
export const BUCKET_ORDER: Record<DashTask["bucket"], number> = {
  atrasada: 0,
  hoje: 1,
  amanha: 2,
  semana: 3,
  outro: 4,
};

/** "Atrasada" precisa ser a MESMA definição usada pelo Score Operacional
 * (Pendências/ficha do membro/Indicadores) — senão "Tarefas que precisam
 * de atenção" e "Atualmente atrasadas" divergem (uma tarefa com
 * `performanceDueDate` congelado por um replanejamento crítico não-isento
 * continua atrasada pro Score mesmo que o `dueDate` visível tenha
 * avançado). Usa `performanceDueDate ?? dueDate` (mesmo fallback do resto
 * do app) e o corte das 19h via `deadlineCutoff` — nunca meia-noite
 * pura. */
export function bucketFor(
  dueISO: string | undefined,
  status: ProjTask["status"],
  performanceDueDateISO?: string,
  cutoffHour?: number,
): DashTask["bucket"] {
  // "Aprovado" continua ABERTO pro Score (`OPEN_STATUSES` em `score.ts`
  // inclui "Aprovado") — tratá-lo como terminal aqui fazia uma tarefa
  // aprovada com prazo hoje nunca aparecer em "Tarefas que precisam de
  // atenção" (sempre caía em "outro"), mesmo contando como pendência em
  // todo outro lugar do Score.
  if (status === "Concluído" || status === "Arquivado") return "outro";
  const ref = performanceDueDateISO ?? dueISO;
  if (!ref) return "outro";
  if (new Date().getTime() > deadlineCutoff(ref, cutoffHour).getTime()) return "atrasada";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(ref + "T00:00:00");
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanha";
  if (diff <= 7) return "semana";
  return "outro";
}

export function formatDue(
  dueISO: string | undefined,
  bucket: DashTask["bucket"],
  performanceDueDateISO?: string,
  cutoffHour?: number,
): string {
  const ref = performanceDueDateISO ?? dueISO;
  if (!ref) return "";
  if (bucket === "hoje") return "Hoje";
  if (bucket === "amanha") return "Amanhã";
  if (bucket === "atrasada") {
    const diffMs = new Date().getTime() - deadlineCutoff(ref, cutoffHour).getTime();
    const d = Math.max(1, Math.ceil(diffMs / 86400000));
    return `Atrasada ${d}d`;
  }
  const due = new Date(ref + "T00:00:00");
  return `${WEEKDAYS[due.getDay()].slice(0, 3)} ${due.getDate()}/${due.getMonth() + 1}`;
}

type CommentLike = { id: string; author: string; text: string; createdAt: string };

type CampanhaTaskLike = {
  id: string;
  title: string;
  dueDate?: string;
  performanceDueDate?: string;
  priority?: ProjTask["priority"];
  status: ProjTask["status"];
  assignee?: string;
  assignees?: string[];
  primaryAssignee?: string;
  subtasks?: CampanhaTaskLike[];
  comments?: CommentLike[];
  /** Presentes em runtime nos objetos reais (campanha/marketing são Task
   * completas por baixo, só o tipo estrutural não expunha) — necessários
   * pra `resolvedCompletionTimestamp` em `loadAllTasksFlat`. */
  completedAt?: string;
  activity?: { action: string; createdAt: string }[];
};

/** De quem é essa tarefa, pra fins de "isso é MEU trabalho"/"minha
 * carga" (mesmo conjunto que `collectAllTasks`, abaixo, usa pra exibir
 * avatares). Todo mundo em `assignees` conta, mesmo quando a tarefa tem
 * um Responsável principal definido — estar na tarefa como colaborador
 * (não só como principal) já é suficiente pra ela aparecer em "Meu
 * trabalho"/"Carga por membro" dessa pessoa (decisão explícita do
 * usuário: `primaryAssignee` não deve remover ninguém dessas listas). */
function taskOwners(t: CampanhaTaskLike): string[] {
  return getTaskAssignees(t);
}

/** Percorre uma tarefa e (recursivamente) suas subtarefas, chamando `push`
 * pra cada DONO (`taskOwners`) de cada nível (uma subtarefa pode ter
 * responsáveis diferentes da tarefa-mãe, e uma tarefa pode ter mais de um
 * dono — cada um recebe sua própria entrada). `parentTitle` é o título do
 * pai DIRETO (só pra exibição); quem chama sempre associa a entrada ao id
 * da tarefa de nível raiz pra navegação, já que subtarefa não tem dialog
 * próprio pra abrir sozinha. */
function collectAssignedTasks<T extends CampanhaTaskLike>(
  items: T[],
  parentTitle: string | undefined,
  push: (t: T, parentTitle: string | undefined, assignee: string) => void,
): void {
  for (const t of items) {
    for (const assignee of taskOwners(t)) push(t, parentTitle, assignee);
    if (t.subtasks?.length) {
      collectAssignedTasks(t.subtasks as T[], t.title, push);
    }
  }
}

/** Monta, numa passada só sobre todo o trabalho da plataforma (projetos +
 * tarefas de campanha + avulsas do Marketing), o mapa nome-do-responsável →
 * lista de tarefas dele. Uma tarefa com 2+ responsáveis aparece pra cada um
 * (mesma regra de pontuação de `computeMemberScores` em `score.ts`: cada
 * responsável ganha a entrada cheia, não dividida). `campanhaNames` mapeia
 * campanhaId → nome, pra dar título nas tarefas de campanha do mesmo jeito
 * que as de projeto já têm `p.name`. */
export function loadTasksByAssignee(
  campanhaNames: Map<string, string>,
  cutoffHour?: number,
): Map<string, DashTask[]> {
  const byName = new Map<string, DashTask[]>();
  const addFor = (name: string, task: DashTask) => {
    const arr = byName.get(name);
    if (arr) arr.push(task);
    else byName.set(name, [task]);
  };

  const projs = loadProjetos();
  let marketingProjectId: string | undefined;
  for (const p of projs) {
    if (p.name.trim().toUpperCase() === "MARKETING") marketingProjectId = p.id;
    for (const root of p.tasks ?? []) {
      collectAssignedTasks([root], undefined, (t, parentTitle, assignee) => {
        const b = bucketFor(t.dueDate, t.status, t.performanceDueDate, cutoffHour);
        addFor(assignee, {
          id: t.id,
          projectId: p.id,
          projectName: p.name,
          title: t.title,
          bucket: b,
          due: formatDue(t.dueDate, b, t.performanceDueDate, cutoffHour),
          priority: t.priority,
          status: t.status,
          parentTitle,
          parentId: parentTitle ? root.id : undefined,
        });
      });
    }
  }

  for (const [campanhaId, tasks] of getAllCampanhaTarefas()) {
    for (const root of tasks as unknown as CampanhaTaskLike[]) {
      collectAssignedTasks([root], undefined, (t, parentTitle, assignee) => {
        const b = bucketFor(t.dueDate, t.status, t.performanceDueDate, cutoffHour);
        addFor(assignee, {
          id: t.id,
          projectId: "",
          projectName: campanhaNames.get(campanhaId) ?? "Campanha",
          title: t.title,
          bucket: b,
          due: formatDue(t.dueDate, b, t.performanceDueDate, cutoffHour),
          priority: t.priority,
          status: t.status,
          campanhaId,
          parentTitle,
          parentId: parentTitle ? root.id : undefined,
        });
      });
    }
  }

  // Tarefas avulsas do Marketing (criadas direto no board de lá, não
  // puxadas de nenhum projeto/campanha) vivem à parte, em
  // `marketing_standalone_tasks` — sem isso, tanto "Meu trabalho" quanto a
  // aba Time nunca mostravam tarefas do Marketing que não fossem
  // referências de outro lugar. `id` fica com o mesmo prefixo `mkt:` que o
  // board usa internamente (resolveTasks em MarketingSection.tsx), pra o
  // deep-link (`?taskId=`) achar a tarefa certa lá dentro.
  if (marketingProjectId) {
    for (const s of loadStandalone()) {
      // Sem passar por `collectAssignedTasks` aqui, as SUBTAREFAS de uma
      // tarefa avulsa do Marketing nunca apareciam em "Meu trabalho" —
      // este laço só olhava a tarefa de nível raiz (`s`) direto, ao
      // contrário dos laços de projeto/campanha acima, que já recursam.
      // `parentId` precisa do mesmo prefixo `mkt:` que o id de raiz usa
      // (não o id cru da subtarefa), já que é isso que o deep-link
      // (`openTask`) usa pra abrir — subtarefa nunca tem dialog próprio.
      collectAssignedTasks(
        [s as unknown as CampanhaTaskLike],
        undefined,
        (t, parentTitle, assignee) => {
          const b = bucketFor(t.dueDate, t.status, t.performanceDueDate, cutoffHour);
          addFor(assignee, {
            id: parentTitle ? t.id : `mkt:${s.id}`,
            projectId: marketingProjectId,
            projectName: "Marketing",
            title: t.title,
            bucket: b,
            due: formatDue(t.dueDate, b, t.performanceDueDate, cutoffHour),
            priority: t.priority,
            status: t.status,
            parentTitle,
            parentId: parentTitle ? `mkt:${s.id}` : undefined,
          });
        },
      );
    }
  }

  return byName;
}

/** Tarefas vinculadas a UMA pessoa — usado por "Meu trabalho" no Início.
 * Wrapper fino sobre `loadTasksByAssignee` (mesma passada por baixo dos
 * panos), pra quem só precisa de uma pessoa não ter que montar o mapa
 * inteiro à toa. */
export function loadAllTasks(
  campanhaNames: Map<string, string>,
  personName: string,
  cutoffHour?: number,
): DashTask[] {
  return loadTasksByAssignee(campanhaNames, cutoffHour).get(personName) ?? [];
}

export type DashTaskFlat = DashTask & { assignees: string[] };

/** Mesmo espírito de `collectAssignedTasks`, mas chama `push` uma vez por
 * TAREFA (não uma vez por responsável) — usado por `loadAllTasksFlat`,
 * que precisa de uma linha por tarefa com a lista completa de
 * responsáveis (pra mostrar todos os avatares), ao contrário de
 * `loadTasksByAssignee` (que espalha a mesma tarefa por nome). */
function collectAllTasks<T extends CampanhaTaskLike>(
  items: T[],
  parentTitle: string | undefined,
  push: (t: T, parentTitle: string | undefined, assignees: string[]) => void,
): void {
  for (const t of items) {
    push(t, parentTitle, getTaskAssignees(t));
    if (t.subtasks?.length) {
      collectAllTasks(t.subtasks as T[], t.title, push);
    }
  }
}

/** Lista achatada de TODAS as tarefas da plataforma (projetos + campanhas
 * + avulsas do Marketing), uma linha por tarefa (não por responsável),
 * com `assignees: string[]` completo. Usado pelo dashboard da aba Time
 * (painel "Tarefas que precisam de atenção" e donut "Tarefas por
 * status"), que precisa mostrar cada tarefa uma única vez com todos os
 * avatares dos responsáveis — ao contrário de `loadTasksByAssignee`
 * (pensado pra "tarefas de UMA pessoa", então espalha por nome). */
export function loadAllTasksFlat(
  campanhaNames: Map<string, string>,
  cutoffHour?: number,
): DashTaskFlat[] {
  const out: DashTaskFlat[] = [];

  const projs = loadProjetos();
  let marketingProjectId: string | undefined;
  for (const p of projs) {
    if (p.name.trim().toUpperCase() === "MARKETING") marketingProjectId = p.id;
    for (const root of p.tasks ?? []) {
      collectAllTasks([root], undefined, (t, parentTitle, assignees) => {
        const b = bucketFor(t.dueDate, t.status, t.performanceDueDate, cutoffHour);
        out.push({
          id: t.id,
          projectId: p.id,
          projectName: p.name,
          title: t.title,
          bucket: b,
          due: formatDue(t.dueDate, b, t.performanceDueDate, cutoffHour),
          priority: t.priority,
          status: t.status,
          parentTitle,
          parentId: parentTitle ? root.id : undefined,
          assignees,
          completedAt: resolvedCompletionTimestamp(t) ?? undefined,
        });
      });
    }
  }

  for (const [campanhaId, tasks] of getAllCampanhaTarefas()) {
    for (const root of tasks as unknown as CampanhaTaskLike[]) {
      collectAllTasks([root], undefined, (t, parentTitle, assignees) => {
        const b = bucketFor(t.dueDate, t.status, t.performanceDueDate, cutoffHour);
        out.push({
          id: t.id,
          projectId: "",
          projectName: campanhaNames.get(campanhaId) ?? "Campanha",
          title: t.title,
          bucket: b,
          due: formatDue(t.dueDate, b, t.performanceDueDate, cutoffHour),
          priority: t.priority,
          status: t.status,
          campanhaId,
          parentTitle,
          parentId: parentTitle ? root.id : undefined,
          assignees,
          completedAt: resolvedCompletionTimestamp(t) ?? undefined,
        });
      });
    }
  }

  if (marketingProjectId) {
    for (const s of loadStandalone()) {
      // Mesma correção de `loadTasksByAssignee` acima — sem
      // `collectAllTasks`, subtarefas de uma tarefa avulsa do Marketing
      // nunca entravam na lista achatada (usada pelo painel "Tarefas que
      // precisam de atenção" e pelo donut de status na aba Time).
      collectAllTasks(
        [s as unknown as CampanhaTaskLike],
        undefined,
        (t, parentTitle, assignees) => {
          const b = bucketFor(t.dueDate, t.status, t.performanceDueDate, cutoffHour);
          out.push({
            id: parentTitle ? t.id : `mkt:${s.id}`,
            projectId: marketingProjectId,
            projectName: "Marketing",
            title: t.title,
            bucket: b,
            due: formatDue(t.dueDate, b, t.performanceDueDate, cutoffHour),
            priority: t.priority,
            status: t.status,
            parentTitle,
            parentId: parentTitle ? `mkt:${s.id}` : undefined,
            assignees,
            completedAt: resolvedCompletionTimestamp(t) ?? undefined,
          });
        },
      );
    }
  }

  return out;
}

/** Grupo de tarefas no formato genérico que `computeMemberScores`/
 * `collectTaskItems` (`score.ts`) já aceitam pra projetos/campanhas —
 * empacota as tarefas avulsas do Marketing no mesmo formato, pra elas
 * também contarem nos stats de "tarefas abertas"/"atrasada" de cada
 * pessoa na aba Time (antes ficavam de fora, mesmo bug de origem que já
 * afetava "Meu trabalho" no Início antes desta sessão corrigir aquele). */
export function marketingStandaloneAsTaskGroup(): {
  id: string;
  name: string;
  tasks: Project["tasks"];
} {
  return {
    id: "marketing-standalone",
    name: "Marketing",
    tasks: loadStandalone() as unknown as Project["tasks"],
  };
}

/** Extrai os nomes citados num texto de comentário ("@Nome Completo") —
 * mesma regra de casamento (regex + `startsWith`) que `renderMentions`
 * (TaskBoard.tsx) já usa pra destacar a menção visualmente. Comentário de
 * tarefa não tem um campo `mentions` estruturado como mensagem de chat
 * (`Comment.text` é só texto livre), então a extração precisa acontecer
 * aqui, na leitura. */
function extractMentionedNames(text: string): string[] {
  const matches = text.match(/@[\wÀ-ÿ]+(?:\s[\wÀ-ÿ]+)?/g) ?? [];
  return matches.map((m) => m.slice(1));
}

export type TaskCommentMention = {
  /** Id do comentário — chave estável pra dedupe/"visto" (localStorage). */
  commentId: string;
  /** Mesma convenção de `DashTask`: id do nó (tarefa OU subtarefa) só pra
   * exibição/key; a navegação (`openTask`) sempre resolve via `parentId`
   * quando presente (subtarefa não tem diálogo próprio). */
  id: string;
  projectId: string;
  campanhaId?: string;
  parentId?: string;
  taskTitle: string;
  parentTitle?: string;
  commentText: string;
  author: string;
  createdAt: string;
};

/** Mesma passada de `loadAllTasksFlat` (projetos + campanhas + avulsas do
 * Marketing, recursando em subtarefas), mas procurando comentários que
 * mencionam `myName` em vez de montar `DashTask`s — usado pelo card
 * "Comentários atribuídos" do Início, que até aqui só olhava menções de
 * CHAT (`chat-store.ts`); comentário de tarefa nunca alimentou
 * notificação nenhuma, em nenhum board. */
export function collectTaskCommentMentions(myName: string): TaskCommentMention[] {
  const myNameLower = myName.trim().toLowerCase();
  const out: TaskCommentMention[] = [];
  if (!myNameLower) return out;

  const mentionsMe = (text: string) =>
    extractMentionedNames(text).some((n) => myNameLower.startsWith(n.toLowerCase()));

  const collectFrom = (
    root: CampanhaTaskLike,
    projectId: string,
    rootId: string,
    campanhaId?: string,
  ) => {
    const walk = (items: CampanhaTaskLike[], parentTitle: string | undefined) => {
      for (const t of items) {
        for (const c of t.comments ?? []) {
          if (c.author === myName) continue; // não notifica o próprio autor
          if (!mentionsMe(c.text)) continue;
          out.push({
            commentId: c.id,
            id: t.id,
            projectId,
            campanhaId,
            parentId: parentTitle ? rootId : undefined,
            taskTitle: t.title,
            parentTitle,
            commentText: c.text,
            author: c.author,
            createdAt: c.createdAt,
          });
        }
        if (t.subtasks?.length) walk(t.subtasks, t.title);
      }
    };
    walk([root], undefined);
  };

  const projs = loadProjetos();
  let marketingProjectId: string | undefined;
  for (const p of projs) {
    if (p.name.trim().toUpperCase() === "MARKETING") marketingProjectId = p.id;
    for (const root of (p.tasks ?? []) as unknown as CampanhaTaskLike[]) {
      collectFrom(root, p.id, root.id);
    }
  }

  for (const [campanhaId, tasks] of getAllCampanhaTarefas()) {
    for (const root of tasks as unknown as CampanhaTaskLike[]) {
      collectFrom(root, "", root.id, campanhaId);
    }
  }

  if (marketingProjectId) {
    for (const s of loadStandalone() as unknown as CampanhaTaskLike[]) {
      collectFrom(s, marketingProjectId, `mkt:${s.id}`);
    }
  }

  return out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
