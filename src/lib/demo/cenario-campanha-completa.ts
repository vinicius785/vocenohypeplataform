import type { Campaign } from "@/components/VincularCampanhaDialog";
import type { Task } from "@/components/tasks/TaskBoard";
import type { CampaignDoc, CronogramaItem } from "@/lib/campanha-scoped-store";
import type { EntregaStage, InfluStatus } from "@/lib/campanha-status";
import type {
  Entrega,
  EntregaAnexo,
  Influ,
  InfluActivity,
  InfluActivityEvent,
  InfluActivityEventKind,
  InfluComment,
  PostMetrics,
  ProfileMetrics,
  Rede,
} from "@/lib/influencer-model";

/**
 * Cenário "campanha completa" da Demo — função PURA e DETERMINÍSTICA.
 *
 * `buildDemoScenario` não lê banco, relógio nem aleatoriedade: tudo vem dos argumentos.
 * Mesmos `sessionId` + `now` ⇒ mesmo conteúdo e mesmos ids (reiniciar a demo recria
 * exatamente o cenário inicial). Datas são relativas a `now`, então a demo sempre parece
 * atual. Nenhum nome, perfil, valor ou arquivo vem de dado real: tudo aqui é fictício.
 *
 * Sem valores financeiros de propósito: a campanha é `semFaturamento` e nenhum influenciador
 * tem `pagamento` — mesmo que a demo vazasse para um agregado, não geraria receita nem custo.
 */

// ---------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------

export type DemoAssetKind = "pdf" | "png";
export type DemoAssetBucket = "entrega-anexos" | "relatorios-mensais";

/** Arquivo de exemplo que a criação da demo precisa publicar no storage. */
export type DemoAssetSpec = {
  key: string;
  kind: DemoAssetKind;
  bucket: DemoAssetBucket;
  /** Caminho dentro do bucket — sempre sob `demo/<sessionId>/`. */
  path: string;
  fileName: string;
  title: string;
  lines: string[];
};

export type DemoRow<T> = { id: string; data: T };

export type DemoClienteData = {
  id: string;
  empresa: string;
  responsavel: string;
  responsavelInterno: string;
  email: string;
  whatsapp: string;
  clienteDesde: string;
  campanhas: Campaign[];
  status: "active";
  /** Marcador imutável de demo (guarda de banco `clientes_demo_marker_guard`). */
  demoSessionId: string;
};

export type DemoScenarioPayload = {
  cliente: DemoClienteData;
  influenciadores: DemoRow<Influ>[];
  tarefas: DemoRow<Task>[];
  documentos: DemoRow<CampaignDoc>[];
  cronograma: DemoRow<CronogramaItem>[];
};

export type DemoScenarioSummary = {
  influenciadoresPorStatus: Record<InfluStatus, number>;
  entregasPorEstagio: Partial<Record<EntregaStage, number>>;
  totalEntregas: number;
  tarefas: number;
  documentos: number;
  cronograma: number;
  relatorios: number;
  assets: number;
};

export type DemoScenario = {
  payload: DemoScenarioPayload;
  assetSpecs: DemoAssetSpec[];
  summary: DemoScenarioSummary;
};

export type BuildDemoScenarioInput = {
  sessionId: string;
  clienteId: string;
  campanhaId: string;
  now: Date;
  /** Nome da empresa do lead (o cliente de demonstração leva o nome do prospect). */
  empresa: string;
  responsavel?: string;
  /** URL (assinada) do arquivo de exemplo; na 1ª passada (só para listar os assets) pode
   * devolver qualquer texto. */
  assetUrl: (spec: DemoAssetSpec) => string;
};

export const DEMO_SCENARIO_ID = "campanha-completa";
export const DEMO_SEED_VERSION = 1;

// ---------------------------------------------------------------------------------------
// Ids determinísticos
// ---------------------------------------------------------------------------------------

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** UUID (formato v5) derivado de `namespace` + `name` — não criptográfico, só estável. */
export function demoUuid(namespace: string, name: string): string {
  const hex = cyrb128(`${namespace}::${name}`)
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("");
  const variant = ["8", "9", "a", "b"][parseInt(hex[16], 16) & 3];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const demoClienteId = (sessionId: string) => demoUuid(sessionId, "cliente");
export const demoCampanhaId = (sessionId: string) => demoUuid(sessionId, "campanha");

// ---------------------------------------------------------------------------------------
// Datas relativas (horário de Brasília, UTC-3 — mesmo critério de `formatDateToIso`)
// ---------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const BRT_OFFSET_MS = 3 * 3_600_000;

function clock(now: Date) {
  const wall = (daysFromNow: number) =>
    new Date(now.getTime() - BRT_OFFSET_MS + daysFromNow * DAY_MS);
  return {
    /** `YYYY-MM-DD` de hoje + `days`. */
    ymd: (days: number) => wall(days).toISOString().slice(0, 10),
    /** Instante ISO de (hoje + `days`) às `hour:minute` de Brasília. */
    at: (days: number, hour = 10, minute = 0) => {
      const w = wall(days);
      return new Date(
        Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), hour, minute) + BRT_OFFSET_MS,
      ).toISOString();
    },
    /** Mês (`YYYY-MM`) anterior ao de hoje. */
    previousMonth: () => {
      const w = wall(0);
      const y = w.getUTCMonth() === 0 ? w.getUTCFullYear() - 1 : w.getUTCFullYear();
      const m = w.getUTCMonth() === 0 ? 12 : w.getUTCMonth();
      return `${y}-${String(m).padStart(2, "0")}`;
    },
  };
}

