import { createTableArrayStore } from "./table-array-store";

export const META_AREAS = ["Marketing", "Operação", "Influenciadores", "Comercial"] as const;
export type MetaArea = (typeof META_AREAS)[number];

export type MetaAtualizacao = {
  id: string;
  /** Valor atual no momento desta atualização (metas numéricas) — junto com
   * o histórico dá pra ver a evolução, não só o número final. */
  valor?: number;
  nota?: string;
  author: string;
  initials: string;
  color: string;
  createdAt: string;
};

export type Meta = {
  id: string;
  titulo: string;
  descricao?: string;
  area: MetaArea;
  tipo: "numerica" | "binaria";
  /** Só faz sentido pra `tipo: "numerica"`. */
  valorAlvo?: number;
  valorAtual?: number;
  unidade?: string; // ex: "clientes", "R$", "%", "posts"
  /** Só faz sentido pra `tipo: "binaria"`. */
  concluida?: boolean;
  responsavel?: string; // nome do membro do time
  prazo?: string; // YYYY-MM-DD
  cancelada?: boolean;
  createdAt: string;
  updatedAt?: string;
  atualizacoes?: MetaAtualizacao[];
};

export type MetaStatus = "em_andamento" | "concluida" | "atrasada" | "cancelada";

/** Deriva o status de exibição a partir dos dados — evita guardar um campo
 * `status` que poderia dessincronizar do progresso/prazo reais. */
export function metaStatus(m: Meta): MetaStatus {
  if (m.cancelada) return "cancelada";
  const concluida =
    m.tipo === "binaria" ? !!m.concluida : (m.valorAtual ?? 0) >= (m.valorAlvo ?? 0);
  if (concluida) return "concluida";
  if (m.prazo && m.prazo < new Date().toISOString().slice(0, 10)) return "atrasada";
  return "em_andamento";
}

export function metaProgresso(m: Meta): number {
  if (m.tipo === "binaria") return m.concluida ? 100 : 0;
  if (!m.valorAlvo) return 0;
  return Math.min(100, Math.round(((m.valorAtual ?? 0) / m.valorAlvo) * 100));
}

const store = createTableArrayStore<Meta>("metas");

export function initMetasSync(): Promise<void> {
  const p = store.init();
  store.subscribeRealtime();
  return p;
}

export function loadMetas(): Meta[] {
  return store.get();
}

export function saveMetas(list: Meta[]) {
  store.set(() => list);
}

export function onMetasChange(callback: () => void): () => void {
  return store.subscribe(callback);
}
