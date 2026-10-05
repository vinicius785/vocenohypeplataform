/**
 * Modelo de Influenciadores/Entregas — tipos, constantes e normalizadores PUROS
 * (sem React nem UI). Extraído de `components/influenciadores/InfluencerBoard.tsx`
 * para que `lib/*` (stores, server functions, motores) não importe um componente
 * de 7 mil linhas e para que essa UI não entre no bundle inicial só porque
 * `lib/projetos.ts` precisa de `INFLUENCER_FIELDS`. O board re-exporta tudo
 * daqui, então os imports antigos continuam válidos.
 */
import { PLATAFORMAS } from "@/lib/social-profiles";
import { formatDateToIso } from "@/lib/utils";
import type { CustomQuestionType } from "@/lib/inscricao-page";
import {
  INFLU_STATUSES,
  INFLU_KANBAN_ORDER,
  INFLU_STATUS_LABEL,
  INFLU_STATUS_TONE,
  INFLU_STATUS_BORDER,
  ENTREGA_STAGES,
  ENTREGA_STAGE_LABEL,
  ENTREGA_STAGE_TONE,
  ENTREGA_STAGE_BORDER,
  ENTREGA_STAGE_ORDER,
  nextActionForInflu,
  nextActionForEntrega,
  NEXT_ACTOR_LABEL,
  canTransitionInflu,
  canTransitionEntrega,
  legacyInfluStatus,
  migrateLegacyEntregaStage,
  type InfluStatus,
  type EntregaStage,
  type NextActor,
} from "@/lib/campanha-status";
import { type EntregaEngineActionKind } from "@/lib/entrega-engine";
export {
  INFLU_STATUSES,
  INFLU_KANBAN_ORDER,
  INFLU_STATUS_LABEL,
  INFLU_STATUS_TONE,
  INFLU_STATUS_BORDER,
  ENTREGA_STAGES,
  ENTREGA_STAGE_LABEL,
  ENTREGA_STAGE_TONE,
  ENTREGA_STAGE_BORDER,
  ENTREGA_STAGE_ORDER,
  nextActionForInflu,
  nextActionForEntrega,
  NEXT_ACTOR_LABEL,
  canTransitionInflu,
  canTransitionEntrega,
};
export type InfluComment = {
  id: string;
  author: string;
  initials: string;
  color: string;
  text: string;
  createdAt: string;
};
export type InfluActivity = {
  id: string;
  author: string;
  initials: string;
  color: string;
  action: string;
  /** Id da entrega a que esta atividade se refere, quando aplicável — usada
   * pelo Histórico da entrega pra casar de verdade, em vez do antigo
   * casamento por substring do `tipo` (frágil quando há mais de uma
   * entrega do mesmo tipo). Ausente em atividade registrada antes desse
   * campo existir. */
  entregaId?: string;
  /** Marca eventos de uma área (hoje só "financeiro"), para a linha do tempo daquela área. */
  area?: "financeiro";
  createdAt: string;
};

/**
 * Modelo tipado de histórico (substitui gradualmente o texto-livre de
 * `InfluActivity` acima, sem apagá-lo — ver comentário em
 * `src/lib/campanha-aprovacao.ts`). Cada mutação nova grava NOS DOIS
 * arrays (`activity` continua recebendo a linha de texto, pra nada que já
 * lê esse campo quebrar); registros antigos simplesmente não têm entrada
 * aqui (`activityEvents` ausente/vazio pra eles é esperado, documentado —
 * nunca é preenchido retroativamente).
 */
export type InfluActivityEventKind =
  | "perfil_enviado"
  | "perfil_aprovado"
  | "perfil_recusado"
  | "perfil_reaberto"
  | "roteiro_enviado"
  | "roteiro_aprovado"
  | "roteiro_ajustes_solicitados"
  | "conteudo_enviado"
  | "conteudo_aprovado"
  | "conteudo_ajustes_solicitados"
  | "publicado"
  | "observacao_cliente"
  | "comentario_equipe"
  | "comentario_cliente";

export type InfluActivityEvent = {
  id: string;
  kind: InfluActivityEventKind;
  actor: { type: "cliente" | "equipe"; name: string; initials: string; color: string };
  createdAt: string;
  entregaId?: string;
  motivo?: string;
  motivoLabel?: string;
  statusAnterior?: string;
  statusNovo?: string;
  versao?: number;
  comentario?: string;
};

const AUTHOR_COLORS = [
  "bg-rose-500 text-white",
  "bg-sky-500 text-white",
  "bg-emerald-500 text-white",
  "bg-amber-500 text-white",
  "bg-violet-500 text-white",
  "bg-teal-500 text-white",
  "bg-fuchsia-500 text-white",
  "bg-orange-500 text-white",
];
function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AUTHOR_COLORS[h % AUTHOR_COLORS.length];
}
export function getCurrentAuthor() {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("config:perfil");
      if (raw) {
        const p = JSON.parse(raw) as { nome?: string; foto?: string };
        const name = (p.nome ?? "").trim();
        if (name) return { name, initials: initialsOf(name) || "?", color: colorFor(name) };
      }
    } catch {
      /* ignore */
    }
  }
  return { name: "Você", initials: "VC", color: "bg-foreground text-background" };
}

/** Mensagem de Atividade por ação do motor de entrega (`entrega-engine.ts`). */
export const ENTREGA_ACTION_LOG: Record<EntregaEngineActionKind, string> = {
  anexar_roteiro: "anexou o roteiro",
  enviar_roteiro: "enviou o roteiro pra aprovação do cliente",
  reconhecer_ajustes_roteiro: "reconheceu os ajustes pedidos no roteiro",
  anexar_conteudo: "anexou o conteúdo final",
  enviar_conteudo: "enviou o conteúdo final pra aprovação do cliente",
  reconhecer_ajustes_conteudo: "reconheceu os ajustes pedidos no conteúdo final",
  marcar_publicado: "marcou como publicada",
};

/** Registra uma linha de Atividade no influenciador (autor/hora
 * automáticos via `getCurrentAuthor`) — única forma de anotar histórico. */
