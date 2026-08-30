import type { InfluencerFieldKey } from "@/components/influenciadores/InfluencerBoard";
import { createTableArrayStore } from "./table-array-store";
import { loadProjetoTarefas, onProjetoTarefasChange } from "./projeto-scoped-store";
import type { TaskRecurrence } from "@/lib/task-recurrence";

export type FeatureKey =
  | "roadmap"
  | "kanban"
  | "influenciadores"
  | "documentos"
  | "calendario_editorial"
  | "trafego_pago"
  | "blog"
  | "aeo_monitor"
  | "bugs_sugestoes"
  | "fluxos_email";

export const FEATURES: {
  key: FeatureKey;
  label: string;
  hint: string;
  group?: "core" | "marketing";
}[] = [
  {
    key: "roadmap",
    label: "Roadmap",
    hint: "Marcos e datas-chave do projeto em uma linha do tempo.",
    group: "core",
  },
  {
    key: "kanban",
    label: "Kanban de tarefas",
    hint: "Quadro visual A fazer / Fazendo / Feito para organizar entregas.",
    group: "core",
  },
  {
    key: "influenciadores",
    label: "Influenciadores",
    hint: "Cadastro de criadores parceiros com redes sociais, entregas e status.",
    group: "core",
  },
  {
    key: "documentos",
    label: "Documentos",
    hint: "Links para briefings, contratos e materiais de referência.",
    group: "core",
  },
  {
    key: "calendario_editorial",
    label: "Calendário editorial",
    hint: "Planejamento de posts e conteúdo por data.",
    group: "marketing",
  },
  {
    key: "trafego_pago",
    label: "Tráfego pago",
    hint: "Campanhas de mídia paga, verba, canais e resultados.",
    group: "marketing",
  },
  {
    key: "blog",
    label: "Blog",
    hint: "Pauta e publicação de artigos e conteúdos longos.",
    group: "marketing",
  },
  {
    key: "aeo_monitor",
    label: "AEO Monitor",
    hint: "Biblioteca de prompts e monitoramento de citação da marca em IAs (ChatGPT, Perplexity, Gemini, Claude).",
    group: "marketing",
  },
  {
    key: "bugs_sugestoes",
    label: "Bugs & Sugestões",
    hint: "Relatos de bug e ideias sobre o HypeApp, com status de resolução.",
    group: "core",
  },
  {
    key: "fluxos_email",
    label: "E-mails",
    hint: "Campanhas de e-mail: público, sequência de mensagens, disparo e resultados.",
    group: "marketing",
  },
];

export const DEFAULT_FEATURES: FeatureKey[] = [
  "roadmap",
  "kanban",
  "influenciadores",
  "documentos",
];

/** Which influencer fields a project's "Influenciadores" feature collects —
 * see @/components/influenciadores/InfluencerBoard, the same board Campanhas uses. */
export type { InfluencerFieldKey } from "@/components/influenciadores/InfluencerBoard";
export {
  INFLUENCER_FIELDS,
  DEFAULT_INFLUENCER_FIELDS,
} from "@/components/influenciadores/InfluencerBoard";

export type KanbanStatus =
  | "Aberto"
  | "Em andamento"
  | "Em aprovação"
  | "Em ajustes"
  | "Aprovado"
  | "Concluído"
  | "Arquivado";

/** Migra status antigos ("todo" | "doing" | "done") para o novo formato. */
export function normalizeKanbanStatus(value: unknown): KanbanStatus {
  if (value === "todo") return "Aberto";
  if (value === "doing") return "Em andamento";
  if (value === "done") return "Concluído";
  const allowed: KanbanStatus[] = [
    "Aberto",
    "Em andamento",
    "Em aprovação",
    "Em ajustes",
    "Aprovado",
    "Concluído",
    "Arquivado",
  ];
  return (allowed as string[]).includes(value as string) ? (value as KanbanStatus) : "Aberto";
}
export type TaskPriority = "Urgente" | "Alta" | "Normal" | "Baixa";
export type ChecklistItem = { id: string; text: string; done: boolean };
export type TaskAttachment = { id: string; name: string; url?: string };
export type TaskComment = {
  id: string;
  author: string;
  initials: string;
  color: string;
  text: string;
  createdAt: string;
};
/** Mesmo shape de `ActivityKind` em `TaskBoard.tsx` — replicado aqui. */
export type ActivityKind =
  | "completed"
  | "reopened"
  | "deadline"
  | "primary_assignee"
  | "assignee"
  | "status"
  | "minor";

export type TaskActivity = {
  id: string;
  author: string;
  initials: string;
  color: string;
  action: string;
  createdAt: string;
  kind?: ActivityKind;
};
export type TaskTimeEntry = { seconds: number; author: string; endedAt: string };