// ---------------------------------------------------------------------------------------
// Atores do histórico
// ---------------------------------------------------------------------------------------

const TIME = {
  type: "equipe" as const,
  name: "Equipe VNH",
  initials: "VN",
  color: "bg-foreground text-background",
};
const CLIENTE = {
  type: "cliente" as const,
  name: "Cliente (demonstração)",
  initials: "CD",
  color: "bg-slate-500 text-white",
};

type Actor = typeof TIME | typeof CLIENTE;

// ---------------------------------------------------------------------------------------
// Elenco (100% fictício; handles terminam em `.demo`)
// ---------------------------------------------------------------------------------------

type EntregaPlan = {
  key: string;
  tipo: string;
  titulo: string;
  quantidade: number;
  stage: EntregaStage;
  /** Dias (a partir de hoje) até a postagem combinada. */
  postaEm: number;
  roteiroEnviadoHa: number;
  roteiroDecisao?: { ha: number; resultado: "aprovado" | "ajustes"; motivo?: string };
  conteudoEnviadoHa?: number;
  conteudoDecisao?: { ha: number; resultado: "aprovado" | "ajustes"; motivo?: string };
  publicadoHa?: number;
  url?: string;
  metrics?: PostMetrics;
};

type CastPlan = {
  key: string;
  nome: string;
  handle: string;
  nicho: string;
  seguidores: string;
  status: InfluStatus;
  justificativa: string;
  /** Dias atrás em que o perfil foi enviado ao cliente (quando enviado). */
  enviadoHa?: number;
  decisaoHa?: number;
  recusa?: { motivoLabel: string; comentario: string };
  entregas: EntregaPlan[];
  perfil: { interacoes: number; visualizacoes: number; taxaInteracao: number; atencao: number };
  clienteComentario?: { ha: number; texto: string };
  equipeComentario?: { ha: number; texto: string };
};

