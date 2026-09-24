/** Tipos do Portal do Cliente — extraídos do antigo `routes/portal.$token.tsx`
 * (rota única) pra serem compartilhados entre o shell e as novas rotas
 * (`routes/portal.$token/*`). Espelham exatamente a forma retornada por
 * `getClienteLinkData` (`src/lib/cliente-link.functions.ts`) — nenhum campo
 * novo, nenhuma mudança de forma. */

export type PostMetrics = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
};
export type DemographicEntry = { id: string; label: string; percentual: number };
export type RedeMetrics = {
  interacoes?: number;
  visualizacoes?: number;
  taxaInteracao?: number;
  taxaAtencaoInicial?: number;
  genero?: DemographicEntry[];
  faixaEtaria?: DemographicEntry[];
  paises?: DemographicEntry[];
  cidades?: DemographicEntry[];
};
/** `autorNome` só existe pra ações feitas pelo Portal V2 (sessão
 * autenticada) — o link público antigo (V1) não tem identidade
 * individual, então fica `undefined`; nesse caso a UI mostra um rótulo
 * genérico ("Cliente"), nunca um nome inventado. */
export type Veredito = { motivo: string; respondedAt: string; autorNome?: string };
export type PublicComment = {
  id: string;
  author: string;
  initials: string;
  color: string;
  text: string;
  createdAt: string;
};
export type PublicEntrega = {
  id: string;
  tipo: string;
  titulo?: string;
  quantidade: number;
  status: "orcado" | "combinado" | "publicado";
  stage: string;
  statusCliente: string;
  dataPostagem?: string;
  publicadoEm?: string;
  url?: string;
  anexos?: { id: string; categoria: string; nome: string; url: string }[];
  metrics?: PostMetrics;
  roteiroReprovacao?: Veredito;
  conteudoReprovacao?: Veredito;
  /** `key` traduzida via `t()` — ver ENTREGA_HISTORY_PATTERNS em
   * cliente-link.functions.ts. */
  historico?: { key: string; at: string }[];
  /** Simplificação: sem número de versão real, é a data da última
   * atualização de fato registrada na entrega (ver `toPublicEntrega`). */
  ultimaAtualizacao?: string;
};
export type PublicInfluencer = {
  id: string;
  nome: string;
  nicho?: string;
  foto?: string;
  status: string;
  statusCliente: string;
  clienteReprovacao?: Veredito;
  briefingPersonalizado?: string;
  briefingAnexoNome?: string;
  briefingAnexoUrl?: string;
  observacoes?: string;
  redes: { id?: string; plataforma: string; handle: string; seguidores?: string }[];
  entregas: PublicEntrega[];
  profileMetrics?: { porRede?: Record<string, RedeMetrics> };
  criadoEm?: string;
  historico?: { status: string; at: string }[];
  cicloMes?: string;
  /** Referência real ao ciclo/mês operacional (`campaign_cycles.id`) desta
   * participação — ver `PublicCampanha.cycles`. `undefined`/`null` = sem
   * ciclo atribuído ainda; nunca inferir a partir de `criadoEm`. */
  campaignCycleId?: string | null;
  justificativaTime?: string;
  activityEvents?: {
    id: string;
    kind: string;
    actorType: "cliente" | "equipe";
    actorName: string;
    createdAt: string;
    entregaId?: string;
    motivoLabel?: string;
    comentario?: string;
  }[];
  clienteComments?: PublicComment[];
};
export type PublicCronogramaItem = {
  id: string;
  date: string;
  title: string;
  description?: string;
  recurring?: boolean;
};
export type PublicRelatorioMensal = {
  id: string;
  mes: string;
  nome: string;
  uploadedAt: string;
  nps?: { score: number; comentario?: string; respondedAt: string };
  url: string | null;
};
/** Um ciclo/mês operacional real de uma campanha recorrente
 * (`campaign_cycles`) — só existem os que o time criou explicitamente,
 * nunca inferidos de `createdAt`. */
export type PublicCampaignCycle = {
  id: string;
  competenceYear: number;
  competenceMonth: number;
  status: "active" | "closed";
};
export type PublicCampanha = {
  id: string;
  nome: string;
  prazo?: string;
  dataInicio?: string;
  planejado: number;
  influencers: PublicInfluencer[];
  cronograma: PublicCronogramaItem[];
  relatorios: PublicRelatorioMensal[];
  isRecorrente: boolean;
  recorrenteInicio?: string;
  /** Ausente/vazio é um estado válido: "campanha recorrente sem ciclo
   * ainda" — nunca tratar como "carregando" ou preencher com zeros. */
  cycles?: PublicCampaignCycle[];
};
export type PublicArticle = {
  id: string;
  title: string;
  cover?: string;
  category?: string;
  excerpt?: string;
  content?: string;
  authorName?: string;
  publishDate?: string;
};
export type ClienteLinkData = {
  clienteNome: string;
  clienteFoto?: string;
  campanhas: PublicCampanha[];
  artigos: PublicArticle[];
};