/** String mágica compartilhada — `TaskBoard.tsx`'s `taskCompletedAt` e
 * `score.ts`'s `taskCompletionDate` procuram exatamente essa `action`
 * pra derivar quando uma tarefa foi concluída em dados legados (sem
 * `completedAt`). Vive numa lib pura (não em `TaskBoard.tsx`) pra
 * `score.ts` poder importá-la sem puxar o componente React inteiro pro
 * bundle. Nunca mudar este texto sem atualizar os dois lugares. */
export const ACTIVITY_STATUS_COMPLETED_ACTION = "mudou status para Concluído";

/** Mesmo shape/regras de `DeadlineChangeMotivo`/`DeadlineChangeEntry` em
 * `src/components/tasks/TaskBoard.tsx` — replicado aqui (não importado)
 * seguindo a mesma convenção já usada neste arquivo pra
 * `TaskActivity`/`TaskComment`/etc. A lógica de quando/como preencher
 * esses campos vive num único lugar (o `save()` do diálogo de edição em
 * TaskBoard.tsx, compartilhado pelas 3 origens de tarefa) — aqui é só o
 * shape de dado. */
export type DeadlineChangeMotivo =
  | "dependencia_cliente"
  | "mudanca_escopo"
  | "prioridade_lideranca"
  | "dependencia_interna"
  | "replanejamento_operacional"
  | "atraso_responsavel"
  | "outro";

export type DeadlineChangeEntry = {
  id: string;
  from?: string;
  to?: string;
  changedAt: string;
  changedBy: string;
  isCritical: boolean;
  motivo?: DeadlineChangeMotivo;
  observacao?: string;
  exemptFromResponsibility: boolean;
  adminOverride?: { exempted: boolean; by: string; at: string };
};

export type Task = {
  id: string;
  title: string;
  status: KanbanStatus;
  description?: string;
  dueDate?: string;
  startDate?: string;
  estimate?: string;
  priority?: TaskPriority;
  assignee?: string;
  assignees?: string[];
  /** Ver comentário equivalente em `TaskBoard.tsx`'s `Task.primaryAssignee`. */
  primaryAssignee?: string;
  tags?: string[];
  attachments?: TaskAttachment[];
  createdAt?: string;
  subtasks?: Task[];
  comments?: TaskComment[];
  activity?: TaskActivity[];
  checklist?: ChecklistItem[];
  notes?: string;
  timerRunning?: boolean;
  timerStartedAt?: string;
  timeEntries?: TaskTimeEntry[];
  completedAt?: string;
  originalDueDate?: string;
  performanceDueDate?: string;
  deadlineHistory?: DeadlineChangeEntry[];
  /** Ver comentário equivalente em `TaskBoard.tsx`'s `Task.recurrence`. */
  recurrence?: TaskRecurrence;
};

/** `assignees` (novo, múltiplos) tem prioridade; cai para `assignee` (legado, único) quando ausente. */
export function getTaskAssignees(t: Pick<Task, "assignee" | "assignees">): string[] {
  if (t.assignees?.length) return t.assignees;
  return t.assignee ? [t.assignee] : [];
}

/** Ver `TaskBoard.tsx`'s `getTaskPrimaryAssignee` — sem fallback automático. */
export function getTaskPrimaryAssignee(t: Pick<Task, "primaryAssignee">): string | undefined {
  return t.primaryAssignee;
}

/** Ver `TaskBoard.tsx`'s `getTaskCollaborators` — derivado, nunca armazenado à parte. */
export function getTaskCollaborators(
  t: Pick<Task, "assignee" | "assignees" | "primaryAssignee">,
): string[] {
  return getTaskAssignees(t).filter((a) => a !== t.primaryAssignee);
}

export type Milestone = { id: string; title: string; date: string; done: boolean; taskId?: string };
export type DocItem = { id: string; name: string; url: string };
export type SectionItem = { id: string; title: string; note?: string; date?: string; url?: string };

export type EditorialStatus = "ideia" | "producao" | "agendado" | "publicado";
export type EditorialPost = {
  id: string;
  title: string;
  date: string; // ISO yyyy-mm-dd
  channel: string; // Instagram, TikTok, YouTube...
  status: EditorialStatus;
  notes?: string;
};

export type CampaignPlatform = "Meta" | "Google" | "TikTok" | "LinkedIn" | "Outro";
export type CampaignStatus = "rascunho" | "ativa" | "pausada" | "encerrada";
export type Creative = { id: string; name: string; url: string };
export type Campaign = {
  id: string;
  name: string;
  platform: CampaignPlatform;
  objective?: string;
  status: CampaignStatus;
  budget?: number;
  startDate?: string;
  endDate?: string;
  brief?: string;
  audience?: string;
  creatives: Creative[];
  metrics: {
    impressions?: number;
    clicks?: number;
    conversions?: number;
    spend?: number;
  };
  notes?: string;
};