const CAST: CastPlan[] = [
  {
    key: "mariana",
    nome: "Mariana Alves",
    handle: "@mariana.alves.demo",
    nicho: "Viagem e lifestyle",
    seguidores: "214 mil",
    status: "ENVIADO_AO_CLIENTE",
    justificativa:
      "Audiência de viajantes de lazer com alto interesse em resorts, e histórico de conteúdo de destino com ótima retenção.",
    enviadoHa: 1,
    entregas: [],
    perfil: { interacoes: 18200, visualizacoes: 412000, taxaInteracao: 4.4, atencao: 61 },
  },
  {
    key: "rafael",
    nome: "Rafael Monteiro",
    handle: "@rafael.monteiro.demo",
    nicho: "Gastronomia e turismo",
    seguidores: "98 mil",
    status: "ENVIADO_AO_CLIENTE",
    justificativa:
      "Une gastronomia e viagem — complementa a proposta de experiência gastronômica do resort.",
    enviadoHa: 1,
    entregas: [],
    perfil: { interacoes: 9100, visualizacoes: 187000, taxaInteracao: 4.9, atencao: 58 },
  },
  {
    key: "camila",
    nome: "Camila Duarte",
    handle: "@camila.duarte.demo",
    nicho: "Fitness e bem-estar",
    seguidores: "88 mil",
    status: "APROVADO",
    justificativa:
      "Público engajado em bem-estar e escapadas de fim de semana — encaixa no posicionamento de descanso do resort.",
    enviadoHa: 14,
    decisaoHa: 13,
    clienteComentario: { ha: 9, texto: "Adoramos o tom do primeiro roteiro, bem natural!" },
    perfil: { interacoes: 11300, visualizacoes: 236000, taxaInteracao: 5.1, atencao: 64 },
    entregas: [
      {
        key: "camila-reels-abertura",
        tipo: "Reels",
        titulo: "Reels de abertura da campanha",
        quantidade: 1,
        stage: "ROTEIRO_APROVACAO",
        postaEm: 12,
        roteiroEnviadoHa: 1,
      },
      {
        key: "camila-stories-experiencia",
        tipo: "Stories",
        titulo: "Stories da experiência",
        quantidade: 3,
        stage: "PRODUCAO",
        postaEm: 10,
        roteiroEnviadoHa: 8,
        roteiroDecisao: { ha: 7, resultado: "aprovado" },
      },
      {
        key: "camila-reels-daypass",
        tipo: "Reels",
        titulo: "Reels do day use",
        quantidade: 1,
        stage: "CONTEUDO_APROVACAO",
        postaEm: 5,
        roteiroEnviadoHa: 11,
        roteiroDecisao: { ha: 10, resultado: "aprovado" },
        conteudoEnviadoHa: 1,
      },
      {
        key: "camila-carrossel-gastronomia",
        tipo: "Feed",
        titulo: "Carrossel de gastronomia",
        quantidade: 1,
        stage: "PUBLICADA",
        postaEm: -4,
        roteiroEnviadoHa: 13,
        roteiroDecisao: { ha: 12, resultado: "aprovado" },
        conteudoEnviadoHa: 8,
        conteudoDecisao: { ha: 7, resultado: "aprovado" },
        publicadoHa: 4,
        url: "https://example.com/demo/posts/camila-carrossel-gastronomia",
        metrics: {
          views: 48200,
          likes: 3910,
          comments: 214,
          shares: 388,
          saves: 702,
          reach: 36450,
        },
      },
      {
        key: "camila-reels-bastidores",
        tipo: "Reels",
        titulo: "Reels de bastidores",
        quantidade: 1,
        stage: "CONTEUDO_AJUSTES",
        postaEm: 7,
        roteiroEnviadoHa: 9,
        roteiroDecisao: { ha: 8, resultado: "aprovado" },
        conteudoEnviadoHa: 3,
        conteudoDecisao: {
          ha: 2,
          resultado: "ajustes",
          motivo:
            "Trocar a música de fundo e mostrar o logotipo do resort nos primeiros 3 segundos.",
        },
      },
    ],
  },
  {
    key: "lucas",
    nome: "Lucas Ferraz",
    handle: "@lucas.ferraz.demo",
    nicho: "Viagens em família",
    seguidores: "132 mil",
    status: "APROVADO",
    justificativa: "Foco em viagens com crianças — o público-alvo principal da campanha de verão.",
    enviadoHa: 14,
    decisaoHa: 12,
    equipeComentario: {
      ha: 6,
      texto: "Combinar com o Lucas o horário de postagem das Stories para a manhã.",
    },
    perfil: { interacoes: 14800, visualizacoes: 318000, taxaInteracao: 4.7, atencao: 59 },
    entregas: [
      {
        key: "lucas-reels-familia",
        tipo: "Reels",
        titulo: "Reels em família",
        quantidade: 1,
        stage: "ROTEIRO_APROVACAO",
        postaEm: 11,
        roteiroEnviadoHa: 1,
      },
      {
        key: "lucas-stories-cafe",
        tipo: "Stories",
        titulo: "Stories do café da manhã",
        quantidade: 3,
        stage: "ROTEIRO_AJUSTES",
        postaEm: 9,
        roteiroEnviadoHa: 4,
        roteiroDecisao: {
          ha: 3,
          resultado: "ajustes",
          motivo: "Incluir a chamada para a promoção de verão no fim do roteiro.",
        },
      },
      {
        key: "lucas-feed-quarto",
        tipo: "Feed",
        titulo: "Feed — vista do quarto",
        quantidade: 1,
        stage: "CONTEUDO_APROVACAO",
        postaEm: 4,
        roteiroEnviadoHa: 10,
        roteiroDecisao: { ha: 9, resultado: "aprovado" },
        conteudoEnviadoHa: 1,
      },
      {
        key: "lucas-reels-piscina",
        tipo: "Reels",
        titulo: "Reels da piscina infinita",
        quantidade: 1,
        stage: "PUBLICADA",
        postaEm: -6,
        roteiroEnviadoHa: 13,
        roteiroDecisao: { ha: 12, resultado: "aprovado" },
        conteudoEnviadoHa: 9,
        conteudoDecisao: { ha: 8, resultado: "aprovado" },
        publicadoHa: 6,
        url: "https://example.com/demo/posts/lucas-reels-piscina",
        metrics: {
          views: 91300,
          likes: 6120,
          comments: 389,
          shares: 744,
          saves: 1210,
          reach: 70200,
        },
      },
    ],
  },
  {
    key: "beatriz",
    nome: "Beatriz Costa",
    handle: "@beatriz.costa.demo",
    nicho: "Moda praia",
    seguidores: "176 mil",
    status: "RECUSADO",
    justificativa: "Grande alcance em moda praia e viagens de verão.",
    enviadoHa: 6,
    decisaoHa: 5,
    recusa: {
      motivoLabel: "Público incompatível",
      comentario: "O público dela é mais jovem do que o que buscamos para este resort.",
    },
    equipeComentario: {
      ha: 5,
      texto: "Perfil recusado por faixa etária — vale enviar uma alternativa da curadoria.",
    },
    entregas: [],
    perfil: { interacoes: 15900, visualizacoes: 355000, taxaInteracao: 4.5, atencao: 55 },
  },
  {
    key: "thiago",
    nome: "Thiago Nunes",
    handle: "@thiago.nunes.demo",
    nicho: "Aventura e ecoturismo",
    seguidores: "64 mil",
    status: "EM_CURADORIA",
    justificativa:
      "Público de 30 a 45 anos interessado em experiências na natureza — aderente ao perfil que o cliente descreveu.",
    entregas: [],
    perfil: { interacoes: 7200, visualizacoes: 141000, taxaInteracao: 5.3, atencao: 63 },
  },
  {
    key: "julia",
    nome: "Julia Prado",
    handle: "@julia.prado.demo",
    nicho: "Lifestyle e decoração",
    seguidores: "121 mil",
    status: "EM_CURADORIA",
    justificativa:
      "Audiência feminina de 28 a 40 anos, forte em conteúdo de hospedagem e design de interiores.",
    entregas: [],
    perfil: { interacoes: 10400, visualizacoes: 224000, taxaInteracao: 4.6, atencao: 60 },
  },
];