export function logInfluActivity(
  i: Influ,
  action: string,
  entregaId?: string,
  area?: "financeiro",
): Influ {
  const me = getCurrentAuthor();
  return {
    ...i,
    updatedAt: new Date().toISOString(),
    activity: [
      ...(i.activity ?? []),
      {
        id: crypto.randomUUID(),
        author: me.name,
        initials: me.initials,
        color: me.color,
        action,
        entregaId,
        ...(area ? { area } : {}),
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

/** Formata dígitos de telefone BR como (DDD) 9XXXX-XXXX (ou XXXX-XXXX pra
 * fixo/8 dígitos), mantendo o texto digitável enquanto o usuário digita —
 * qualquer coisa que não seja número é descartada antes de formatar. */
export function formatPhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (digits.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

/** `profileUrl`/`isPrimary`/`order` são aditivos (múltiplos perfis por
 * rede social) — um registro antigo sem eles continua válido; ver
 * `ensurePrimary`/`normalizeSocialInput` em `@/lib/social-profiles`. */
export type Rede = {
  id: string;
  plataforma: string;
  handle: string;
  seguidores?: string;
  profileUrl?: string;
  isPrimary?: boolean;
  order?: number;
};
export type PostMetrics = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
};

/** Uma fatia de distribuição demográfica (ex: "18-24 anos" → 32%). */
export type DemographicEntry = { id: string; label: string; percentual: number };

/**
 * Métricas de uma rede social específica do influenciador (não de uma
 * entrega/post pontual) — engajamento agregado e composição do público
 * daquela rede. Seguidores não entra aqui pois já existe por rede em
 * `Rede.seguidores` (etapa Perfil) — repetir o campo aqui duplicava a
 * mesma informação em dois lugares do formulário.
 */
export type RedeMetrics = {
  interacoes?: number;
  visualizacoes?: number;
  /** % */
  taxaInteracao?: number;
  /** % — retenção nos primeiros segundos/scroll do conteúdo. */
  taxaAtencaoInicial?: number;
  genero?: DemographicEntry[];
  faixaEtaria?: DemographicEntry[];
  paises?: DemographicEntry[];
  cidades?: DemographicEntry[];
};

/** Métricas do perfil do influenciador, uma entrada por rede social
 * (chave = `Rede.id`) — preenchidas manualmente a partir dos insights
 * nativos de cada plataforma. */
export type ProfileMetrics = {
  porRede?: Record<string, RedeMetrics>;
};

function hasRedeMetrics(m?: RedeMetrics): boolean {
  return Boolean(
    m &&
    (m.interacoes ||
      m.visualizacoes ||
      m.taxaInteracao ||
      m.taxaAtencaoInicial ||
      m.genero?.length ||
      m.faixaEtaria?.length ||
      m.paises?.length ||
      m.cidades?.length),
  );
}
/**
 * Formas de pagamento — mesmas opções e campos usados ao configurar o
 * pagamento do cliente em VincularCampanhaDialog, agora por entrega.
 */
export const PAG_TIPOS_ENTREGA = ["Valor", "Por Hora", "Comissão", "Permuta", "Outro"] as const;
export type PagTipoEntrega = (typeof PAG_TIPOS_ENTREGA)[number];
export type AprovacaoPagamento = "pendente" | "aceito" | "recusado";
export const APROVACAO_TONE: Record<AprovacaoPagamento, string> = {
  pendente: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  aceito: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  recusado: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
};
export const APROVACAO_LABEL: Record<AprovacaoPagamento, string> = {
  pendente: "Pendente",
  aceito: "Aceito",
  recusado: "Recusado",
};
export type PagamentoConfigEntrega = {
  valor?: string;
  porHoraDescricao?: string;
  porHoraValor?: string;
  comissaoPct?: string;
  comissaoSobre?: string;
  permutaDescricao?: string;
  permutaFoto?: string;
  outroDescricao?: string;
  outroValor?: string;
  outroCriterios?: string;
};
/**
 * Um pagamento pode combinar mais de um tipo (ex: "Valor" + "Por Hora") —
 * por isso `tipos` é uma lista, com a config de cada tipo guardada
 * separadamente. Um único pagamento cobre todas as entregas do influ.
 */
export type PagamentoEntrega = {
  tipos: PagTipoEntrega[];
  config: Record<string, PagamentoConfigEntrega>;
  aprovacao: AprovacaoPagamento;
  data?: string;
  comprovanteNome?: string;
  comprovanteUrl?: string;
};
/** Formato usado antes dos grupos de pagamento: um único tipo, campos soltos na raiz. */
type LegacyPagamentoEntrega = PagamentoConfigEntrega & {
  tipo: PagTipoEntrega;
  aprovacao: AprovacaoPagamento;
  data?: string;
};
/** Normaliza qualquer pagamento salvo (formato novo ou antigo) para o formato atual. */
export function normalizePagamento(
  p?: PagamentoEntrega | LegacyPagamentoEntrega,
): PagamentoEntrega | undefined {
  if (!p) return undefined;
  if ("tipos" in p) return p;
  const { tipo, aprovacao, data, ...fields } = p;
  return { tipos: [tipo], config: { [tipo]: fields }, aprovacao, data };
}
/** Valor "em dinheiro" equivalente ao pagamento, para totais e para o Financeiro. */
export function pagamentoCashValue(p?: PagamentoEntrega | LegacyPagamentoEntrega): number {
  const norm = normalizePagamento(p);
  if (!norm) return 0;
  return norm.tipos.reduce((sum, t) => {
    const cfg = norm.config[t] ?? {};
    if (t === "Valor") return sum + parseMoney(cfg.valor);
    if (t === "Por Hora") return sum + parseMoney(cfg.porHoraValor);
    if (t === "Outro") return sum + parseMoney(cfg.outroValor);
    return sum; // Comissão (% sobre vendas futuras) e Permuta não têm valor em caixa
  }, 0);
}
/** Resumo curto do pagamento para exibição em listas/cards. */
export function pagamentoResumo(p?: PagamentoEntrega | LegacyPagamentoEntrega): string {
  const norm = normalizePagamento(p);
  if (!norm || norm.tipos.length === 0) return "—";
  return norm.tipos
    .map((t) => {
      const cfg = norm.config[t] ?? {};
      if (t === "Valor") return fmtBRL(parseMoney(cfg.valor));
      if (t === "Por Hora")
        return `${fmtBRL(parseMoney(cfg.porHoraValor))}/h${cfg.porHoraDescricao ? ` — ${cfg.porHoraDescricao}` : ""}`;
      if (t === "Comissão")
        return `${cfg.comissaoPct || "0"}% sobre ${cfg.comissaoSobre || "vendas"}`;
      if (t === "Permuta") return cfg.permutaDescricao || "Permuta";
      return cfg.outroDescricao || fmtBRL(parseMoney(cfg.outroValor)) || "Outro";
    })
    .join(" + ");
}
/** Valor em dinheiro do pagamento do influenciador, só quando já aceito. */
export function totalAceito(pagamento?: PagamentoEntrega): number {
  if (pagamento?.aprovacao !== "aceito") return 0;
  return pagamentoCashValue(pagamento);
}

/** Etapa 4 do funil de aprovação: 15 dias após a postagem, o time precisa
 * preencher as métricas do conteúdo — sem lembrete agendado (não existe
 * cron no projeto), é um badge computado direto do estado já salvo. */
export function metricasPendentes(e: Entrega): boolean {
  if (e.status !== "publicado" || !e.publicadoEm) return false;
  const dias = (Date.now() - new Date(e.publicadoEm + "T00:00:00").getTime()) / 86_400_000;
  if (dias < 15) return false;
  return !e.metrics || !Object.values(e.metrics).some((v) => v);
}

export type ReliabilityStats = {
  score: number; // 0-100
  total: number;
  onTime: number;
  late: number;
  overdue: number;
  /** Entregas cuja etapa intermediária (roteiro ou gravação) chegou depois
   * da data de postagem combinada — sinal de atraso mesmo quando o post
   * final saiu no prazo (ficou em cima da hora pro time). */
  etapasAtrasadas: number;
  /** Reprovações abertas agora (seleção, roteiro ou conteúdo) — sinal do
   * momento, não histórico: o campo é limpo assim que o time reenvia e o
   * cliente aprova, então não dá pra somar reprovações passadas já
   * resolvidas com os dados que o cadastro guarda hoje. */
  reprovacoesAbertas: number;
};

const RECENCY_WINDOW_MONTHS = 12;
const MIN_RECENT_SAMPLE = 3;

/**
 * Score de confiabilidade — baseado no histórico real de entregas (across
 * todas as campanhas). Prioriza os últimos 12 meses (se houver pelo menos
 * 3 entregas nesse período); com menos que isso, usa o histórico inteiro
 * pra não deixar a nota vazia/injusta por falta de amostra recente.
 *
 * Penaliza, em ordem de peso: prazo vencido sem publicar (1.5x), publicado
 * depois do combinado (1x), etapa intermediária (roteiro/gravação) que
 * chegou depois do prazo de postagem mesmo o post saindo no prazo (0.75x),
 * e reprovações abertas agora (5 pontos cada, até 20 pontos).
 */
export function computeReliability(
  influs: Pick<Influ, "entregas" | "clienteReprovacao">[],
): ReliabilityStats {
  const today = todayISO();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RECENCY_WINDOW_MONTHS);
  const cutoffISO = formatDateToIso(cutoff);

  let reprovacoesAbertas = 0;
  const allEntregas: Entrega[] = [];
  for (const influ of influs) {
    if (influ.clienteReprovacao) reprovacoesAbertas += 1;
    for (const e of influ.entregas) {
      if (e.roteiroReprovacao || e.conteudoReprovacao) reprovacoesAbertas += 1;
      allEntregas.push(e);
    }
  }

  const recent = allEntregas.filter((e) => {
    const ref = e.publicadoEm || e.dataPostagem;
    return ref && ref >= cutoffISO;
  });
  const sample = recent.length >= MIN_RECENT_SAMPLE ? recent : allEntregas;
  const relevant = sample.filter((e) => e.status !== "orcado");

  let onTime = 0;
  let late = 0;
  let overdue = 0;
  let etapasAtrasadas = 0;
  for (const e of relevant) {
    if (e.status === "publicado") {
      if (e.dataPostagem && e.publicadoEm && e.publicadoEm > e.dataPostagem) late += 1;
      else onTime += 1;
    } else if (e.status === "combinado" && e.dataPostagem && e.dataPostagem < today) {
      overdue += 1;
    }
    if (
      e.dataPostagem &&
      ((e.dataRecebimentoRoteiro && e.dataRecebimentoRoteiro > e.dataPostagem) ||
        (e.dataRecebimentoConteudo && e.dataRecebimentoConteudo > e.dataPostagem))
    ) {
      etapasAtrasadas += 1;
    }
  }

  const total = relevant.length;
  if (total === 0) {
    return {
      score: 100,
      total: 0,
      onTime: 0,
      late: 0,
      overdue: 0,
      etapasAtrasadas: 0,
      reprovacoesAbertas,
    };
  }
  const deliveryPenalty = ((late + overdue * 1.5 + etapasAtrasadas * 0.75) / total) * 100;
  const reprovacaoPenalty = Math.min(20, reprovacoesAbertas * 5);
  const score = Math.max(0, Math.round(100 - deliveryPenalty - reprovacaoPenalty));
  return { score, total, onTime, late, overdue, etapasAtrasadas, reprovacoesAbertas };
}

/** Prazo (dias) que consideramos razoável para um cliente responder uma solicitação de aprovação. */
export const APPROVAL_SLA_DAYS = 3;

/** Plural (minúsculo) dos rótulos de `INFLU_STATUS_LABEL` — só pro resumo
 * textual do cabeçalho ("3 recusados"), nunca pros badges. */
export const INFLU_STATUS_PLURAL: Record<InfluStatus, string> = {
  INSCRITO: "inscritos",
  EM_CURADORIA: "em curadoria",
  ENVIADO_AO_CLIENTE: "enviados ao cliente",
  APROVADO: "aprovados",
  RECUSADO: "recusados",
};
/** Pontinho de cor do resumo — mesma família de cor de `INFLU_STATUS_TONE`. */
export const INFLU_STATUS_DOT: Record<InfluStatus, string> = {
  INSCRITO: "bg-muted-foreground/60",
  EM_CURADORIA: "bg-muted-foreground/60",
  ENVIADO_AO_CLIENTE: "bg-muted-foreground",
  APROVADO: "bg-emerald-500",
  RECUSADO: "bg-red-500",
};

/** Se o influenciador está "Enviado ao cliente" há mais dias que o SLA, retorna há quantos dias. */
export function approvalSlaOverdueDays(influ: Influ): number | null {
  if (influ.status !== "ENVIADO_AO_CLIENTE" || influ.clienteReprovacao || !influ.statusUpdatedAt)
    return null;
  const days = Math.floor(
    (Date.parse(todayISO()) - Date.parse(influ.statusUpdatedAt)) / (24 * 60 * 60 * 1000),
  );
  return days > APPROVAL_SLA_DAYS ? days : null;
}

/**
 * Uma entrega combinada com o influenciador. Cobre o ciclo inteiro:
 * nasce como "combinado" (só o formato/quantidade contratados) e vira
 * "publicado" quando o conteúdo sai no ar — é só nesse momento que faz
 * sentido preencher link/anexo e métricas. Antes existiam dois lugares
 * separados (Entregas x Conteúdos publicados) para guardar praticamente
 * a mesma coisa; unificado aqui em um método só.
 *
 * O pagamento combinado para a entrega também mora aqui: ao ser marcado
 * como "aceito", ele aparece automaticamente na aba Pagamentos do
 * influenciador e — só a partir desse momento — vira uma despesa real
 * no Financeiro (ver financeiro-entries.ts).
 */
// Status de perfil (Influ) e estágio de entrega (EntregaStage) vivem em
// src/lib/campanha-status.ts — fonte única, compartilhada com o portal do
// cliente e as server functions.
export type { InfluStatus, EntregaStage, NextActor };

export const ENTREGA_ANEXO_CATEGORIAS = ["Roteiro", "Gravação", "Conteúdo final", "Outro"] as const;
export type EntregaAnexoCategoria = (typeof ENTREGA_ANEXO_CATEGORIAS)[number];

/** Traduz a categoria antiga ("Conteúdo publicado", que confundia com "já
 * publicado" de verdade) pra "Conteúdo final" — não reescreve o banco, só
 * normaliza na leitura, mesmo padrão de `legacyEntregaEtapa`. */
export function legacyAnexoCategoria(raw: string): EntregaAnexoCategoria {
  if ((ENTREGA_ANEXO_CATEGORIAS as readonly string[]).includes(raw)) {
    return raw as EntregaAnexoCategoria;
  }
  if (raw === "Conteúdo publicado") return "Conteúdo final";
  return "Outro";
}
export type EntregaAnexo = {
  id: string;
  categoria: EntregaAnexoCategoria;
  nome: string;
  url: string;
  /** Nº de versão dentro da mesma categoria (1, 2, 3...) — nunca
   * sobrescreve um anexo anterior, cada novo upload na mesma categoria
   * ganha o próximo número, preservando o histórico completo. Ausente em
   * anexos antigos (pré-versionamento); tratado como v1 na exibição. */
  versao?: number;
  criadoEm?: string;
  /** Instante exato (ISO) do envio — `criadoEm` guarda só o dia. Aditivo: anexo antigo não tem. Usado
   * para saber se o arquivo é posterior a um feedback do cliente no mesmo dia. */
  criadoEmTs?: string;
};

/** Acrescenta um ou mais anexos novos na categoria certa, calculando a
 * versão seguinte (nunca sobrescreve um anexo anterior) — usado tanto pelo
 * editor genérico de anexos quanto pela ação contextual do motor de
 * entrega. Todos os arquivos passados numa mesma chamada recebem a MESMA
 * versão: eles vieram da mesma seleção/ação do usuário (ex: as 3 unidades
 * de um Story enviadas juntas), então são arquivos IRMÃOS — partes da
 * mesma entrega, não revisões sequenciais um do outro. Só uma nova chamada
 * (upload feito depois, separado) avança pra próxima versão. */
export function addAnexosComVersao(
  anexos: EntregaAnexo[],
  categoria: EntregaAnexoCategoria,
  novos: { nome: string; url: string }[],
): EntregaAnexo[] {
  if (novos.length === 0) return anexos;
  const maxVersaoAtual = anexos
    .filter((a) => a.categoria === categoria)
    .reduce((max, a) => Math.max(max, a.versao ?? 1), 0);
  const versao = maxVersaoAtual + 1;
  const criadoEm = todayISO();
  const criadoEmTs = new Date().toISOString();
  return [
    ...anexos,
    ...novos.map((n) => ({
      id: crypto.randomUUID(),
      categoria,
      nome: n.nome,
      url: n.url,
      versao,
      criadoEm,
      criadoEmTs,
    })),
  ];
}

/** Variante de conveniência de `addAnexosComVersao` pra um único arquivo —
 * mantida pra não obrigar todo call site a montar um array de 1 item. */
export function addAnexoComVersao(
  anexos: EntregaAnexo[],
  categoria: EntregaAnexoCategoria,
  nome: string,
  url: string,
): EntregaAnexo[] {
  return addAnexosComVersao(anexos, categoria, [{ nome, url }]);
}

export type Entrega = {
  id: string;
  tipo: string;
  titulo?: string;
  quantidade: number;
  /** Quando uma entrega multi-unidade (ex: "3 Storys") é dividida em
   * unidades independentes, cada unidade ganha o mesmo `grupoId` — cada
   * uma com seu próprio `stage`/aprovação, nunca uma aprovação
   * compartilhada. Ausente em entregas antigas (pré-divisão) ou que
   * nunca foram divididas — nesse caso `quantidade` continua sendo o
   * único sinal de "quantas unidades", como sempre foi. */
  grupoId?: string;
  status: "orcado" | "combinado" | "publicado";
  /** Estágio de produção/aprovação da entrega — independente do status de
   * orçamento/publicação acima. Um único campo linear (ver
   * src/lib/campanha-status.ts) — sempre presente, nunca lido sem
   * fallback (entregas criadas antes do backfill sempre têm o valor
   * setado por ele). */
  stage: EntregaStage;
  dataPostagem?: string; // data planejada (ou realizada) para a postagem
  /** Carimbo de "roteiro pronto" — setado pelo motor (`entrega-engine.ts`)
   * quando o time confirma o roteiro, nunca editado por inferência de
   * anexo presente. Único sinal que libera a ação "Enviar para cliente"
   * no estágio de roteiro. */
  dataRecebimentoRoteiro?: string;
  /** Carimbo de "conteúdo final pronto" — mesmo papel de
   * `dataRecebimentoRoteiro`, mas pro estágio de conteúdo. */
  dataRecebimentoConteudo?: string;
  /** Anexos da entrega (roteiro, gravação, conteúdo final, etc) — podem
   * ser adicionados em qualquer estágio, e mais de um por categoria. */
  anexos?: EntregaAnexo[];
  /** Link do post publicado (texto, não anexo). */
  url?: string;
  publicadoEm?: string;
  metrics?: PostMetrics;
  /** Preenchido quando o cliente reprova o roteiro pelo link público —
   * limpo assim que ele aprova (ou reenvia e aprova de novo). */
  roteiroReprovacao?: ClienteVeredito;
  /** Idem, para o conteúdo publicado. */
  conteudoReprovacao?: ClienteVeredito;
};

/** Motivo + carimbo de quando o cliente reprovou algo pelo link público
 * (seleção de influ, roteiro ou conteúdo de uma entrega). `autorNome` só
 * existe a partir do Portal V2 (sessão autenticada, com nome real do
 * usuário) — o link público antigo (V1) não tem identidade individual,
 * então fica `undefined` nesses casos; nunca inventar um nome quando
 * ausente. */
export type ClienteVeredito = { motivo: string; respondedAt: string; autorNome?: string };

/** Tira o sufixo "(i/N)" que `addEntregaUnidade`/`removeEntregaUnidade`
 * mantêm no título de cada unidade dividida, pra recuperar o título-base
 * comum ao grupo. */
function stripUnidadeSuffix(titulo?: string): string | undefined {
  if (!titulo) return titulo;
  const stripped = titulo.replace(/\s*\(\d+\/\d+\)$/, "").trim();
  return stripped || undefined;
}

function relabelGrupo(entregas: Entrega[], grupoId: string, baseTitulo?: string): Entrega[] {
  const grupo = entregas.filter((x) => x.grupoId === grupoId);
  const total = grupo.length;
  if (total <= 1) {
    return entregas.map((x) =>
      x.grupoId === grupoId ? { ...x, grupoId: undefined, titulo: baseTitulo } : x,
    );
  }
  const labels = new Map(
    grupo.map((x, i) => [x.id, `${baseTitulo ? baseTitulo + " " : ""}(${i + 1}/${total})`]),
  );
  return entregas.map((x) => (labels.has(x.id) ? { ...x, titulo: labels.get(x.id) } : x));
}

/** Divide uma entrega multi-unidade em unidades independentes — cada uma
 * com seu próprio ciclo de aprovação (roteiro/conteúdo/publicação), em vez
 * de um `quantidade` só que faz o cliente aprovar/reprovar tudo junto.
 * Chamada repetidamente (uma unidade por clique) a partir da entrega
 * "origem": a 1ª chamada transforma a origem + 1 nova unidade num grupo
 * de 2; chamadas seguintes acrescentam mais uma unidade fresca (sem
 * anexos, estágio inicial) ao mesmo grupo. */
export function addEntregaUnidade(entregas: Entrega[], e: Entrega): Entrega[] {
  const grupoId = e.grupoId ?? crypto.randomUUID();
  const baseTitulo = stripUnidadeSuffix(e.titulo);
  const nova: Entrega = {
    id: crypto.randomUUID(),
    tipo: e.tipo,
    titulo: baseTitulo,
    quantidade: 1,
    grupoId,
    status: "combinado",
    stage: "ROTEIRO_PRODUCAO",
  };
  const withGrupo = entregas.map((x) => (x.id === e.id ? { ...x, grupoId } : x));
  return relabelGrupo([...withGrupo, nova], grupoId, baseTitulo);
}

/** Remove a última unidade de um grupo dividido — nunca uma unidade que
 * já tem progresso (anexo enviado ou saiu do estágio inicial), pra nunca
 * apagar trabalho já feito silenciosamente. Retorna `null` quando `e` não
 * faz parte de um grupo (nada a fazer). */
export function removeEntregaUnidade(
  entregas: Entrega[],
  e: Entrega,
): { next: Entrega[]; blocked?: string } | null {
  if (!e.grupoId) return null;
  const grupo = entregas.filter((x) => x.grupoId === e.grupoId);
  if (grupo.length <= 1) return null;
  const ultima = grupo[grupo.length - 1];
  const temProgresso = (ultima.anexos?.length ?? 0) > 0 || ultima.stage !== "ROTEIRO_PRODUCAO";
  if (temProgresso) {
    return {
      next: entregas,
      blocked: `A última unidade (${ultima.titulo ?? ultima.tipo}) já tem progresso — remova-a manualmente pela lista de entregas.`,
    };
  }
  const semUltima = entregas.filter((x) => x.id !== ultima.id);
  const baseTitulo = stripUnidadeSuffix(e.titulo);
  return { next: relabelGrupo(semUltima, e.grupoId, baseTitulo) };
}

/** Anexos da versão mais recente de uma categoria — os arquivos IRMÃOS
 * que hoje aparecem juntos no portal como "Story 1/2/3", mas que
 * compartilham um único veredito de aprovação por serem uma entrega só. */
function currentVersionAnexos(
  anexos: EntregaAnexo[],
  categoria: EntregaAnexoCategoria,
): EntregaAnexo[] {
  const daCategoria = anexos.filter((a) => a.categoria === categoria);
  if (daCategoria.length === 0) return [];
  const maxVersao = daCategoria.reduce((max, a) => Math.max(max, a.versao ?? 1), 0);
  return daCategoria.filter((a) => (a.versao ?? 1) === maxVersao);
}

/** Divide uma entrega JÁ EXISTENTE, com vários arquivos irmãos enviados
 * juntos (ex: "3 Storys" com 3 anexos de conteúdo final na mesma versão),
 * em N entregas independentes — uma por arquivo, cada uma com seu próprio
 * estágio a partir de agora, pra poder ser aprovada/ajustada separado.
 * Diferente de `addEntregaUnidade` (que cria unidades vazias do zero),
 * esta reaproveita os anexos que o influenciador já subiu. Preserva
 * `stage`/`status`/reprovações atuais em todas as unidades (o veredito
 * era compartilhado até aqui) e mantém o `id` da entrega original na 1ª
 * unidade, pra não perder a seleção/histórico ligado a ele. Retorna
 * `null` quando não há o que dividir (0 ou 1 arquivo na versão atual). */
export function splitEntregaExistente(e: Entrega): Entrega[] | null {
  const anexos = e.anexos ?? [];
  const conteudoAtual = currentVersionAnexos(anexos, "Conteúdo final");
  const roteiroAtual = currentVersionAnexos(anexos, "Roteiro");
  const usandoConteudo = conteudoAtual.length > 1;
  const unidades = usandoConteudo ? conteudoAtual : roteiroAtual.length > 1 ? roteiroAtual : [];
  if (unidades.length <= 1) return null;

  const total = unidades.length;
  const idsUsados = new Set(unidades.map((a) => a.id));
  const outrosAnexos = anexos.filter((a) => !idsUsados.has(a.id));
  const roteiroPorUnidade = usandoConteudo && roteiroAtual.length === total;
  const grupoId = crypto.randomUUID();
  const baseTitulo = stripUnidadeSuffix(e.titulo);

  return unidades.map((anexoUnidade, i) => {
    const anexosDaUnidade: EntregaAnexo[] = usandoConteudo
      ? roteiroPorUnidade
        ? [anexoUnidade, roteiroAtual[i]]
        : i === 0
          ? [anexoUnidade, ...roteiroAtual]
          : [anexoUnidade]
      : [anexoUnidade];
    return {
      ...e,
      id: i === 0 ? e.id : crypto.randomUUID(),
      grupoId,
      titulo: `${baseTitulo ? baseTitulo + " " : ""}(${i + 1}/${total})`,
      quantidade: 1,
      anexos: i === 0 ? [...anexosDaUnidade, ...outrosAnexos] : anexosDaUnidade,
    };
  });
}

export type BankInfo = {
  banco?: string;
  agencia?: string;
  conta?: string;
  tipoConta?: "corrente" | "poupanca" | "";
  titular?: string;
  cpfCnpj?: string;
  pixTipo?: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria" | "";
  pixChave?: string;
};

/**
 * Publicar uma entrega só é permitido a partir de "Aprovado" — evita
 * marcar conteúdo no ar antes da aprovação do perfil. Produção não é
 * mais um valor manual de `InfluStatus` (ver comentário no topo de
 * `campanha-status.ts`): uma vez aprovado, o progresso de cada entrega é
 * sempre lido direto dela mesma (`producaoResumo` abaixo, ou a aba
 * "Entregas" do perfil), nunca mais precisa avançar o influenciador pra
 * um status à parte.
 */
export function canPublishEntrega(status: InfluStatus): boolean {
  return status === "APROVADO";
}

export type ProducaoResumo = { total: number; publicadas: number };

/** Resumo de progresso de produção de um influenciador — leitura pura a
 * partir das entregas dele, nunca gravada em `Influ.status`. Usado só
 * pra exibir uma legenda tipo "2/3 publicadas" no card do influenciador
 * aprovado; o detalhe de cada entrega vive na aba "Entregas" do perfil. */
export function producaoResumo(entregas: Entrega[]): ProducaoResumo {
  return {
    total: entregas.length,
    publicadas: entregas.filter((e) => e.stage === "PUBLICADA").length,
  };
}

export const NICHOS = [
  "Moda",
  "Beleza",
  "Fitness",
  "Games",
  "Humor",
  "Lifestyle",
  "Tecnologia",
  "Gastronomia",
  "Viagem",
  "Negócios",
  "Educação",
  "Família",
  "Pets",
  "Outro",
] as const;

export type ChecklistItem = { id: string; text: string; done: boolean };

/** Anexo com armazenamento permanente de verdade — refaz o "PDF quebrado"
 * da Página de Inscrição (antes: só uma URL assinada de 1 ano, jogada
 * como texto dentro de `observacoes`, sem nenhuma chave permanente de
 * Storage pra regenerar depois que expira). `storagePath` é a chave real;
 * a URL de visualização/download é sempre gerada sob demanda
 * (`getInfluAttachmentUrl`), nunca persistida aqui. */
export type InfluAttachment = {
  id: string;
  name: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  storagePath: string;
  bucket: "entrega-anexos";
  checksum: string;
  source: "inscricao_page";
  uploadedAt: string;
  /** `true` só depois de uma checagem confirmar que o arquivo sumiu do
   * Storage — nunca assumido, sempre verificado (pedido: "não fingir que
   * está disponível"). */
  unavailable?: boolean;
};

export type Influ = {
  id: string;
  foto?: string;
  nome: string;
  nicho?: string;
  telefone?: string;
  email?: string;
  redes: Rede[];
  entregas: Entrega[];
  profileMetrics?: ProfileMetrics;
  contrato?: string;
  /** Nome do arquivo do contrato (aditivo: contratos antigos, em data URL, não têm). */
  contratoNome?: string;
  status: InfluStatus;
  statusUpdatedAt?: string; // data em que o status atual foi definido (p/ SLA de aprovação)
  bank?: BankInfo;
  comments?: InfluComment[];
  /** Comentários do CLIENTE no portal, sobre a participação deste
   * influenciador na campanha — canal separado de `comments` (que é
   * conversa INTERNA do time, nunca deve ser exposta ao portal). Mesma
   * forma de `InfluComment`, append-only (nunca sobrescreve um comentário
   * anterior). */
  clienteComments?: InfluComment[];
  activity?: InfluActivity[];
  /** Histórico tipado (decisão 1 da reformulação do Portal do Cliente) —
   * ver comentário acima de `InfluActivityEvent`. */
  activityEvents?: InfluActivityEvent[];
  /** "Por que este influenciador?" — justificativa estratégica da escolha
   * pra ESTA campanha. Fonte única do motivo: vive na linha de
   * `campanha_influenciadores` (relação campanha ↔ influenciador, nunca no
   * banco global), é editada aqui pelo time e mostrada ao cliente no portal
   * como "Por que escolhemos este influenciador?" (`cliente-link.functions.ts`
   * a inclui no mapeamento público). */
  justificativaTime?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Checklist livre do influenciador (texto qualquer, marcar feito) — pode
   * ser aplicado de um influ pros outros todos da campanha de uma vez. */
  checklist?: ChecklistItem[];
  /** Preenchido quando o cliente reprova a seleção deste influ pelo link
   * público (`status` vira RECUSADO junto) — motivo fica aqui pro time ver
   * antes de reenviar (mudar o status manualmente já limpa este campo). */
  clienteReprovacao?: ClienteVeredito;
  /** Carimbo da última ação do cliente (em qualquer etapa — seleção,
   * roteiro ou conteúdo de alguma entrega), pro sino de notificações do
   * time detectar "aconteceu uma ação nova agora" sem precisar diffar
   * status de negócio. */
  lastClientAction?: {
    kind: "influ" | "roteiro" | "conteudo";
    entregaId?: string;
    status: "aprovado" | "reprovado";
    at: string;
  };
  /** Instruções específicas pra este influenciador (diferente do briefing
   * geral da campanha, em `Campaign.briefing`) — mostrado no portal do
   * cliente, no perfil do influenciador. */
  briefingPersonalizado?: string;
  /** Anexo único do briefing personalizado (pode ser adicionado pelo time
   * ou pelo cliente, pelo portal). */
  briefingAnexoNome?: string;
  briefingAnexoUrl?: string;
  /** Observação livre sobre o influenciador — visível tanto internamente
   * quanto no portal do cliente (diferente de `comments`/`activity`, que
   * ficam só internos). */
  observacoes?: string;
  /** Pagamento único cobrindo TODAS as entregas do influenciador — não é
   * mais configurado por entrega individual. */
  pagamento?: PagamentoEntrega;
  /** Marca que este influenciador entrou pela Página de Inscrição pública
   * da campanha (em vez de cadastro manual pelo time) — usado só pras
   * métricas da página (`src/lib/inscricao-page.ts`). */
  submittedVia?: "inscricao_page";
  /** Respostas das perguntas personalizadas da Página de Inscrição, no
   * momento da inscrição — snapshot (sobrevive a mudanças futuras nas
   * perguntas da campanha). O time vê isso sem precisar abrir a página
   * pública. `fieldType`/`submittedAt` ausentes = resposta salva antes
   * desta rodada (renderiza como texto simples, sem quebrar). */
  inscricaoRespostas?: {
    questionId: string;
    label: string;
    value: string | string[];
    fieldType?: CustomQuestionType;
    submittedAt?: string;
  }[];
  /** Mensagem livre do candidato, enviada junto da inscrição — SEPARADA
   * de `observacoes` (que a partir desta rodada é só texto escrito
   * manualmente pelo time; antes, a mensagem e o link do mídia kit eram
   * concatenados ali, misturando dado enviado com anotação interna). */
  inscricaoMensagem?: string;
  /** Mídia kit e outros arquivos enviados na própria inscrição — nunca
   * mais só um link de texto dentro de `observacoes`. */
  midiaKit?: InfluAttachment[];
  /** Metadados de quando/como a inscrição chegou — nunca editado depois. */
  inscricaoMeta?: { submittedAt: string; origin: "inscricao_page"; formVersion: string };
  /** Cópia somente-leitura do payload validado exatamente como chegou —
   * "Ver inscrição original" (pedido: alterações posteriores no perfil
   * nunca alteram este snapshot). */
  inscricaoSnapshot?: Record<string, unknown>;
  /** Candidaturas com dados conflitantes (ex.: e-mail bate mas telefone
   * diferente) nunca são fundidas automaticamente — ficam sinalizadas
   * aqui pra revisão manual do time. */
  duplicateReviewFlags?: { reason: string; detectedAt: string }[];
  /** Mês de referência (`"YYYY-MM"`) pra campanhas recorrentes — setado
   * pelo servidor no momento da inscrição, a partir do "Mês de
   * referência" configurado na Página de Inscrição (nunca vem direto do
   * formulário público). Usado por `CampanhasSection.tsx` pra decidir em
   * qual mês do kanban esse influenciador aparece, em vez de depender do
   * timing exato de `createdAt`. Ausente em entradas manuais/antigas.
   * @deprecated Mantido só por compatibilidade de leitura de registros
   * antigos — `campaignCycleId` é a relação real (`campaign_cycles`) e
   * deve ser preenchido em toda participação nova. */
  cicloMes?: string;
  /** Referência real (`campaign_cycles.id`) ao ciclo/mês operacional desta
   * participação, pra campanhas recorrentes. Persistida numa coluna de
   * verdade (não dentro deste JSONB) — ver `campanha-scoped-store.ts` — pra
   * dar pra filtrar/indexar por ela em SQL. `undefined`/`null` significa
   * "sem ciclo atribuído ainda": nunca inferir um a partir de `createdAt`
   * ou de `cicloMes`; fica pendente de atribuição manual pelo time (ver
   * a view `campanha_influenciadores_sem_ciclo`). */
  campaignCycleId?: string | null;
};

/**
 * Normalizes influencer records loaded from localStorage: migrates the
 * old separate `conteudos` list (pre-unification) into `entregas` with
 * `status: "publicado"`, backfills `status` on legacy entregas that
 * predate the field, and migrates the old freestanding `valores` list
 * (pre payment-per-entrega) into synthetic "Pagamento avulso" entregas
 * with `pagamento.aprovacao: "aceito"` (historical payments were real
 * money already reflected in Financeiro — migrating keeps that history
 * intact under the new model). Safe to run on already-migrated data.
 */
export function normalizeInflus(list: unknown): Influ[] {
  if (!Array.isArray(list)) return [];
  return list.map((raw) => {
    const r = raw as Influ & {
      conteudos?: Array<Record<string, unknown>>;
      valores?: Array<{ id: string; valor: string; quando: string }>;
    };
    const entregasComPagamentoLegado: Array<Entrega & { pagamento?: PagamentoEntrega }> =
      r.entregas ?? [];
    const entregas: Entrega[] = entregasComPagamentoLegado.map((e) => {
      const anexos = (e.anexos ?? []).map((a) => ({
        ...a,
        categoria: legacyAnexoCategoria(a.categoria),
      }));
      const legacy = e as Entrega & {
        roteiro?: string;
        roteiroNome?: string;
        arquivoNome?: string;
        conteudoStatus?: string;
        etapa?: string;
      };
      if (legacy.roteiro) {
        anexos.push({
          id: `${e.id}-mig-roteiro`,
          categoria: "Roteiro",
          nome: legacy.roteiroNome || "Roteiro",
          url: legacy.roteiro,
        });
      }
      if (e.url && legacy.arquivoNome) {
        anexos.push({
          id: `${e.id}-mig-publicado`,
          categoria: "Conteúdo final",
          nome: legacy.arquivoNome,
          url: e.url,
        });
      }
      const status = e.status ?? "combinado";
      // Defesa em profundidade: o backfill já reescreveu `stage` de verdade
      // no banco pra todo mundo, mas se alguma linha antiga escapar (ou o
      // dado vier de um snapshot velho em cache), essa tradução garante que
      // a UI nunca vê um campo ausente/status texto-livre antiquíssimo.
      const stage =
        e.stage ??
        migrateLegacyEntregaStage(
          legacy.conteudoStatus ?? (status === "publicado" ? "Postado" : "Combinado"),
          legacy.etapa,
        );
      return {
        ...e,
        status,
        stage,
        anexos,
        // Quando `url` era o próprio anexo (arquivoNome setado), o link vira
        // o anexo acima — não faz mais sentido manter os dois.
        url: legacy.arquivoNome ? undefined : e.url,
        pagamento: undefined,
      };
    });
    for (const c of r.conteudos ?? []) {
      const id = (c.id as string) ?? crypto.randomUUID();
      const url = c.url as string | undefined;
      const arquivoNome = c.arquivoNome as string | undefined;
      entregas.push({
        id,
        tipo: c.tipo === "anexo" ? "Anexo" : "Link",
        titulo: c.titulo as string | undefined,
        quantidade: 1,
        status: "publicado",
        stage: "PUBLICADA",
        // Quando `url` era o próprio anexo (arquivoNome setado), vira um
        // anexo de verdade em vez de ficar como link solto.
        url: arquivoNome ? undefined : url,
        anexos:
          url && arquivoNome
            ? [{ id: `${id}-mig-publicado`, categoria: "Conteúdo final", nome: arquivoNome, url }]
            : undefined,
        publicadoEm: c.criadoEm as string | undefined,
        metrics: c.metrics as PostMetrics | undefined,
      });
    }
    // Pagamento passou a ser um valor único por influenciador (não mais por
    // entrega) — quem já tinha valores em `valores` (avulsos, pré-entrega) ou
    // em `entregas[].pagamento` (pré-unificação) tem esse histórico somado
    // aqui num único `pagamento`, preservando o total já refletido no
    // Financeiro, em vez de perder o dado na migração.
    let pagamento = r.pagamento;
    if (!pagamento) {
      const legado = [
        ...(r.valores ?? []).map((v) => ({
          valor: parseMoney(v.valor),
          aceito: true,
          data: v.quando,
        })),
        ...entregasComPagamentoLegado
          .filter((e) => e.pagamento)
          .map((e) => ({
            valor: pagamentoCashValue(e.pagamento),
            aceito: e.pagamento?.aprovacao === "aceito",
            data: e.pagamento?.data,
          })),
      ];
      const totalAceitoLegado = legado.filter((x) => x.aceito).reduce((s, x) => s + x.valor, 0);
      if (totalAceitoLegado > 0) {
        const lastData = legado
          .map((x) => x.data)
          .filter((d): d is string => !!d)
          .sort()
          .pop();
        pagamento = {
          tipos: ["Valor"],
          config: { Valor: { valor: String(totalAceitoLegado) } },
          aprovacao: "aceito",
          data: lastData,
        };
      }
    }
    const { conteudos: _drop, valores: _drop2, ...rest } = r;
    const status = legacyInfluStatus(rest.status, { hasReprovacao: !!rest.clienteReprovacao });
    return { ...rest, status, entregas, pagamento };
  });
}

/** @deprecated Mantido só pra compatibilidade de import — usar
 * `PLATAFORMAS` de `@/lib/social-profiles`, que já é a mesma lista com
 * placeholder/tipo de campo por plataforma. */
export const REDES_OPTS = PLATAFORMAS.map((p) => p.key) as string[];
export type InfluencerFieldKey =
  | "redes"
  | "entregas"
  | "pagamentos"
  | "bancario"
  | "contrato"
  | "status"
  | "metricas";

export const INFLUENCER_FIELDS: { key: InfluencerFieldKey; label: string; hint: string }[] = [
  {
    key: "redes",
    label: "Redes sociais",
    hint: "Instagram, TikTok, YouTube e outras, com handle.",
  },
  {
    key: "metricas",
    label: "Métricas do perfil",
    hint: "Seguidores, interações, alcance e demografia do público, com gráficos.",
  },
  {
    key: "entregas",
    label: "Entregas",
    hint: "Combinado até publicado — formato, data de postagem, roteiro e métricas em um só lugar.",
  },
  { key: "pagamentos", label: "Pagamentos", hint: "Valor e data de cada parcela paga." },
  { key: "bancario", label: "Dados bancários", hint: "Conta e chave PIX para pagamento." },
  { key: "contrato", label: "Contrato", hint: "Upload do contrato assinado." },
  { key: "status", label: "Status do fluxo", hint: "Lista, aprovação, gravação, postado, pago..." },
];
export const ALL_INFLUENCER_FIELDS: InfluencerFieldKey[] = INFLUENCER_FIELDS.map((f) => f.key);
export const DEFAULT_INFLUENCER_FIELDS: InfluencerFieldKey[] = ["redes", "entregas", "status"];

/* Helpers numéricos/de data usados pelo modelo */
export function parseMoney(s?: string): number {
  if (!s) return 0;
  const cleaned = s
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

export const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const fmtDate = (d: string) => {
  if (!d) return "—";
  // new Date("2026-08-05") parses as UTC midnight, which renders as the
  // previous day in timezones behind UTC (e.g. Brazil) — parse as local time.
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString("pt-BR");
};
// `toISOString().slice(0, 10)` pega o dia em UTC — sempre segue horário de
// Brasília (UTC-3), nunca UTC.
export const todayISO = () => formatDateToIso(new Date());