export type BlogStatus = "agendado" | "publicado" | "despublicado";
export type BlogPost = {
  id: string;
  title: string;
  slug?: string;
  authorId?: string; // team member id
  authorName?: string; // fallback text
  cover?: string;
  category?: string;
  status: BlogStatus;
  publishDate?: string;
  excerpt?: string;
  content?: string;
  /** Um artigo pode ir pra mais de um destino ao mesmo tempo (ex: Site +
   * Mural), por isso é uma lista, não um valor único. */
  audience?: ("site" | "mural")[];
  /** Ids de `Cliente` cujo portal (`/portal/$token`) deve mostrar este
   * artigo — independente do `audience` acima. Só entra no portal quando
   * `status === "publicado"`. */
  portalClienteIds?: string[];
};

export type ProjectLayout = "tabs" | "single";

export type Project = {
  id: string;
  name: string;
  cover?: string;
  description: string;
  features: FeatureKey[];
  influencerFeatures?: InfluencerFieldKey[];
  layout?: ProjectLayout;
  createdAt: number;
  milestones: Milestone[];
  tasks: Task[];
  docs: DocItem[];
  sections?: Partial<Record<FeatureKey, SectionItem[]>>;
  editorial?: EditorialPost[];
  campaigns?: Campaign[];
  blog?: BlogPost[];
  /** Token do link público/externo de Bugs & Sugestões (só usado pelo
   * Projeto HypeApp) — gerado sob demanda, mesmo padrão de
   * `Cliente.publicToken`/`Campaign.signupToken`. */
  bugsPublicToken?: string;
};

const projetosStore = createTableArrayStore<Project>("projetos");

export function initProjetosSync(): Promise<void> {
  const p = projetosStore.init();
  projetosStore.subscribeRealtime();
  return p;
}

// `projetosStore.get()` retorna sempre a mesma referência até o store
// realmente mudar (ver table-array-store.ts) — cacheia o resultado mapeado
// por identidade pra chamadas repetidas de `loadProjetos()` (ex.: em vários
// componentes/efeitos no mesmo ciclo) não remapearem tudo à toa. As tarefas
// vêm de um store à parte (projeto_tarefas, per-row — ver
// projeto-scoped-store.ts), cujo cache é mutado in-place (não troca de
// referência), por isso um contador de versão à parte também invalida esse
// cache quando só as tarefas mudam.
let tarefasVersion = 0;
onProjetoTarefasChange(() => {
  tarefasVersion++;
});

let cachedRawProjetos: Project[] | null = null;
let cachedTarefasVersion = -1;
let cachedMappedProjetos: Project[] = [];

export function loadProjetos(): Project[] {
  const raw = projetosStore.get();
  if (raw === cachedRawProjetos && tarefasVersion === cachedTarefasVersion) {
    return cachedMappedProjetos;
  }
  cachedRawProjetos = raw;
  cachedTarefasVersion = tarefasVersion;
  cachedMappedProjetos = raw.map((p) => ({
    ...p,
    milestones: p.milestones ?? [],
    // Tarefas de projeto viviam dentro do JSONB do projeto inteiro
    // (`p.tasks`) — cada edição regravava o array completo junto com o
    // resto do projeto, e duas edições concorrentes em tarefas diferentes
    // podiam se apagar uma à outra silenciosamente (last-write-wins de
    // array inteiro). Agora a fonte de verdade é `projeto_tarefas`
    // (per-row, como campanha_tarefas) — `p.tasks` no banco vira dado
    // morto, ignorado aqui de propósito.
    tasks: loadProjetoTarefas(p.id).map((t) => ({ ...t, status: normalizeKanbanStatus(t.status) })),
    docs: p.docs ?? [],
  }));
  return cachedMappedProjetos;
}

export function saveProjetos(list: Project[]) {
  projetosStore.set(() => list);
}

export function onProjetosChange(callback: () => void): () => void {
  const unsubscribe = projetosStore.subscribe(callback);
  const unsubscribeTarefas = onProjetoTarefasChange(callback);
  return () => {
    unsubscribe();
    unsubscribeTarefas();
  };
}

export function getProjeto(id: string): Project | undefined {
  return loadProjetos().find((p) => p.id === id);
}

export function upsertProjeto(p: Project) {
  projetosStore.set((prev) => {
    const idx = prev.findIndex((x) => x.id === p.id);
    if (idx >= 0) return prev.map((x, i) => (i === idx ? p : x));
    return [...prev, p];
  });
}

export function deleteProjeto(id: string) {
  projetosStore.set((prev) => prev.filter((x) => x.id !== id));
}

/* Team members shared with TimeSection (key: time:membros) */
export type TeamMemberLite = { id: string; name: string; role?: string; photo?: string };
export function loadTeamMembers(): TeamMemberLite[] {
  try {
    const raw = localStorage.getItem("time:membros");
    if (!raw) return [];
    return (JSON.parse(raw) as TeamMemberLite[]).map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      photo: m.photo,
    }));
  } catch {
    return [];
  }
}