// ---------------------------------------------------------------------------------------
// Construção
// ---------------------------------------------------------------------------------------

type Timeline = {
  events: InfluActivityEvent[];
  activity: InfluActivity[];
};

export function buildDemoScenario(input: BuildDemoScenarioInput): DemoScenario {
  const { sessionId, clienteId, campanhaId, now } = input;
  const c = clock(now);
  const id = (name: string) => demoUuid(sessionId, name);
  const assetSpecs = new Map<string, DemoAssetSpec>();

  const registerAsset = (
    key: string,
    kind: DemoAssetKind,
    bucket: DemoAssetBucket,
    title: string,
    lines: string[],
  ): DemoAssetSpec => {
    const safe = key.replace(/[^a-z0-9-]/gi, "-");
    const fileName = `${safe}.${kind}`;
    const spec: DemoAssetSpec = {
      key,
      kind,
      bucket,
      path: `demo/${sessionId}/${fileName}`,
      fileName,
      title,
      lines,
    };
    assetSpecs.set(key, spec);
    return spec;
  };

  // --- Influenciadores -------------------------------------------------------------
  const influenciadores: DemoRow<Influ>[] = CAST.map((p) => {
    const influId = id(`influ:${p.key}`);
    const redeId = id(`rede:${p.key}`);
    const rede: Rede = {
      id: redeId,
      plataforma: "Instagram",
      handle: p.handle,
      seguidores: p.seguidores,
      isPrimary: true,
      order: 0,
    };

    const tl: Timeline = { events: [], activity: [] };
    const push = (
      kind: InfluActivityEventKind,
      actor: Actor,
      iso: string,
      action: string,
      fields: Partial<InfluActivityEvent> = {},
    ) => {
      const evId = id(`evt:${p.key}:${tl.events.length}`);
      tl.events.push({
        id: evId,
        kind,
        actor: { type: actor.type, name: actor.name, initials: actor.initials, color: actor.color },
        createdAt: iso,
        ...fields,
      });
      tl.activity.push({
        id: id(`act:${p.key}:${tl.activity.length}`),
        author: actor.name,
        initials: actor.initials,
        color: actor.color,
        action,
        entregaId: fields.entregaId,
        createdAt: iso,
      });
    };

    // Perfil enviado / decidido
    if (p.enviadoHa !== undefined) {
      push(
        "perfil_enviado",
        TIME,
        c.at(-p.enviadoHa, 9, 30),
        "enviou o perfil pra aprovação do cliente",
        { statusAnterior: "EM_CURADORIA", statusNovo: "ENVIADO_AO_CLIENTE" },
      );
    }
    if (p.status === "APROVADO" && p.decisaoHa !== undefined) {
      push(
        "perfil_aprovado",
        CLIENTE,
        c.at(-p.decisaoHa, 15, 10),
        "aprovou a seleção pra campanha",
        {
          statusAnterior: "ENVIADO_AO_CLIENTE",
          statusNovo: "APROVADO",
        },
      );
    }
    if (p.status === "RECUSADO" && p.decisaoHa !== undefined && p.recusa) {
      push(
        "perfil_recusado",
        CLIENTE,
        c.at(-p.decisaoHa, 16, 20),
        `reprovou a seleção pra campanha — ${p.recusa.motivoLabel}`,
        {
          statusAnterior: "ENVIADO_AO_CLIENTE",
          statusNovo: "RECUSADO",
          motivo: p.recusa.motivoLabel,
          motivoLabel: p.recusa.motivoLabel,
          comentario: p.recusa.comentario,
        },
      );
    }

    // Entregas
    const entregas: Entrega[] = p.entregas.map((e) => {
      const entregaId = id(`entrega:${e.key}`);
      const anexos: EntregaAnexo[] = [];

      const roteiro = registerAsset(
        `roteiro-${e.key}`,
        "pdf",
        "entrega-anexos",
        `Roteiro — ${e.titulo}`,
        [
          `Influenciador(a): ${p.nome} (${p.handle})`,
          `Entrega: ${e.tipo} · ${e.titulo}`,
          "",
          "Documento de EXEMPLO da demonstração — conteúdo fictício.",
          "1. Abertura: apresentar o destino em até 3 segundos.",
          "2. Desenvolvimento: mostrar a experiência com tom natural.",
          "3. Fechamento: chamada para a promoção de verão.",
        ],
      );
      anexos.push({
        id: id(`anexo:${e.key}:roteiro`),
        categoria: "Roteiro",
        nome: `Roteiro — ${e.titulo}.pdf`,
        url: input.assetUrl(roteiro),
        versao: 1,
        criadoEm: c.at(-e.roteiroEnviadoHa - 1, 11),
      });

      if (e.conteudoEnviadoHa !== undefined) {
        const conteudo = registerAsset(
          `conteudo-${e.key}`,
          "png",
          "entrega-anexos",
          `Conteúdo — ${e.titulo}`,
          [p.nome, e.titulo, "Imagem de exemplo"],
        );
        anexos.push({
          id: id(`anexo:${e.key}:conteudo`),
          categoria: "Conteúdo final",
          nome: `Conteúdo final — ${e.titulo}.png`,
          url: input.assetUrl(conteudo),
          versao: 1,
          criadoEm: c.at(-e.conteudoEnviadoHa - 1, 12),
        });
      }

      // Histórico coerente com o estágio
      push(
        "roteiro_enviado",
        TIME,
        c.at(-e.roteiroEnviadoHa, 10),
        "enviou o roteiro pra aprovação do cliente",
        {
          entregaId,
          versao: 1,
        },
      );
      if (e.roteiroDecisao) {
        const d = e.roteiroDecisao;
        push(
          d.resultado === "aprovado" ? "roteiro_aprovado" : "roteiro_ajustes_solicitados",
          CLIENTE,
          c.at(-d.ha, 14, 40),
          d.resultado === "aprovado"
            ? "aprovou o roteiro de uma entrega"
            : `solicitou ajustes em o roteiro de uma entrega — ${d.motivo}`,
          { entregaId, comentario: d.motivo },
        );
      }
      if (e.conteudoEnviadoHa !== undefined) {
        push(
          "conteudo_enviado",
          TIME,
          c.at(-e.conteudoEnviadoHa, 11, 15),
          "enviou o conteúdo final pra aprovação do cliente",
          { entregaId, versao: 1 },
        );
      }
      if (e.conteudoDecisao) {
        const d = e.conteudoDecisao;
        push(
          d.resultado === "aprovado" ? "conteudo_aprovado" : "conteudo_ajustes_solicitados",
          CLIENTE,
          c.at(-d.ha, 15, 5),
          d.resultado === "aprovado"
            ? "aprovou o conteúdo de uma entrega"
            : `solicitou ajustes em o conteúdo de uma entrega — ${d.motivo}`,
          { entregaId, comentario: d.motivo },
        );
      }
      if (e.publicadoHa !== undefined) {
        push("publicado", TIME, c.at(-e.publicadoHa, 18), "marcou como publicada", { entregaId });
      }

      const entrega: Entrega = {
        id: entregaId,
        tipo: e.tipo,
        titulo: e.titulo,
        quantidade: e.quantidade,
        status: e.stage === "PUBLICADA" ? "publicado" : "combinado",
        stage: e.stage,
        dataPostagem: c.ymd(e.postaEm),
        dataRecebimentoRoteiro:
          e.stage === "ROTEIRO_AJUSTES" ? undefined : c.ymd(-e.roteiroEnviadoHa - 1),
        dataRecebimentoConteudo:
          e.conteudoEnviadoHa !== undefined && e.stage !== "CONTEUDO_AJUSTES"
            ? c.ymd(-e.conteudoEnviadoHa - 1)
            : undefined,
        anexos,
        url: e.url,
        publicadoEm: e.publicadoHa !== undefined ? c.ymd(-e.publicadoHa) : undefined,
        metrics: e.metrics,
      };
      if (e.stage === "ROTEIRO_AJUSTES" && e.roteiroDecisao?.motivo) {
        entrega.roteiroReprovacao = {
          motivo: e.roteiroDecisao.motivo,
          respondedAt: c.at(-e.roteiroDecisao.ha, 14, 40),
          autorNome: CLIENTE.name,
        };
      }
      if (e.stage === "CONTEUDO_AJUSTES" && e.conteudoDecisao?.motivo) {
        entrega.conteudoReprovacao = {
          motivo: e.conteudoDecisao.motivo,
          respondedAt: c.at(-e.conteudoDecisao.ha, 15, 5),
          autorNome: CLIENTE.name,
        };
      }
      return entrega;
    });

    // Comentários
    const comments: InfluComment[] = p.equipeComentario
      ? [
          {
            id: id(`comment:${p.key}:equipe`),
            author: TIME.name,
            initials: TIME.initials,
            color: TIME.color,
            text: p.equipeComentario.texto,
            createdAt: c.at(-p.equipeComentario.ha, 17),
          },
        ]
      : [];
    const clienteComments: InfluComment[] = p.clienteComentario
      ? [
          {
            id: id(`comment:${p.key}:cliente`),
            author: CLIENTE.name,
            initials: CLIENTE.initials,
            color: CLIENTE.color,
            text: p.clienteComentario.texto,
            createdAt: c.at(-p.clienteComentario.ha, 16),
          },
        ]
      : [];
    if (p.clienteComentario) {
      tl.events.push({
        id: id(`evt:${p.key}:comentario`),
        kind: "comentario_cliente",
        actor: {
          type: "cliente",
          name: CLIENTE.name,
          initials: CLIENTE.initials,
          color: CLIENTE.color,
        },
        createdAt: c.at(-p.clienteComentario.ha, 16),
        comentario: p.clienteComentario.texto,
      });
    }
    if (p.equipeComentario) {
      tl.events.push({
        id: id(`evt:${p.key}:comentario-equipe`),
        kind: "comentario_equipe",
        actor: { type: "equipe", name: TIME.name, initials: TIME.initials, color: TIME.color },
        createdAt: c.at(-p.equipeComentario.ha, 17),
        comentario: p.equipeComentario.texto,
      });
    }

    const byTime = (a: { createdAt: string }, b: { createdAt: string }) =>
      a.createdAt.localeCompare(b.createdAt);
    const events = [...tl.events].sort(byTime);
    const activity = [...tl.activity].sort(byTime);

    // Última ação do cliente (para o sino/ordenação do time)
    const clientEvents = events.filter((ev) => ev.actor.type === "cliente");
    const last = clientEvents[clientEvents.length - 1];
    const lastClientAction: Influ["lastClientAction"] = (() => {
      if (!last) return undefined;
      const status = last.kind.endsWith("_aprovado")
        ? ("aprovado" as const)
        : last.kind.includes("recusado") || last.kind.includes("ajustes")
          ? ("reprovado" as const)
          : undefined;
      if (!status) return undefined;
      const kind = last.kind.startsWith("perfil")
        ? ("influ" as const)
        : last.kind.startsWith("roteiro")
          ? ("roteiro" as const)
          : ("conteudo" as const);
      return { kind, entregaId: last.entregaId, status, at: last.createdAt };
    })();

    const profileMetrics: ProfileMetrics = {
      porRede: {
        [redeId]: {
          interacoes: p.perfil.interacoes,
          visualizacoes: p.perfil.visualizacoes,
          taxaInteracao: p.perfil.taxaInteracao,
          taxaAtencaoInicial: p.perfil.atencao,
          genero: [
            { id: id(`demo:${p.key}:g1`), label: "Feminino", percentual: 68 },
            { id: id(`demo:${p.key}:g2`), label: "Masculino", percentual: 32 },
          ],
          faixaEtaria: [
            { id: id(`demo:${p.key}:f1`), label: "18-24", percentual: 21 },
            { id: id(`demo:${p.key}:f2`), label: "25-34", percentual: 44 },
            { id: id(`demo:${p.key}:f3`), label: "35-44", percentual: 26 },
            { id: id(`demo:${p.key}:f4`), label: "45+", percentual: 9 },
          ],
          cidades: [
            { id: id(`demo:${p.key}:c1`), label: "São Paulo", percentual: 34 },
            { id: id(`demo:${p.key}:c2`), label: "Rio de Janeiro", percentual: 19 },
            { id: id(`demo:${p.key}:c3`), label: "Belo Horizonte", percentual: 11 },
          ],
        },
      },
    };

    const createdAt = c.at(-(p.enviadoHa ?? 3) - 4, 9);
    const decidedAt =
      p.decisaoHa !== undefined
        ? c.at(-p.decisaoHa, 15)
        : p.enviadoHa !== undefined
          ? c.at(-p.enviadoHa, 9, 30)
          : createdAt;

    const data: Influ = {
      id: influId,
      nome: p.nome,
      nicho: p.nicho,
      redes: [rede],
      entregas,
      profileMetrics,
      status: p.status,
      statusUpdatedAt: decidedAt,
      comments,
      clienteComments,
      activity,
      activityEvents: events,
      justificativaTime: p.justificativa,
      createdAt,
      updatedAt: events[events.length - 1]?.createdAt ?? createdAt,
      lastClientAction,
      clienteReprovacao: p.recusa
        ? {
            motivo: `${p.recusa.motivoLabel} — ${p.recusa.comentario}`,
            respondedAt: c.at(-(p.decisaoHa ?? 5), 16, 20),
            autorNome: CLIENTE.name,
          }
        : undefined,
    };
    return { id: influId, data };
  });

  // --- Relatório mensal e documentos -----------------------------------------------
  const relatorioMes = c.previousMonth();
  const relatorio = registerAsset(
    "relatorio-mensal",
    "pdf",
    "relatorios-mensais",
    "Relatório mensal de métricas",
    [
      `Cliente: ${input.empresa}`,
      `Referência: ${relatorioMes}`,
      "",
      "Documento de EXEMPLO da demonstração — números fictícios.",
      "Alcance total: 106.650",
      "Visualizações: 139.500",
      "Interações: 11.973",
    ],
  );
  const briefing = registerAsset(
    "briefing-campanha",
    "pdf",
    "entrega-anexos",
    "Briefing da campanha",
    [
      `Cliente: ${input.empresa}`,
      "Campanha de Verão",
      "",
      "Documento de EXEMPLO da demonstração.",
      "Objetivo: gerar desejo de viagem e reservas para a temporada de verão.",
      "Tom de voz: leve, natural e acolhedor.",
    ],
  );
  const guia = registerAsset("guia-conteudo", "pdf", "entrega-anexos", "Guia de conteúdo", [
    "Boas práticas para os criadores — documento de EXEMPLO.",
    "Mostrar o destino de forma autêntica; evitar promessas de preço.",
  ]);

  const documentos: DemoRow<CampaignDoc>[] = [
    {
      id: id("doc:briefing"),
      data: {
        id: id("doc:briefing"),
        tipo: "anexo",
        titulo: "Briefing da campanha",
        url: input.assetUrl(briefing),
        arquivoNome: "Briefing da campanha.pdf",
        criadoEm: c.at(-20, 10),
      },
    },
    {
      id: id("doc:guia"),
      data: {
        id: id("doc:guia"),
        tipo: "anexo",
        titulo: "Guia de conteúdo para criadores",
        url: input.assetUrl(guia),
        arquivoNome: "Guia de conteúdo.pdf",
        criadoEm: c.at(-19, 10),
      },
    },
    {
      id: id("doc:referencias"),
      data: {
        id: id("doc:referencias"),
        tipo: "link",
        titulo: "Referências de estilo (exemplo)",
        url: "https://example.com/demo/referencias",
        criadoEm: c.at(-18, 10),
      },
    },
  ];

  // --- Cronograma -------------------------------------------------------------------
  const cron = (key: string, days: number, title: string, description: string) => ({
    id: id(`cron:${key}`),
    data: { id: id(`cron:${key}`), date: c.ymd(days), title, description } satisfies CronogramaItem,
  });
  const cronograma: DemoRow<CronogramaItem>[] = [
    cron("kickoff", -20, "Kick-off com o cliente", "Alinhamento de objetivos e briefing."),
    cron(
      "roteiros",
      -8,
      "Primeiros roteiros enviados",
      "Roteiros das primeiras entregas para aprovação.",
    ),
    cron(
      "aprovacoes",
      3,
      "Janela de aprovação de conteúdos",
      "Conteúdos finais aguardando aprovação do cliente.",
    ),
    cron("semana2", 9, "Publicações da semana 2", "Publicações combinadas com os criadores."),
    cron("relatorio", 24, "Relatório mensal de métricas", "Envio do relatório do mês ao cliente."),
  ];

  // --- Tarefas (sem responsável real e SEM a tag "Cliente") ------------------------------
  const task = (
    key: string,
    title: string,
    status: Task["status"],
    priority: Task["priority"],
    dueDays: number,
    createdDaysAgo: number,
    done = false,
  ): DemoRow<Task> => ({
    id: id(`task:${key}`),
    data: {
      id: id(`task:${key}`),
      title,
      status,
      priority,
      dueDate: c.ymd(dueDays),
      tags: ["Demonstração"],
      createdAt: c.at(-createdDaysAgo, 9),
      completedAt: done ? c.at(-Math.max(1, createdDaysAgo - 2), 17) : undefined,
    },
  });
  const tarefas: DemoRow<Task>[] = [
    task("briefing", "Fechar o briefing com o cliente", "Concluído", "Alta", -18, 20, true),
    task("finalistas", "Selecionar influenciadores finalistas", "Concluído", "Alta", -12, 16, true),
    task(
      "revisar-roteiros",
      "Revisar roteiros enviados ao cliente",
      "Em andamento",
      "Normal",
      2,
      6,
    ),
    task(
      "ajuste-stories",
      "Ajustar o roteiro das Stories do café da manhã",
      "Em ajustes",
      "Alta",
      1,
      3,
    ),
    task(
      "datas-postagem",
      "Confirmar datas de postagem com os criadores",
      "Aberto",
      "Normal",
      5,
      4,
    ),
    task("relatorio", "Preparar o relatório mensal de métricas", "Aberto", "Baixa", 20, 2),
  ];

  // --- Campanha e cliente -----------------------------------------------------------
  const planejado = [
    { tipo: "Digital", tamanho: "Micro", quantidade: 5 },
    { tipo: "Digital", tamanho: "Médio", quantidade: 4 },
  ];
  const campanha: Campaign = {
    id: campanhaId,
    nome: "Campanha de Verão",
    briefing:
      `Campanha de verão de ${input.empresa}: gerar desejo de viagem e reservas para a temporada, ` +
      "com criadores que mostrem a experiência de forma autêntica — descanso, gastronomia e lazer em família.",
    dataInicio: c.ymd(-20),
    prazo: c.ymd(25),
    linhas: planejado.map((l, i) => ({
      id: id(`linha:${i}`),
      tipo: l.tipo,
      tamanho: l.tamanho,
      quantidade: l.quantidade,
      enviar: l.quantidade,
    })),
    valorCliente: "",
    orcamento: "",
    pagTipos: [],
    pagConfig: { Valor: {}, "Por Hora": {}, Comissão: {}, Permuta: {}, Outro: {} },
    prazoPag: "",
    status: "active",
    clientVisible: true,
    semFaturamento: true,
    semFaturamentoMotivo: "Ambiente de demonstração — não gera receita.",
    relatoriosMensais: [
      {
        id: id("relatorio:mensal"),
        mes: relatorioMes,
        nome: "Relatório de métricas.pdf",
        storagePath: relatorio.path,
        uploadedAt: c.at(-3, 16),
      },
    ],
    publicoAlvo: {
      segmentacao: "Viajantes de lazer e famílias",
      localizacao: "Brasil",
      idadeMin: 25,
      idadeMax: 45,
      generos: ["Todos"],
    },
    dos: [
      "Mostrar a experiência de forma autêntica.",
      "Identificar a publicidade conforme as regras da plataforma.",
    ],
    donts: ["Prometer preços ou condições não aprovadas.", "Usar músicas sem licença."],
    activity: [
      {
        id: id("campanha:activity:0"),
        author: TIME.name,
        action: "criou a campanha de demonstração",
        createdAt: c.at(-20, 9),
      },
    ],
  };

  const cliente: DemoClienteData = {
    id: clienteId,
    empresa: input.empresa,
    responsavel: input.responsavel?.trim() || "Responsável (demonstração)",
    responsavelInterno: TIME.name,
    // Sem e-mail e sem WhatsApp REAIS: a demo nunca pode ser alvo de envio.
    email: "",
    whatsapp: "",
    clienteDesde: c.ymd(-20),
    campanhas: [campanha],
    status: "active",
    demoSessionId: sessionId,
  };

  // --- Resumo -----------------------------------------------------------------------
  const influenciadoresPorStatus: Record<InfluStatus, number> = {
    INSCRITO: 0,
    EM_CURADORIA: 0,
    ENVIADO_AO_CLIENTE: 0,
    APROVADO: 0,
    RECUSADO: 0,
  };
  const entregasPorEstagio: Partial<Record<EntregaStage, number>> = {};
  let totalEntregas = 0;
  for (const { data } of influenciadores) {
    influenciadoresPorStatus[data.status] += 1;
    for (const e of data.entregas) {
      entregasPorEstagio[e.stage] = (entregasPorEstagio[e.stage] ?? 0) + 1;
      totalEntregas += 1;
    }
  }

  return {
    payload: { cliente, influenciadores, tarefas, documentos, cronograma },
    assetSpecs: [...assetSpecs.values()],
    summary: {
      influenciadoresPorStatus,
      entregasPorEstagio,
      totalEntregas,
      tarefas: tarefas.length,
      documentos: documentos.length,
      cronograma: cronograma.length,
      relatorios: campanha.relatoriosMensais?.length ?? 0,
      assets: assetSpecs.size,
    },
  };
}
