import type { InfluencerFieldKey } from "@/components/influenciadores/InfluencerBoard";
import { createTableArrayStore } from "./table-array-store";

export type FeatureKey =
  | "roadmap"
  | "kanban"
  | "influenciadores"
  | "documentos"
  | "calendario_editorial"
  | "trafego_pago"
  | "blog";

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
export type TaskActivity = {
  id: string;
  author: string;
  initials: string;
  color: string;
  action: string;
  createdAt: string;
};
export type TaskTimeEntry = { seconds: number; author: string; endedAt: string };
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
};

/** `assignees` (novo, múltiplos) tem prioridade; cai para `assignee` (legado, único) quando ausente. */
export function getTaskAssignees(t: Pick<Task, "assignee" | "assignees">): string[] {
  if (t.assignees?.length) return t.assignees;
  return t.assignee ? [t.assignee] : [];
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

export type BlogStatus = "rascunho" | "revisao" | "publicado" | "arquivado";
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
  audience?: "site" | "mural";
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
};

const projetosStore = createTableArrayStore<Project>("projetos");

export function initProjetosSync(): Promise<void> {
  const p = projetosStore.init();
  projetosStore.subscribeRealtime();
  return p;
}

export function loadProjetos(): Project[] {
  return projetosStore.get().map((p) => ({
    ...p,
    milestones: p.milestones ?? [],
    tasks: (p.tasks ?? []).map((t) => ({ ...t, status: normalizeKanbanStatus(t.status) })),
    docs: p.docs ?? [],
  }));
}

export function saveProjetos(list: Project[]) {
  projetosStore.set(() => list);
}

export function onProjetosChange(callback: () => void): () => void {
  const unsubscribe = projetosStore.subscribe(callback);
  return () => {
    unsubscribe();
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
