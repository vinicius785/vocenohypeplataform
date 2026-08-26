import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  AtSign,
  BarChart3,
  Camera,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Coins,
  Columns3,
  Download,
  ExternalLink,
  Facebook,
  FileSignature,
  FileText,
  FileVideo,
  Film,
  Instagram,
  Landmark,
  Linkedin,
  LayoutList,
  Loader2,
  Mail,
  MessageSquare,
  Package,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Search,
  Share2,
  Trash2,
  Twitter,
  Upload,
  User,
  Users,
  XCircle,
  Youtube,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { loadBank, type BankInflu } from "@/lib/banco-influs-store";
import { useConfirm } from "@/hooks/use-confirm";
import { linkifyText } from "@/lib/linkify";
import { formatSeguidores } from "@/lib/format";

/* ============================================================
 * Shared Influenciadores model + UI.
 *
 * Used identically by the Campanhas detail page and by the
 * "Influenciadores" project feature — both render this same
 * board so the two never drift apart. The only difference
 * between them is `allowedFields`: Campanhas always passes every
 * field, Projetos can restrict which steps appear based on what
 * was chosen when the project was created (see INFLUENCIADORES
 * FEATURES config below).
 * ============================================================ */

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
  createdAt: string;
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
function getCurrentAuthor() {
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
const ENTREGA_ACTION_LOG: Record<EntregaEngineActionKind, string> = {
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
function logInfluActivity(i: Influ, action: string, entregaId?: string): Influ {
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

export type Rede = { id: string; plataforma: string; handle: string; seguidores?: string };
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
  const cutoffISO = cutoff.toISOString().slice(0, 10);

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
  ENTREGA_STAGE_DESCRIPTION,
  entregaStatusIcon,
  entregaFaseConceitual,
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
import {
  deriveEntregaNextStep,
  applyEntregaAction,
  type EntregaEngineActionKind,
} from "@/lib/entrega-engine";
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
};

/** Acrescenta um anexo novo na categoria certa, calculando a versão
 * seguinte (nunca sobrescreve um anexo anterior) — usado tanto pelo editor
 * genérico de anexos quanto pela ação contextual do motor de entrega. */
export function addAnexoComVersao(
  anexos: EntregaAnexo[],
  categoria: EntregaAnexoCategoria,
  nome: string,
  url: string,
): EntregaAnexo[] {
  const maxVersaoAtual = anexos
    .filter((a) => a.categoria === categoria)
    .reduce((max, a) => Math.max(max, a.versao ?? 1), 0);
  return [
    ...anexos,
    {
      id: crypto.randomUUID(),
      categoria,
      nome,
      url,
      versao: maxVersaoAtual + 1,
      criadoEm: todayISO(),
    },
  ];
}

export type Entrega = {
  id: string;
  tipo: string;
  titulo?: string;
  quantidade: number;
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
 * (seleção de influ, roteiro ou conteúdo de uma entrega). */
export type ClienteVeredito = { motivo: string; respondedAt: string };

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
  status: InfluStatus;
  statusUpdatedAt?: string; // data em que o status atual foi definido (p/ SLA de aprovação)
  bank?: BankInfo;
  comments?: InfluComment[];
  activity?: InfluActivity[];
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
   * pública. */
  inscricaoRespostas?: { questionId: string; label: string; value: string | string[] }[];
  /** Mês de referência (`"YYYY-MM"`) pra campanhas recorrentes — setado
   * pelo servidor no momento da inscrição, a partir do "Mês de
   * referência" configurado na Página de Inscrição (nunca vem direto do
   * formulário público). Usado por `CampanhasSection.tsx` pra decidir em
   * qual mês do kanban esse influenciador aparece, em vez de depender do
   * timing exato de `createdAt`. Ausente em entradas manuais/antigas. */
  cicloMes?: string;
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

export const REDES_OPTS = ["Instagram", "TikTok", "YouTube", "X", "LinkedIn", "Facebook"];
const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Instagram,
  YouTube: Youtube,
  Facebook,
  LinkedIn: Linkedin,
  X: Twitter,
};
export function PlatformIcon({
  plataforma,
  className,
}: {
  plataforma: string;
  className?: string;
}) {
  const Icon = PLATFORM_ICONS[plataforma] ?? AtSign;
  return <Icon className={className} />;
}
const ENTREGAS_OPTS = [
  "Reels",
  "Stories",
  "Post feed",
  "Carrossel",
  "TikTok",
  "Vídeo YouTube",
  "Short",
];

/* ------------------------------------------------------------
 * Configurable fields — used by the project creation dialog to
 * let admins choose what a new influencer's form collects.
 * ------------------------------------------------------------ */
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

/* ------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------ */

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
export const todayISO = () => new Date().toISOString().slice(0, 10);

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function MetricsEditor({
  value,
  onChange,
}: {
  value?: PostMetrics;
  onChange: (m: PostMetrics) => void;
}) {
  const METRICS_FIELDS: { key: keyof PostMetrics; label: string }[] = [
    { key: "views", label: "Views" },
    { key: "likes", label: "Curtidas" },
    { key: "comments", label: "Coment." },
    { key: "shares", label: "Compart." },
    { key: "saves", label: "Salvos" },
    { key: "reach", label: "Alcance" },
  ];
  const m = value ?? {};
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
      {METRICS_FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
            {f.label}
          </span>
          <input
            type="number"
            min={0}
            value={m[f.key] ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              const n = raw === "" ? undefined : Number(raw);
              onChange({ ...m, [f.key]: Number.isFinite(n as number) ? (n as number) : undefined });
            }}
            className="h-7 w-full rounded border border-border bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      ))}
    </div>
  );
}

/** Lista editável de fatias demográficas (ex: faixa etária → %), com um
 * gráfico de barras horizontal logo abaixo que atualiza em tempo real. */
/** Paleta fixa (mesmas cores do design system, `--chart-1..5`) usada nos
 * gráficos de pizza — arrays maiores repetem o ciclo. */
const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Rótulo com a % fora da fatia, ligado por uma linha — padrão recharts
 * pra pizza/donut (a prop `label` não aceita texto customizado sem isso). */
function renderPieLabel(props: {
  cx: number;
  cy: number;
  midAngle: number;
  outerRadius: number;
  valor: number;
}) {
  const { cx, cy, midAngle, outerRadius, valor } = props;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 16;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="var(--muted-foreground)"
      fontSize={10}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
    >
      {`${valor}%`}
    </text>
  );
}

/** Gráfico de barra (horizontal) ou pizza pra uma lista `{ name, valor }%` —
 * usado tanto no editor quanto no resumo somente-leitura das métricas. */
function DemographicMiniChart({
  data,
  chartType,
}: {
  data: { name: string; valor: number }[];
  chartType: "bar" | "pie";
}) {
  if (data.length === 0) return null;
  if (chartType === "pie") {
    return (
      <div className="h-[150px] w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="valor"
              nameKey="name"
              innerRadius="42%"
              outerRadius="72%"
              isAnimationActive={false}
              label={renderPieLabel}
              labelLine={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            >
              {data.map((entry, i) => (
                <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Legend
              layout="vertical"
              verticalAlign="middle"
              align="right"
              formatter={(value, entry) =>
                `${value} — ${(entry as { payload?: { valor?: number } }).payload?.valor ?? 0}%`
              }
              wrapperStyle={{ fontSize: 10, color: "var(--muted-foreground)" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <div className="h-[100px] w-full pt-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 28 }}>
          <CartesianGrid horizontal={false} strokeOpacity={0.15} />
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category"
            dataKey="name"
            width={90}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Bar
            dataKey="valor"
            fill="var(--foreground)"
            radius={3}
            barSize={12}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="valor"
              position="right"
              formatter={(v: number) => `${v}%`}
              style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DemographicEntriesEditor({
  title,
  placeholder,
  entries,
  onChange,
  chartType = "bar",
}: {
  title: string;
  placeholder: string;
  entries: DemographicEntry[];
  onChange: (entries: DemographicEntry[]) => void;
  chartType?: "bar" | "pie";
}) {
  const chartData = entries
    .filter((e) => e.label.trim())
    .map((e) => ({ name: e.label, valor: e.percentual }))
    .sort((a, b) => b.valor - a.valor);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      {entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2">
              <input
                value={entry.label}
                onChange={(e) =>
                  onChange(
                    entries.map((x) => (x.id === entry.id ? { ...x, label: e.target.value } : x)),
                  )
                }
                placeholder={placeholder}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex shrink-0 items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={entry.percentual || ""}
                  onChange={(e) =>
                    onChange(
                      entries.map((x) =>
                        x.id === entry.id ? { ...x, percentual: Number(e.target.value) || 0 } : x,
                      ),
                    )
                  }
                  className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-right text-xs outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <RemoveBtn onClick={() => onChange(entries.filter((x) => x.id !== entry.id))} />
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() =>
          onChange([...entries, { id: crypto.randomUUID(), label: "", percentual: 0 }])
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> Adicionar
      </button>
      <DemographicMiniChart data={chartData} chartType={chartType} />
    </div>
  );
}

/** Gráfico (barra ou pizza) somente-leitura para uma distribuição
 * demográfica — usado no resumo do perfil (fora do modo de edição). */
function DemographicChart({
  title,
  entries,
  chartType = "bar",
}: {
  title: string;
  entries?: DemographicEntry[];
  chartType?: "bar" | "pie";
}) {
  const data = (entries ?? [])
    .filter((e) => e.label.trim() && e.percentual > 0)
    .map((e) => ({ name: e.label, valor: e.percentual }))
    .sort((a, b) => b.valor - a.valor);
  if (data.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <DemographicMiniChart data={data} chartType={chartType} />
    </div>
  );
}

/** Editor das métricas do perfil do influenciador (não de uma entrega
 * específica): números agregados de audiência/engajamento + composição
 * demográfica do público, cada bloco demográfico com seu próprio gráfico. */
/** Métricas de uma única rede (sub-editor usado por `ProfileMetricsEditor`
 * uma vez por rede selecionada). */
function RedeMetricsFields({
  seguidores,
  onChangeSeguidores,
  value,
  onChange,
}: {
  seguidores?: string;
  onChangeSeguidores: (v: string) => void;
  value?: RedeMetrics;
  onChange: (m: RedeMetrics) => void;
}) {
  const m = value ?? {};
  const set = (patch: Partial<RedeMetrics>) => onChange({ ...m, ...patch });

  const SCALAR_FIELDS: { key: keyof RedeMetrics; label: string; suffix?: string }[] = [
    { key: "interacoes", label: "Interações" },
    { key: "visualizacoes", label: "Visualizações" },
    { key: "taxaInteracao", label: "Taxa de interação", suffix: "%" },
    { key: "taxaAtencaoInicial", label: "Taxa de atenção inicial", suffix: "%" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <FieldLabel title="Métricas gerais" hint="Números agregados dessa rede." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="space-y-1 rounded-xl border border-border bg-muted/20 p-3">
            <span className="block text-[11px] font-semibold uppercase tracking-tight text-muted-foreground">
              Seguidores
            </span>
            <input
              value={formatSeguidores(seguidores)}
              onChange={(e) => onChangeSeguidores(e.target.value.replace(/\D/g, ""))}
              placeholder="0"
              inputMode="numeric"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </label>
          {SCALAR_FIELDS.map((f) => (
            <label
              key={f.key}
              className="space-y-1 rounded-xl border border-border bg-muted/20 p-3"
            >
              <span className="block text-[11px] font-semibold uppercase tracking-tight text-muted-foreground">
                {f.label}
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  value={(m[f.key] as number | undefined) ?? ""}
                  onChange={(e) =>
                    set({ [f.key]: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
                {f.suffix && <span className="text-xs text-muted-foreground">{f.suffix}</span>}
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <FieldLabel
          title="Demografia do público"
          hint="Distribuição percentual do público real dessa rede, por gênero, faixa etária, país e cidade."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DemographicEntriesEditor
            title="Gênero"
            placeholder="Ex: Feminino"
            entries={m.genero ?? []}
            onChange={(genero) => set({ genero })}
            chartType="pie"
          />
          <DemographicEntriesEditor
            title="Faixa etária"
            placeholder="Ex: 18-24 anos"
            entries={m.faixaEtaria ?? []}
            onChange={(faixaEtaria) => set({ faixaEtaria })}
          />
          <DemographicEntriesEditor
            title="Principais países"
            placeholder="Ex: Brasil"
            entries={m.paises ?? []}
            onChange={(paises) => set({ paises })}
          />
          <DemographicEntriesEditor
            title="Principais cidades"
            placeholder="Ex: São Paulo"
            entries={m.cidades ?? []}
            onChange={(cidades) => set({ cidades })}
          />
        </div>
      </div>
    </div>
  );
}

/** Métricas do perfil — uma card por rede social já cadastrada (não mais um
 * seletor de pills escondendo as demais), no mesmo estilo visual usado no
 * Portal do cliente (`portal.$token.tsx`, seção "Métricas do perfil"): ícone
 * da plataforma + handle no topo do card, métricas gerais e demografia
 * dentro. Diferença pro VC (que é só leitura): aqui os campos são editáveis. */
function ProfileMetricsEditor({
  redes,
  onChangeRedes,
  value,
  onChange,
}: {
  redes: Rede[];
  onChangeRedes: (redes: Rede[]) => void;
  value?: ProfileMetrics;
  onChange: (m: ProfileMetrics) => void;
}) {
  const porRede = value?.porRede ?? {};

  if (redes.length === 0) {
    return (
      <EmptyHint text="Adicione redes sociais em Perfil antes de preencher as métricas — cada rede tem suas próprias métricas." />
    );
  }

  return (
    <div className="space-y-4">
      {redes.map((r) => (
        <div key={r.id} className="space-y-5 rounded-xl border border-border bg-muted/20 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <PlatformIcon plataforma={r.plataforma} className="h-3.5 w-3.5" />
            {r.handle ? `@${r.handle}` : r.plataforma}
          </p>
          <RedeMetricsFields
            seguidores={r.seguidores}
            onChangeSeguidores={(seguidores) =>
              onChangeRedes(redes.map((x) => (x.id === r.id ? { ...x, seguidores } : x)))
            }
            value={porRede[r.id]}
            onChange={(m) => onChange({ ...value, porRede: { ...porRede, [r.id]: m } })}
          />
        </div>
      ))}
    </div>
  );
}

/** Menu suspenso simples (sem Radix): abre/fecha por estado local e fecha
 * sozinho ao clicar fora. Usado pelos botões "Baixar lista"/"Solicitar
 * aprovação" e "Novo influenciador" no cabeçalho, pra não empilhar botões
 * soltos lado a lado. */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);
  return { open, setOpen, ref };
}

/* ============================================================
 * Board — header, carousel of cards, dialogs. This is the piece
 * both Campanhas and Projetos mount.
 * ============================================================ */

export function InfluencerBoard({
  influs,
  onChange,
  exportName,
  allowedFields,
  headerExtra,
  defaultCicloMes,
  cicloMesOptions,
}: {
  influs: Influ[];
  onChange: (next: Influ[]) => void;
  exportName: string;
  allowedFields?: InfluencerFieldKey[];
  /** Extra action rendered in the header row, next to "Baixar lista" (e.g. campaign public-link button).
   * Receives a `closeMenu` callback so it can close the "Exportar" dropdown itself once its own
   * dialog opens — the dropdown used to auto-close on any click inside it, which unmounted this
   * button (and destroyed its own dialog-open state) before its dialog ever got to render. */
  headerExtra?: (closeMenu: () => void) => ReactNode;
  /** Mês (`"YYYY-MM"`) a carimbar em `cicloMes` de todo influenciador criado
   * por aqui (Criar do zero / Adicionar do banco) — só passado por
   * campanhas recorrentes, com o mês que está selecionado na tela no
   * momento. `undefined` em qualquer outro caso (campanha não-recorrente,
   * ou quem mais montar este board, ex. Projetos): sem isso, todo
   * influenciador criado ficava só com `createdAt`, que sempre bate no mês
   * corrente independente do mês selecionado no filtro. */
  defaultCicloMes?: string;
  /** Lista de opções de mês (mesma de `buildMesReferenciaOptions`) — quando
   * presente, o perfil do influenciador ganha um seletor pra mudar
   * `cicloMes` manualmente (mover pra outro mês). `undefined`/vazio em
   * campanhas não-recorrentes: sem seletor, nada muda. */
  cicloMesOptions?: { value: string; label: string }[];
}) {
  const fields = allowedFields ?? ALL_INFLUENCER_FIELDS;
  const has = (k: InfluencerFieldKey) => fields.includes(k);
  const { confirm, confirmDialog } = useConfirm();

  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Influ | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"lista" | "kanban">("lista");
  const [sortBy, setSortBy] = useState<"az" | "za" | "updated" | "created">("az");
  const [dragId, setDragId] = useState<string | null>(null);
  const exportMenu = useDropdown();
  const novoMenu = useDropdown();
  const viewMenu = useDropdown();
  const [query, setQuery] = useState("");
  const [hideReprovados, setHideReprovados] = useState(false);
  const carRef = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) =>
    carRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  // Sempre aponta pro `influs` mais recente, mesmo entre dois handlers que
  // disparam no mesmo tick (ex: blur de um campo + clique em outro logo
  // em seguida) — sem isso, o segundo handler fechava sobre o `influs` de
  // props (ainda não re-renderizado com a mudança do primeiro) e
  // sobrescrevia a edição anterior ao computar `influs.map(...)` a partir
  // de um array desatualizado. Sintoma: campos "salvando sozinho" um valor
  // antigo, status/foto/link que parecem reverter sem motivo.
  const latestInflusRef = useRef(influs);
  latestInflusRef.current = influs;
  const applyInflusChange = (next: Influ[]) => {
    latestInflusRef.current = next;
    onChange(next);
  };

  const pushActivity = logInfluActivity;

  // Usado pelo drag-and-drop do kanban e pelo dropdown de status do card —
  // os dois únicos lugares fora do perfil (`setInfluStatusFromResumo`, que
  // já faz o mesmo) que mudam o status na mão. Ignora silenciosamente uma
  // transição que `canTransitionInflu` não permite (o dropdown já desabilita
  // essas opções; isso é só a rede de segurança pro drag, que não filtra
  // coluna de destino). Sempre limpa `clienteReprovacao` — senão, ao
  // reabrir a aprovação (RECUSADO → ENVIADO_AO_CLIENTE) ou ao reprovar
  // manualmente um já aprovado (APROVADO → RECUSADO), o selo antigo do
  // cliente ficaria preso e o portal continuaria tratando como já decidido.
  const changeStatus = (influId: string, status: InfluStatus) =>
    applyInflusChange(
      latestInflusRef.current.map((x) =>
        x.id === influId && canTransitionInflu(x.status, status)
          ? pushActivity(
              { ...x, status, statusUpdatedAt: todayISO(), clienteReprovacao: undefined },
              `mudou status para ${INFLU_STATUS_LABEL[status]}`,
            )
          : x,
      ),
    );

  /** Ação universal "Enviar para cliente" (perfil) — só sai de EM_CURADORIA,
   * registra quem/quando no histórico e disponibiliza o perfil no portal. */
  const sendInfluToClient = (influId: string) => {
    applyInflusChange(
      latestInflusRef.current.map((x) =>
        x.id === influId && x.status === "EM_CURADORIA"
          ? pushActivity(
              { ...x, status: "ENVIADO_AO_CLIENTE", statusUpdatedAt: todayISO() },
              "enviou o perfil para aprovação do cliente",
            )
          : x,
      ),
    );
  };

  // Único ponto que executa uma ação do motor de entrega (`entrega-engine.ts`)
  // — nunca monta o patch de status/etapa na mão fora daqui, e sempre
  // registra na Atividade, mantendo o histórico automático.
  const runEntregaAction = (
    influId: string,
    entregaId: string,
    action: EntregaEngineActionKind,
    opts?: {
      url?: string;
      /** Quando a ação inclui anexar um arquivo (adicionar roteiro/conteúdo
       * final), o anexo entra no MESMO patch que o carimbo de prontidão —
       * nunca em dois `onChange` separados, senão o segundo sobrescreveria
       * o primeiro com um snapshot desatualizado da entrega. */
      anexo?: { categoria: EntregaAnexoCategoria; nome: string; url: string };
    },
  ) => {
    const next = latestInflusRef.current.map((x) => {
      if (x.id !== influId) return x;
      const entrega = x.entregas.find((e) => e.id === entregaId);
      if (!entrega) return x;
      const anexos = opts?.anexo
        ? addAnexoComVersao(
            entrega.anexos ?? [],
            opts.anexo.categoria,
            opts.anexo.nome,
            opts.anexo.url,
          )
        : entrega.anexos;
      let patch: Partial<Entrega>;
      try {
        patch = applyEntregaAction({ ...entrega, anexos }, action, opts);
      } catch (err) {
        console.warn("[entrega-engine]", err);
        return x;
      }
      const label = entrega.titulo ? `${entrega.tipo} · ${entrega.titulo}` : entrega.tipo;
      return pushActivity(
        {
          ...x,
          entregas: x.entregas.map((e) => (e.id === entregaId ? { ...e, anexos, ...patch } : e)),
        },
        `${ENTREGA_ACTION_LOG[action]} — "${label}"`,
        entregaId,
      );
    });
    applyInflusChange(next);
    setViewing((v) => next.find((x) => x.id === v?.id) ?? null);
  };

  // Mover manualmente pro estágio de entrada da fase alvo — sem passar
  // pelo motor de ação, de propósito ("sem travas": o time decide onde
  // colocar, sem depender de rodar a ação certa).
  const setEntregaStageManual = (influId: string, entregaId: string, coluna: EntregaFaseColuna) => {
    const stage = ENTREGA_FASE_COLUNA_ENTRY_STAGE[coluna];
    const next = latestInflusRef.current.map((x) => {
      if (x.id !== influId) return x;
      const entrega = x.entregas.find((e) => e.id === entregaId);
      if (!entrega) return x;
      const isPublicada = stage === "PUBLICADA";
      const patch: Partial<Entrega> = {
        stage,
        status: isPublicada
          ? "publicado"
          : entrega.status === "publicado"
            ? "combinado"
            : entrega.status,
        publicadoEm: isPublicada ? (entrega.publicadoEm ?? todayISO()) : entrega.publicadoEm,
      };
      const label = entrega.titulo ? `${entrega.tipo} · ${entrega.titulo}` : entrega.tipo;
      return pushActivity(
        { ...x, entregas: x.entregas.map((e) => (e.id === entregaId ? { ...e, ...patch } : e)) },
        `moveu "${label}" pra ${ENTREGA_FASE_COLUNA_LABEL[coluna]}`,
        entregaId,
      );
    });
    applyInflusChange(next);
    setViewing((v) => next.find((x) => x.id === v?.id) ?? null);
  };

  const removeInflu = async (influId: string): Promise<boolean> => {
    const alvo = latestInflusRef.current.find((x) => x.id === influId);
    const ok = await confirm(
      `Excluir "${alvo?.nome || "este influenciador"}" desta campanha? Isso remove o perfil, entregas e histórico dele daqui.`,
    );
    if (!ok) return false;
    applyInflusChange(latestInflusRef.current.filter((x) => x.id !== influId));
    return true;
  };

  const addComment = (influId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const me = getCurrentAuthor();
    const next = latestInflusRef.current.map((x) =>
      x.id === influId
        ? {
            ...x,
            updatedAt: new Date().toISOString(),
            comments: [
              ...(x.comments ?? []),
              {
                id: crypto.randomUUID(),
                author: me.name,
                initials: me.initials,
                color: me.color,
                text: trimmed,
                createdAt: new Date().toISOString(),
              },
            ],
          }
        : x,
    );
    applyInflusChange(next);
    setViewing((v) => next.find((x) => x.id === v?.id) ?? null);
  };

  // `InfluenciadorDialog` só cria (editar um influenciador existente abre o
  // perfil via `viewing`, que salva imediato campo a campo).
  const create = (i: Influ) => {
    const now = new Date().toISOString();
    const withStamps = { ...i, createdAt: now, updatedAt: now, cicloMes: defaultCicloMes };
    applyInflusChange([...latestInflusRef.current, withStamps]);
  };

  // Edição imediata de qualquer campo pelo perfil (nome, nicho, contato,
  // redes, métricas, financeiro, contrato, entregas) — sem rascunho, sem
  // segundo diálogo: cada mudança já salva na hora.
  const patchInflu = (influId: string, patch: Partial<Influ>) => {
    const next = latestInflusRef.current.map((x) => (x.id === influId ? { ...x, ...patch } : x));
    applyInflusChange(next);
    setViewing((v) => next.find((x) => x.id === v?.id) ?? null);
  };

  const setInfluStatusFromResumo = (influId: string, status: InfluStatus) => {
    const next = latestInflusRef.current.map((x) =>
      x.id === influId
        ? pushActivity(
            // Mudar o status manualmente é o sinal de que o time mexeu na
            // seleção depois de uma reprovação do cliente — limpa
            // `clienteReprovacao` junto, senão não existe outro jeito de
            // reabrir a aprovação pro cliente decidir de novo (o selo de
            // reprovado ficaria preso pra sempre).
            { ...x, status, statusUpdatedAt: todayISO(), clienteReprovacao: undefined },
            `mudou status para ${INFLU_STATUS_LABEL[status]}`,
          )
        : x,
    );
    applyInflusChange(next);
    setViewing((v) => next.find((x) => x.id === v?.id) ?? null);
  };

  const setInfluChecklist = (influId: string, checklist: ChecklistItem[]) => {
    applyInflusChange(
      latestInflusRef.current.map((x) => (x.id === influId ? { ...x, checklist } : x)),
    );
    setViewing((v) => (v?.id === influId ? { ...v, checklist } : v));
  };

  // Copia os itens (textos) da checklist de um influ pros demais da
  // campanha/projeto de uma vez — pra não recriar item por item em cada um.
  // Preserva o "concluído" de itens que o influ já tinha marcado (casando
  // pelo texto), em vez de desmarcar tudo de novo a cada aplicação.
  const applyChecklistToAll = (checklist: ChecklistItem[]) => {
    const next = latestInflusRef.current.map((x) => {
      const existingByText = new Map((x.checklist ?? []).map((c) => [c.text, c]));
      return {
        ...x,
        checklist: checklist.map(
          (c) =>
            existingByText.get(c.text) ?? { id: crypto.randomUUID(), text: c.text, done: false },
        ),
      };
    });
    applyInflusChange(next);
    setViewing((v) => next.find((x) => x.id === v?.id) ?? null);
  };

  const sortedInflus = useMemo(() => {
    const list = [...influs];
    switch (sortBy) {
      case "az":
        return list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      case "za":
        return list.sort((a, b) => b.nome.localeCompare(a.nome, "pt-BR"));
      case "updated":
        return list.sort(
          (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
        );
      case "created":
        return list.sort(
          (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
        );
    }
  }, [influs, sortBy]);

  // `clienteReprovacao` só cobre a reprovação feita PELO CLIENTE no portal —
  // uma reprovação manual do time (mudar status pra RECUSADO direto,
  // aprovado ou não antes) limpa esse campo de propósito (ver comentário em
  // `changeStatus`), mas o influenciador continua reprovado igual. "Ocultar
  // reprovados" precisa cobrir os dois casos, senão quem foi reprovado
  // manualmente depois de já ter sido aprovado nunca fica escondido.
  const isReprovado = (i: Pick<Influ, "status" | "clienteReprovacao">) =>
    i.status === "RECUSADO" || !!i.clienteReprovacao;

  const reprovadosCount = influs.filter(isReprovado).length;

  const filteredInflus = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = sortedInflus;
    if (hideReprovados) list = list.filter((i) => !isReprovado(i));
    if (!q) return list;
    return list.filter((i) => i.nome.toLowerCase().includes(q));
  }, [sortedInflus, query, hideReprovados]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Influenciadores
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {influs.length} {influs.length === 1 ? "adicionado" : "adicionados"}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar influenciador..."
              aria-label="Buscar influenciador"
              className="h-8 w-44 rounded-md border border-border bg-background pl-8 pr-2.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
          <div ref={viewMenu.ref} className="relative">
            <button
              type="button"
              onClick={() => viewMenu.setOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              {viewMode === "lista" ? (
                <LayoutList className="h-3.5 w-3.5" />
              ) : (
                <Columns3 className="h-3.5 w-3.5" />
              )}
              Visualização
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
            {viewMenu.open && (
              <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-popover p-1 shadow-md">
                <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Exibir como
                </p>
                <button
                  type="button"
                  onClick={() => setViewMode("lista")}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium hover:bg-muted ${
                    viewMode === "lista" ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <LayoutList className="h-3.5 w-3.5" /> Lista
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("kanban")}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium hover:bg-muted ${
                    viewMode === "kanban" ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Columns3 className="h-3.5 w-3.5" /> Kanban
                </button>
                {reprovadosCount > 0 && (
                  <>
                    <div className="my-1 border-t border-border" />
                    <button
                      type="button"
                      onClick={() => setHideReprovados((v) => !v)}
                      aria-pressed={hideReprovados}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium hover:bg-muted ${
                        hideReprovados
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Ocultar reprovados
                      <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
                        {reprovadosCount}
                      </span>
                      {hideReprovados && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  </>
                )}
                <div className="my-1 border-t border-border" />
                <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Ordenar por
                </p>
                {(
                  [
                    { k: "az", label: "A-Z" },
                    { k: "za", label: "Z-A" },
                    { k: "updated", label: "Última atualização" },
                    { k: "created", label: "Mais recentes" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.k}
                    type="button"
                    onClick={() => setSortBy(o.k)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium hover:bg-muted ${
                      sortBy === o.k ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div ref={exportMenu.ref} className="relative">
            <button
              type="button"
              onClick={() => exportMenu.setOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" /> Exportar
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
            {exportMenu.open && (
              <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-md border border-border bg-popover p-1 shadow-md">
                <button
                  type="button"
                  onClick={() => {
                    setDownloadOpen(true);
                    exportMenu.setOpen(false);
                  }}
                  disabled={influs.length === 0}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" /> Baixar lista
                </button>
                {headerExtra?.(() => exportMenu.setOpen(false))}
              </div>
            )}
          </div>
          <div ref={novoMenu.ref} className="relative">
            <button
              type="button"
              onClick={() => novoMenu.setOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Novo influenciador
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
            {novoMenu.open && (
              <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-md border border-border bg-popover p-1 shadow-md">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(true);
                    novoMenu.setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" /> Criar do zero
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBankPickerOpen(true);
                    novoMenu.setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Users className="h-3.5 w-3.5" /> Adicionar do banco
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {influs.length === 0 ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-12 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/30"
        >
          <Plus className="h-5 w-5" />
          Adicionar o primeiro influenciador
        </button>
      ) : viewMode === "kanban" ? (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
          {/* RECUSADO fica fora da ordem linear do funil (`INFLU_KANBAN_ORDER`),
           * puxado pra uma coluna própria no fim — é um estado terminal
           * alternativo, não mais uma etapa do meio do caminho. */}
          {[...INFLU_KANBAN_ORDER, "RECUSADO" as const].map((col) => {
            const items = filteredInflus.filter((i) => i.status === col);
            return (
              <div
                key={col}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) changeStatus(dragId, col);
                  setDragId(null);
                }}
                className="flex w-[312px] shrink-0 flex-col rounded-xl border border-border bg-background p-3"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${INFLU_STATUS_TONE[col]}`}
                  >
                    {INFLU_STATUS_LABEL[col]}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                <div className="flex-1 space-y-2.5">
                  {items.map((i) => (
                    <div key={i.id} draggable onDragStart={() => setDragId(i.id)}>
                      <InfluCard
                        influ={i}
                        has={has}
                        onView={() => setViewing(i)}
                        onStatus={(status) => changeStatus(i.id, status)}
                        onRemove={() => void removeInflu(i.id)}
                      />
                    </div>
                  ))}
                  {items.length === 0 && (
                    <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">
                      Nenhum influenciador
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="group/carousel relative">
          <div
            ref={carRef}
            className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-3"
          >
            {filteredInflus.map((i) => (
              <InfluCard
                key={i.id}
                influ={i}
                has={has}
                onView={() => setViewing(i)}
                onStatus={(status) => changeStatus(i.id, status)}
                onRemove={() => void removeInflu(i.id)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="absolute -left-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-border bg-background p-1.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:block"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="absolute -right-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-border bg-background p-1.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:block"
            aria-label="Próximo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <InfluenciadorDialog
        open={creating}
        onOpenChange={setCreating}
        has={has}
        onSave={(i) => {
          create(i);
          setCreating(false);
        }}
      />

      {viewing && (
        <InfluencerProfileDialog
          influ={viewing}
          has={has}
          cicloMesOptions={cicloMesOptions}
          onOpenChange={(o) => !o && setViewing(null)}
          onRemove={async () => {
            if (await removeInflu(viewing.id)) setViewing(null);
          }}
          onSetStatus={(status) => setInfluStatusFromResumo(viewing.id, status)}
          onRunEntregaAction={(entregaId, action, opts) =>
            runEntregaAction(viewing.id, entregaId, action, opts)
          }
          onSetEntregaStage={(entregaId, coluna) =>
            setEntregaStageManual(viewing.id, entregaId, coluna)
          }
          onSendToClient={() => sendInfluToClient(viewing.id)}
          onSetChecklist={(checklist) => setInfluChecklist(viewing.id, checklist)}
          onApplyChecklistToAll={applyChecklistToAll}
          onComment={(text) => addComment(viewing.id, text)}
          onPatch={(patch) => patchInflu(viewing.id, patch)}
        />
      )}

      <DownloadInflusDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        influs={influs}
        exportName={exportName}
        has={has}
      />

      <BankPickerDialog
        open={bankPickerOpen}
        onOpenChange={setBankPickerOpen}
        alreadyAdded={influs.map((i) => i.nome.trim().toLowerCase())}
        onAdd={(picked) => {
          const now = new Date().toISOString();
          applyInflusChange([
            ...latestInflusRef.current,
            ...picked.map(
              (b): Influ => ({
                id: crypto.randomUUID(),
                foto: b.foto,
                nome: b.nome,
                nicho: b.nicho,
                redes: b.redes,
                entregas: [],
                status: "EM_CURADORIA",
                createdAt: now,
                updatedAt: now,
                cicloMes: defaultCicloMes,
              }),
            ),
          ]);
          setBankPickerOpen(false);
        }}
      />
      {confirmDialog}
    </section>
  );
}

/* ============================================================
 * Card
 * ============================================================ */

function InfluCard({
  influ,
  has,
  onView,
  onStatus,
  onRemove,
}: {
  influ: Influ;
  has: (k: InfluencerFieldKey) => boolean;
  onView: () => void;
  onStatus: (s: InfluStatus) => void;
  onRemove: () => void;
}) {
  // Selo de aprovação do cliente (etapa 1 do link público) — derivado
  // direto do status/veredito do influ, sem depender de uma tabela à
  // parte (o link público agora escreve nesses mesmos campos).
  const approval: { status: "aprovado" | "reprovado"; motivo?: string } | undefined =
    influ.status === "APROVADO"
      ? { status: "aprovado" }
      : influ.status === "RECUSADO" || influ.clienteReprovacao
        ? { status: "reprovado", motivo: influ.clienteReprovacao?.motivo }
        : undefined;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const totalPago = totalAceito(influ.pagamento);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView();
        }
      }}
      className="flex w-[280px] shrink-0 snap-start cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-colors hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="flex flex-col items-center gap-3 px-4 pb-4 pt-6 text-center">
        <div className="relative h-20 w-20 shrink-0">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
            {influ.foto ? (
              <img src={influ.foto} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
            )}
          </div>
          {approval && (
            <span
              title={approval.status === "reprovado" ? approval.motivo : undefined}
              className={`absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background ${
                approval.status === "aprovado"
                  ? "bg-emerald-500 text-white"
                  : "bg-rose-500 text-white"
              }`}
            >
              {approval.status === "aprovado" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
            </span>
          )}
        </div>
        <div className="min-w-0 w-full">
          <p className="truncate text-base font-semibold text-foreground">
            {influ.nome || "Sem nome"}
          </p>
          {influ.nicho && (
            <span className="mt-1 inline-block max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {influ.nicho}
            </span>
          )}
          {has("redes") && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {influ.redes
                .map((r) => r.handle || r.plataforma)
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          )}
        </div>
      </div>

      {has("status") && (
        <div className="px-4 pb-4" onClick={stop}>
          <div className={`relative rounded-lg ${INFLU_STATUS_TONE[influ.status]}`}>
            <select
              value={influ.status}
              onChange={(e) => onStatus(e.target.value as InfluStatus)}
              className="w-full cursor-pointer appearance-none rounded-lg bg-transparent px-3 py-2 pr-8 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring"
            >
              {INFLU_STATUSES.map((s) => (
                <option key={s} value={s} className="bg-background text-foreground">
                  {INFLU_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 opacity-70" />
          </div>
          <div className="mt-1.5">
            <NextActionBadge actor={nextActionForInflu(influ.status)} />
          </div>
          {(() => {
            const overdueDays = approvalSlaOverdueDays(influ);
            if (!overdueDays) return null;
            return (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> Aguardando aprovação há {overdueDays} dias
              </p>
            );
          })()}
        </div>
      )}

      {has("entregas") && influ.entregas.length > 0 && (
        <div className="border-t border-border/60 bg-muted/20 px-4 py-2.5">
          {(() => {
            const { total, publicadas } = producaoResumo(influ.entregas);
            return (
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-foreground/80">
                  {publicadas}/{total} publicadas
                </span>
                <span className="text-muted-foreground">Ver na aba Entregas</span>
              </div>
            );
          })()}
        </div>
      )}

      {(has("pagamentos") || (has("contrato") && influ.contrato)) && (
        <dl className="space-y-1 border-t border-border/60 bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
          {has("pagamentos") && (
            <MetaRow label="Valor" value={totalPago > 0 ? fmtBRL(totalPago) : "—"} />
          )}
          {has("contrato") && influ.contrato && (
            <MetaRow
              label="Contrato"
              value={
                <a
                  href={influ.contrato}
                  download
                  onClick={stop}
                  className="underline underline-offset-2"
                >
                  Anexo
                </a>
              }
            />
          )}
        </dl>
      )}

      <div className="flex items-center justify-end border-t border-border/60 px-4 py-2">
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onRemove();
          }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt>{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-right text-foreground/80">{value}</dd>
    </div>
  );
}

/** Checklist livre por influenciador — escreve o que quiser, marca feito, e
 * pode aplicar a mesma lista (desmarcada) a todos os outros influs de uma
 * vez, pra não recriar item por item em cada um. */
function ChecklistSection({
  checklist,
  onChange,
  onApplyToAll,
}: {
  checklist: ChecklistItem[];
  onChange: (next: ChecklistItem[]) => void;
  onApplyToAll: (checklist: ChecklistItem[]) => void;
}) {
  const [newText, setNewText] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  const addItem = () => {
    const text = newText.trim();
    if (!text) return;
    onChange([...checklist, { id: crypto.randomUUID(), text, done: false }]);
    setNewText("");
  };

  const applyToAll = async () => {
    if (checklist.length === 0) return;
    const ok = await confirm(
      "Aplicar esta checklist a todos os influenciadores? A checklist atual de cada um será substituída (desmarcada).",
    );
    if (ok) onApplyToAll(checklist);
  };

  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Checklist
          {checklist.length > 0 && (
            <span className="font-normal text-muted-foreground">
              ({doneCount}/{checklist.length})
            </span>
          )}
        </p>
        {checklist.length > 0 && (
          <button
            type="button"
            onClick={() => void applyToAll()}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Aplicar a todos os influenciadores
          </button>
        )}
      </div>

      {checklist.length > 0 && (
        <ul className="space-y-1">
          {checklist.map((item) => (
            <li key={item.id} className="group flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() =>
                  onChange(checklist.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)))
                }
                className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-foreground"
              />
              <input
                value={item.text}
                onChange={(e) =>
                  onChange(
                    checklist.map((c) => (c.id === item.id ? { ...c, text: e.target.value } : c)),
                  )
                }
                className={`min-w-0 flex-1 bg-transparent text-xs outline-none ${
                  item.done ? "text-muted-foreground line-through" : "text-foreground"
                }`}
              />
              <button
                type="button"
                onClick={() => onChange(checklist.filter((c) => c.id !== item.id))}
                className="shrink-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                aria-label="Remover item"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 border-t border-border pt-2">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder="Adicionar item..."
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={addItem}
          disabled={!newText.trim()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> Adicionar
        </button>
      </div>
      {confirmDialog}
    </div>
  );
}

/** Pill do status individual de uma entrega — dropdown customizado (não um
 * `<select>` nativo, que renderia como uma caixa cinza do navegador). */
/** Status individual da entrega, no resumo — abre um popup (não um menu
 * suspenso, que ficava apertado dentro do card) pra escolher a etapa. */
/** Status geral do influenciador, no cabeçalho do resumo — também abre um
 * popup em vez de exigir ir até a etapa "Status" do editor pra mudar. */
function InfluStatusPill({
  value,
  onChange,
}: {
  value: InfluStatus;
  onChange: (s: InfluStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shadow-sm ${INFLU_STATUS_TONE[value]}`}
      >
        {INFLU_STATUS_LABEL[value]}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs border-border bg-background">
          <DialogTitle className="text-sm font-semibold">Status do influenciador</DialogTitle>
          <DialogDescription className="sr-only">
            Escolha o status geral deste influenciador no fluxo da campanha.
          </DialogDescription>
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {INFLU_STATUSES.map((s) => {
              const disabled = !canTransitionInflu(value, s);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md border-2 bg-background px-2.5 py-2 text-left text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 ${INFLU_STATUS_BORDER[s]}`}
                >
                  {INFLU_STATUS_LABEL[s]}
                  {s === value && <Check className="ml-auto h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Badge visual de "quem precisa agir" — pra bater o olho numa lista e já
 * saber onde está o gargalo (Hype/Cliente/Influenciador). */
function NextActionBadge({ actor }: { actor: NextActor }) {
  if (!actor) return null;
  const tone: Record<Exclude<NextActor, null>, string> = {
    hype: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    cliente: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    influenciador: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone[actor]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      Próxima ação: {NEXT_ACTOR_LABEL[actor]}
    </span>
  );
}

/** Lista-resumo de entregas — uma linha por entrega, com tipo/quantidade/
 * status/etapa/anexos sempre visíveis, sem precisar abrir nada só pra ler.
 * Clicar numa linha abre a view dedicada da entrega (`EntregaDetailSheet`)
 * num painel lateral, em vez de expandir inline — cada entrega tem sua
 * própria tela (cronograma, progresso, arquivos, aprovação, histórico). */
export type EntregaActionOpts = {
  url?: string;
  anexo?: { categoria: EntregaAnexoCategoria; nome: string; url: string };
};

function EntregasEditor({
  entregas,
  onChange,
  influActivity = [],
  influNome,
  influFoto,
  onRunAction,
  onSetStage,
}: {
  entregas: Entrega[];
  onChange: (next: Entrega[]) => void;
  influActivity?: InfluActivity[];
  /** Nome/foto do influenciador dono destas entregas — repassados pro
   * cabeçalho do painel de detalhe. Ausentes no fluxo de criação (sem
   * influenciador ainda salvo). */
  influNome?: string;
  influFoto?: string;
  /** Se não passado (fluxo de criação, sem influenciador persistido ainda),
   * a própria `EntregasEditor` aplica o motor localmente via `onChange` —
   * sem log de Atividade, que só existe pra um influenciador já salvo. */
  onRunAction?: (
    entregaId: string,
    action: EntregaEngineActionKind,
    opts?: EntregaActionOpts,
  ) => void;
  /** Mesma ideia de `onRunAction`, mas pro "Mover para" manual (sem
   * passar pelo motor) — ausente no fluxo de criação, aplica local. */
  onSetStage?: (entregaId: string, coluna: EntregaFaseColuna) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = entregas.find((e) => e.id === selectedId) ?? null;

  const update = (id: string, patch: Partial<Entrega>) =>
    onChange(entregas.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const runAction = (
    entregaId: string,
    action: EntregaEngineActionKind,
    opts?: EntregaActionOpts,
  ) => {
    if (onRunAction) {
      onRunAction(entregaId, action, opts);
      return;
    }
    const e = entregas.find((x) => x.id === entregaId);
    if (!e) return;
    const anexos = opts?.anexo
      ? addAnexoComVersao(e.anexos ?? [], opts.anexo.categoria, opts.anexo.nome, opts.anexo.url)
      : e.anexos;
    try {
      update(entregaId, { anexos, ...applyEntregaAction({ ...e, anexos }, action, opts) });
    } catch (err) {
      console.warn("[entrega-engine]", err);
    }
  };

  const setStage = (entregaId: string, coluna: EntregaFaseColuna) => {
    if (onSetStage) {
      onSetStage(entregaId, coluna);
      return;
    }
    const e = entregas.find((x) => x.id === entregaId);
    if (!e) return;
    const stage = ENTREGA_FASE_COLUNA_ENTRY_STAGE[coluna];
    const isPublicada = stage === "PUBLICADA";
    update(entregaId, {
      stage,
      status: isPublicada ? "publicado" : e.status === "publicado" ? "combinado" : e.status,
      publicadoEm: isPublicada ? (e.publicadoEm ?? todayISO()) : e.publicadoEm,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel title="Entregas" hint="Clique numa linha pra abrir a entrega." />
      </div>

      {entregas.length === 0 ? (
        <EmptyHint text="Nenhuma entrega adicionada." />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {entregas.map((e) => {
            const step = deriveEntregaNextStep(e);
            const stage = e.stage ?? "ROTEIRO_PRODUCAO";
            const fase = entregaFaseConceitual(stage);
            const aguardandoCliente = !step.action && step.responsavel === "cliente";
            const prazo = nextPrazoData(e);
            return (
              <div
                key={e.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(e.id)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") setSelectedId(e.id);
                }}
                className="grid cursor-pointer grid-cols-1 items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm transition-colors hover:bg-muted/30 sm:grid-cols-[1.3fr_1.1fr_1.3fr_auto_auto]"
              >
                <p className="min-w-0 truncate font-medium text-foreground">
                  {e.titulo ? `${e.tipo} · ${e.titulo}` : e.tipo || "Sem tipo"}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    · {e.quantidade} {e.quantidade === 1 ? "unidade" : "unidades"}
                  </span>
                </p>

                <div className="flex items-center gap-1.5 text-xs">
                  <span
                    className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${ENTREGA_STAGE_TONE[stage]}`}
                  >
                    {fase.fase}
                  </span>
                  <span className="truncate text-muted-foreground">{fase.subLabel}</span>
                </div>

                <div className="min-w-0 text-xs">
                  {step.action ? (
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{step.actionLabel}</span>
                    </span>
                  ) : aguardandoCliente ? (
                    <span className="truncate text-muted-foreground">
                      Aguardando aprovação do cliente
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </div>

                <div className="text-[11px] text-muted-foreground">
                  {prazo ? `${prazo.label}: ${formatDataCurta(prazo.data)}` : ""}
                </div>

                <div onClick={(ev) => ev.stopPropagation()} className="justify-self-end">
                  <button
                    type="button"
                    onClick={() => onChange(entregas.filter((x) => x.id !== e.id))}
                    aria-label="Remover entrega"
                    className="rounded p-1.5 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <datalist id="entregas-tipos">
        {ENTREGAS_OPTS.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      <button
        type="button"
        onClick={() => {
          const id = crypto.randomUUID();
          onChange([
            ...entregas,
            {
              id,
              tipo: "Reels",
              quantidade: 1,
              status: "combinado",
              stage: "ROTEIRO_PRODUCAO",
            },
          ]);
          setSelectedId(id);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar entrega
      </button>

      {selected && (
        <EntregaDetailSheet
          influNome={influNome}
          influFoto={influFoto}
          entrega={selected}
          influActivity={influActivity}
          open={!!selected}
          onOpenChange={(open) => !open && setSelectedId(null)}
          onChange={(patch) => update(selected.id, patch)}
          onRunAction={(action, opts) => runAction(selected.id, action, opts)}
          onSetStage={(coluna) => setStage(selected.id, coluna)}
          onRemove={() => {
            onChange(entregas.filter((x) => x.id !== selected.id));
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}

/** Pagamento único do influenciador, cobrindo todas as entregas dele (não é
 * mais configurado por entrega individual). */
function PagamentoInfluSection({
  value,
  onChange,
}: {
  value?: PagamentoEntrega;
  onChange: (p: PagamentoEntrega | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      {value && (
        <div className="flex justify-end">
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${APROVACAO_TONE[value.aprovacao]}`}
          >
            {APROVACAO_LABEL[value.aprovacao]}
          </span>
        </div>
      )}
      <PagamentoEditor value={value} onChange={onChange} />
      {value &&
        (value.aprovacao === "pendente" ? (
          <div className="flex gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() =>
                onChange({ ...value, aprovacao: "aceito", data: value.data || todayISO() })
              }
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
            >
              Aceitar
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...value, aprovacao: "recusado" })}
              className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
            >
              Recusar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onChange({ ...value, aprovacao: "pendente" })}
            className="pt-0.5 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Marcar como pendente
          </button>
        ))}
    </div>
  );
}

/** Editor de redes sociais — mesmos toggles de plataforma + handle usados
 * na criação, reaproveitados aqui pra edição imediata de um influenciador
 * já existente. */
function RedesEditor({ redes, onChange }: { redes: Rede[]; onChange: (next: Rede[]) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {REDES_OPTS.map((p) => {
          const active = redes.some((r) => r.plataforma === p);
          return (
            <button
              key={p}
              type="button"
              onClick={() =>
                onChange(
                  active
                    ? redes.filter((r) => r.plataforma !== p)
                    : [...redes, { id: crypto.randomUUID(), plataforma: p, handle: "" }],
                )
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>
      {redes.length === 0 ? (
        <EmptyHint text="Nenhuma rede selecionada." />
      ) : (
        <div className="space-y-2">
          {redes.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
            >
              <span className="w-20 shrink-0 text-xs font-semibold text-foreground/80">
                {r.plataforma}
              </span>
              <span className="text-sm text-muted-foreground">@</span>
              <input
                value={r.handle}
                onChange={(e) =>
                  onChange(redes.map((x) => (x.id === r.id ? { ...x, handle: e.target.value } : x)))
                }
                placeholder="usuario"
                className="flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Editor de contrato — anexar/substituir/remover, mesmo padrão de upload
 * (base64) usado na criação, reaproveitado aqui pra edição imediata. */
function ContratoEditor({
  value,
  onChange,
}: {
  value?: string;
  onChange: (contrato: string | undefined) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <input
        ref={ref}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const r = new FileReader();
          r.onload = () => onChange(String(r.result));
          r.readAsDataURL(file);
        }}
      />
      {value ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-background p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="min-w-0 flex-1 truncate text-xs font-medium">Contrato anexado</p>
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="rounded-md px-2 py-1 text-xs font-medium hover:bg-muted"
          >
            Substituir
          </button>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Remover"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-transparent px-3 py-4 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
        >
          <Upload className="h-4 w-4" /> Anexar contrato
        </button>
      )}
    </div>
  );
}

/** Popup de anexos de uma entrega — usado nos cards de linha do tempo do
 * resumo (visualização compacta, sem precisar expandir o card inteiro só
 * pra anexar um arquivo). */
function EntregaAnexosPopup({
  entregaLabel,
  anexos,
  onChange,
}: {
  entregaLabel: string;
  anexos: EntregaAnexo[];
  onChange: (next: EntregaAnexo[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
      >
        <Paperclip className="h-3 w-3" /> Anexos{anexos.length > 0 ? ` (${anexos.length})` : ""}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm border-border bg-background">
          <DialogTitle className="text-sm font-semibold">Anexos · {entregaLabel}</DialogTitle>
          <DialogDescription className="sr-only">
            Anexos da entrega: visualize, adicione ou remova arquivos.
          </DialogDescription>
          <EntregaAnexosEditor anexos={anexos} onChange={onChange} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** `dataRecebimentoRoteiro`/`dataRecebimentoConteudo` são ao mesmo tempo
 * editáveis à mão E carimbadas automaticamente pelo motor no momento em
 * que o time anexa o arquivo (`entrega-engine.ts`) — não existe um campo
 * separado de "prazo planejado". Por isso essas datas são exibidas de
 * forma neutra (rótulo + valor), sem indicador de atrasado/no prazo: uma
 * comparação `data < hoje` não teria significado confiável aqui (ver
 * plano de redesenho de Entregas — ponto de atenção arquitetural). */
function formatDataCurta(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateISO;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

/** Data mais relevante pra exibir na linha resumida da lista — a mais
 * recente entre as 3 datas da entrega, só como valor informativo. */
function nextPrazoData(entrega: Entrega): { label: string; data: string } | null {
  const candidatos: [string, string | undefined][] = [
    ["Roteiro", entrega.dataRecebimentoRoteiro],
    ["Conteúdo final", entrega.dataRecebimentoConteudo],
    ["Publicação", entrega.dataPostagem],
  ];
  const preenchidos = candidatos.filter(
    (c): c is [string, string] => !!c[1] && !Number.isNaN(new Date(c[1]).getTime()),
  );
  if (preenchidos.length === 0) return null;
  const [label, data] = preenchidos.reduce((a, b) => (a[1] > b[1] ? a : b));
  return { label, data };
}

/** Banner de "Situação atual" — o elemento mais importante do painel.
 * Nunca dá pra escolher um estágio aqui (isso é o motor quem decide);
 * só traduz o `stage` atual numa frase que qualquer pessoa entende sem
 * precisar saber o nome interno do estado. */
function EntregaSituacaoBanner({
  stage,
  reprovacao,
}: {
  stage: EntregaStage;
  reprovacao?: ClienteVeredito;
}) {
  const icon = entregaStatusIcon(stage);
  const Icon = icon === "warning" ? AlertTriangle : icon === "success" ? CheckCircle2 : CircleDot;
  const tone =
    icon === "warning"
      ? "border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-300"
      : icon === "success"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
        : "border-border bg-muted/40 text-foreground";
  return (
    <div className={`space-y-1 rounded-md border p-3 ${tone}`}>
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {ENTREGA_STAGE_LABEL[stage]}
      </p>
      <p className="text-xs opacity-90">{ENTREGA_STAGE_DESCRIPTION[stage]}</p>
      {reprovacao && <p className="pt-0.5 text-xs font-medium opacity-90">"{reprovacao.motivo}"</p>}
    </div>
  );
}

// Agrupamento em 4 fases (não os 8 estágios internos do motor) só pra
// dar um "Mover para" rápido e um stepper visual no painel de detalhe —
// pedido explícito: dá pra colocar a entrega na fase desejada direto,
// sem depender de rodar a ação certa (sem travas). Puramente de
// apresentação: nunca substitui `ENTREGA_STAGE_ORDER`/transições reais,
// só decide o estágio de ENTRADA de cada fase quando movido na mão.
const ENTREGA_FASE_COLUNAS = ["ROTEIRO", "CONTEUDO", "PUBLICACAO", "CONCLUIDO"] as const;
type EntregaFaseColuna = (typeof ENTREGA_FASE_COLUNAS)[number];
const ENTREGA_FASE_COLUNA_LABEL: Record<EntregaFaseColuna, string> = {
  ROTEIRO: "Roteiro",
  CONTEUDO: "Conteúdo",
  PUBLICACAO: "Publicação",
  CONCLUIDO: "Concluído",
};
const ENTREGA_FASE_COLUNA_DOT: Record<EntregaFaseColuna, string> = {
  ROTEIRO: "bg-muted-foreground/40",
  CONTEUDO: "bg-sky-500",
  PUBLICACAO: "bg-teal-500",
  CONCLUIDO: "bg-emerald-500",
};
const ENTREGA_FASE_COLUNA_ENTRY_STAGE: Record<EntregaFaseColuna, EntregaStage> = {
  ROTEIRO: "ROTEIRO_PRODUCAO",
  CONTEUDO: "PRODUCAO",
  PUBLICACAO: "PUBLICACAO",
  CONCLUIDO: "PUBLICADA",
};
function entregaFaseColuna(stage: EntregaStage): EntregaFaseColuna {
  if (stage === "PUBLICADA") return "CONCLUIDO";
  const { fase } = entregaFaseConceitual(stage);
  if (fase === "Roteiro") return "ROTEIRO";
  if (fase === "Conteúdo") return "CONTEUDO";
  return "PUBLICACAO";
}

/** View dedicada de uma entrega — de quem é (quando `influNome` é
 * passado), progresso, próxima ação, prazos, arquivos e histórico. Abre
 * num Sheet lateral ao clicar numa linha de `EntregasEditor`, em vez de
 * expandir inline. */
function EntregaDetailSheet({
  influNome,
  influFoto,
  entrega,
  influActivity,
  open,
  onOpenChange,
  onChange,
  onRunAction,
  onSetStage,
  onRemove,
}: {
  influNome?: string;
  influFoto?: string;
  entrega: Entrega;
  influActivity: InfluActivity[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<Entrega>) => void;
  onRunAction: (action: EntregaEngineActionKind, opts?: EntregaActionOpts) => void;
  onSetStage: (coluna: EntregaFaseColuna) => void;
  onRemove: () => void;
}) {
  const stage = entrega.stage ?? "ROTEIRO_PRODUCAO";
  const step = deriveEntregaNextStep(entrega);
  const colunaAtual = entregaFaseColuna(stage);
  const colunaAtualIndex = ENTREGA_FASE_COLUNAS.indexOf(colunaAtual);
  const label = entrega.titulo ? `${entrega.tipo} · ${entrega.titulo}` : entrega.tipo;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [editandoCabecalho, setEditandoCabecalho] = useState(false);

  // Casa por `entregaId` quando presente (atividade registrada depois
  // desse campo existir); cai pro casamento por substring do tipo só pra
  // atividade antiga que não tem o id.
  const historico = influActivity
    .filter((a) =>
      a.entregaId
        ? a.entregaId === entrega.id
        : a.action.toLowerCase().includes(entrega.tipo.toLowerCase()),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const reprovacao =
    stage === "ROTEIRO_AJUSTES"
      ? entrega.roteiroReprovacao
      : stage === "CONTEUDO_AJUSTES"
        ? entrega.conteudoReprovacao
        : undefined;

  // Ação principal contextual — o motor já disse qual é a única válida
  // agora (`step.action`). "Adicionar roteiro"/"conteúdo final" abrem o
  // seletor de arquivo antes de chamar o motor; as demais chamam direto.
  const handleActionClick = () => {
    if (!step.action) return;
    if (step.action === "anexar_roteiro" || step.action === "anexar_conteudo") {
      fileRef.current?.click();
      return;
    }
    onRunAction(step.action);
  };

  const handleFileForAction = async (file: File) => {
    if (step.action !== "anexar_roteiro" && step.action !== "anexar_conteudo") return;
    setUploading(true);
    setUploadError("");
    try {
      const url = await uploadEntregaAnexo(file);
      const categoria: EntregaAnexoCategoria =
        step.action === "anexar_roteiro" ? "Roteiro" : "Conteúdo final";
      onRunAction(step.action, { anexo: { categoria, nome: file.name, url } });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha ao subir o arquivo.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <SheetTitle className="sr-only">Entrega · {label}</SheetTitle>
        <SheetDescription className="sr-only">
          Detalhes de cronograma, progresso, arquivos, aprovação e histórico desta entrega.
        </SheetDescription>

        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (fileRef.current) fileRef.current.value = "";
            if (file) void handleFileForAction(file);
          }}
        />

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Cabeçalho — de quem é (quando `influNome` é passado) + o quê
              é; edição de tipo/título/quantidade fica atrás de "Editar"
              pra não competir com o resto. */}
          <div className="space-y-2 border-b border-border pb-4 pr-8">
            <div className="flex items-start gap-3">
              {influNome && (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
                  {influFoto ? (
                    <img src={influFoto} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {influNome && (
                  <p className="truncate text-xs font-medium text-muted-foreground">{influNome}</p>
                )}
                <p className="truncate text-lg font-bold text-foreground">
                  {entrega.tipo || "Sem tipo"}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    · {entrega.quantidade} {entrega.quantidade === 1 ? "unidade" : "unidades"}
                  </span>
                </p>
                {entrega.titulo && (
                  <p className="truncate text-xs text-muted-foreground">{entrega.titulo}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditandoCabecalho((v) => !v)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Editar tipo, título e quantidade"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
            {editandoCabecalho && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
                <input
                  list="entregas-tipos"
                  value={entrega.tipo}
                  onChange={(ev) => onChange({ tipo: ev.target.value })}
                  placeholder="Tipo (Reels, Stories...)"
                  className="min-w-[130px] rounded-md border border-border bg-background px-2 py-1 text-xs font-medium outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  value={entrega.titulo ?? ""}
                  onChange={(ev) => onChange({ titulo: ev.target.value || undefined })}
                  placeholder="Título (opcional)"
                  className="min-w-[130px] flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                />
                <div className="flex shrink-0 items-center rounded-md bg-background">
                  <button
                    type="button"
                    onClick={() => onChange({ quantidade: Math.max(1, entrega.quantidade - 1) })}
                    className="h-7 w-7 text-sm text-muted-foreground hover:text-foreground"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-xs font-medium tabular-nums">
                    {entrega.quantidade}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange({ quantidade: entrega.quantidade + 1 })}
                    className="h-7 w-7 text-sm text-muted-foreground hover:text-foreground"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Progresso — as 4 fases num stepper único, sem repetir
              "Situação atual"/"Etapas" como dois blocos dizendo quase a
              mesma coisa. */}
          <div className="space-y-2">
            <FieldLabel title="Progresso" />
            <div className="flex items-center gap-1.5">
              {ENTREGA_FASE_COLUNAS.map((c, i) => (
                <div key={c} className="flex flex-1 flex-col items-center gap-1">
                  <span
                    className={`h-1.5 w-full rounded-full ${
                      i <= colunaAtualIndex ? ENTREGA_FASE_COLUNA_DOT[c] : "bg-muted"
                    }`}
                  />
                  <span
                    className={`text-center text-[9px] font-medium ${
                      i === colunaAtualIndex ? "text-foreground" : "text-muted-foreground/70"
                    }`}
                  >
                    {ENTREGA_FASE_COLUNA_LABEL[c]}
                  </span>
                </div>
              ))}
            </div>
            <EntregaSituacaoBanner stage={stage} reprovacao={reprovacao} />
          </div>

          {/* Próxima ação — um botão só, sem repetir o rótulo por cima. */}
          {step.action ? (
            <button
              type="button"
              onClick={handleActionClick}
              disabled={uploading}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm hover:opacity-90 disabled:opacity-60"
            >
              {uploading ? "Enviando..." : step.actionLabel}
            </button>
          ) : (
            stage !== "PUBLICADA" && (
              <p className="text-xs text-muted-foreground">
                {step.responsavel === "cliente"
                  ? "Aguardando aprovação do cliente."
                  : "Nenhuma ação pendente no momento."}
              </p>
            )
          )}
          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}

          {/* Mover manualmente — mesma liberdade de arrastar num kanban,
              aqui como botões: dá pra colocar a entrega na fase desejada
              direto, sem depender de rodar a ação certa. */}
          <div className="space-y-2">
            <FieldLabel title="Mover para" hint="Direto, sem passar pela ação." />
            <div className="grid grid-cols-4 gap-1.5">
              {ENTREGA_FASE_COLUNAS.map((c) => {
                const ativo = c === colunaAtual;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onSetStage(c)}
                    className={`rounded-md border px-1.5 py-1.5 text-center text-[11px] font-medium transition-colors ${
                      ativo
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                    }`}
                  >
                    {ENTREGA_FASE_COLUNA_LABEL[c]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prazos — grade compacta (rótulo em cima do input, não ao
              lado), sem indicador de atrasado/no prazo (ver comentário de
              formatDataCurta/nextPrazoData: essas datas não distinguem
              "prazo planejado" de "recebimento real"). */}
          <div className="space-y-2">
            <FieldLabel title="Prazos" />
            <div className="grid grid-cols-3 gap-2">
              <PrazoField
                label="Roteiro"
                value={entrega.dataRecebimentoRoteiro}
                onChange={(v) => onChange({ dataRecebimentoRoteiro: v })}
              />
              <PrazoField
                label="Conteúdo"
                value={entrega.dataRecebimentoConteudo}
                onChange={(v) => onChange({ dataRecebimentoConteudo: v })}
              />
              <PrazoField
                label="Publicação"
                value={entrega.dataPostagem}
                onChange={(v) => onChange({ dataPostagem: v })}
              />
            </div>
          </div>

          {/* Arquivos */}
          <div className="space-y-2">
            <FieldLabel title="Arquivos" />
            <EntregaAnexosEditor
              anexos={entrega.anexos ?? []}
              onChange={(anexos) => onChange({ anexos })}
            />
          </div>

          {/* Publicação — só quando já concluída (link + métricas). O
              motivo de reprovação do cliente já aparece em Situação
              atual, não fica mais numa seção "Aprovação" separada. */}
          {stage === "PUBLICADA" && (
            <div className="space-y-2 border-t border-border pt-4">
              <FieldLabel title="Publicação" />
              <div className="space-y-2">
                <AutoSaveInput
                  key={entrega.id}
                  value={entrega.url ?? ""}
                  onSave={(v) => onChange({ url: v })}
                  placeholder="Link do conteúdo publicado"
                />
                <MetricsEditor value={entrega.metrics} onChange={(m) => onChange({ metrics: m })} />
              </div>
            </div>
          )}

          {/* Histórico */}
          <div className="space-y-2 border-t border-border pt-4">
            <FieldLabel title="Histórico" />
            {historico.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Nenhum evento registrado ainda.</p>
            ) : (
              <div className="space-y-2">
                {historico.map((a) => (
                  <div key={a.id} className="text-xs leading-relaxed">
                    <span className="font-medium text-foreground">{a.author}</span>{" "}
                    <span className="text-muted-foreground">{a.action}</span>
                    <div className="text-[10px] text-muted-foreground/70">
                      {new Date(a.createdAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border bg-muted/30 p-3">
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover entrega
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Aba "Visão geral" do perfil — em poucos segundos dá pra entender status
 * atual, próxima ação e pendências, sem percorrer a página inteira (é o
 * resumo/hub; os detalhes completos ficam nas outras abas). */
function InfluVisaoGeralTab({
  influ,
  onGoToTab,
  onSetChecklist,
  onApplyChecklistToAll,
}: {
  influ: Influ;
  onGoToTab: (tab: string) => void;
  onSetChecklist: (checklist: ChecklistItem[]) => void;
  onApplyChecklistToAll: (checklist: ChecklistItem[]) => void;
}) {
  const entregas = influ.entregas;
  const publicadas = entregas.filter((e) => e.stage === "PUBLICADA").length;
  const aguardandoCliente = entregas.filter(
    (e) => e.stage === "ROTEIRO_APROVACAO" || e.stage === "CONTEUDO_APROVACAO",
  ).length;
  const pendentes = entregas.length - publicadas;
  const nextActor = nextActionForInflu(influ.status);

  const porTipo = new Map<string, Entrega[]>();
  for (const e of entregas) {
    porTipo.set(e.tipo || "Sem tipo", [...(porTipo.get(e.tipo || "Sem tipo") ?? []), e]);
  }

  return (
    <div className="space-y-5">
      {/* Resumo + próxima ação em destaque */}
      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {entregas.length} {entregas.length === 1 ? "entrega" : "entregas"} · {publicadas}{" "}
              publicada{publicadas === 1 ? "" : "s"} · {pendentes} pendente
              {pendentes === 1 ? "" : "s"}
              {aguardandoCliente > 0 && ` · ${aguardandoCliente} aguardando cliente`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Status: {INFLU_STATUS_LABEL[influ.status]}
            </p>
          </div>
          <NextActionBadge actor={nextActor} />
        </div>
      </div>

      {/* Entregas por tipo — resumo compacto, sem abrir detalhes aqui */}
      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <FieldLabel title="Entregas" hint="Resumo por tipo." />
          <button
            type="button"
            onClick={() => onGoToTab("entregas")}
            className="text-xs font-medium text-foreground underline underline-offset-2"
          >
            Abrir
          </button>
        </div>
        {porTipo.size === 0 ? (
          <EmptyHint text="Nenhuma entrega adicionada." />
        ) : (
          <div className="space-y-1.5">
            {[...porTipo.entries()].map(([tipo, list]) => (
              <div key={tipo} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-foreground">
                  {tipo}: {list.length} entrega{list.length === 1 ? "" : "s"}
                </span>
                <span className="text-muted-foreground">
                  {list.filter((e) => e.stage === "PUBLICADA").length} publicada(s)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outros dados — checkmarks linkando pra aba correspondente */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => onGoToTab("briefing")}
          className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left text-xs hover:bg-muted/40"
        >
          <span>Briefing</span>
          {influ.briefingPersonalizado || influ.briefingAnexoUrl ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onGoToTab("financeiro")}
          className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left text-xs hover:bg-muted/40"
        >
          <span>Contrato</span>
          {influ.contrato ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onGoToTab("financeiro")}
          className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left text-xs hover:bg-muted/40"
        >
          <span>Pagamento</span>
          <span
            className={
              influ.pagamento?.aprovacao === "aceito"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground"
            }
          >
            {influ.pagamento ? APROVACAO_LABEL[influ.pagamento.aprovacao] : "—"}
          </span>
        </button>
      </div>

      <ChecklistSection
        checklist={influ.checklist ?? []}
        onChange={onSetChecklist}
        onApplyToAll={onApplyChecklistToAll}
      />
    </div>
  );
}

/* ============================================================
 * Perfil do influenciador — diálogo único de visualização + edição.
 * Tudo salva imediato (sem botão "Salvar") e toda seção fica sempre
 * visível, empilhada por ordem de importância — nada fica atrás de um
 * clique pra revelar, e nunca abre um segundo diálogo.
 * ============================================================ */

function InfluencerProfileDialog({
  influ,
  has,
  cicloMesOptions,
  onOpenChange,
  onRemove,
  onSetStatus,
  onRunEntregaAction,
  onSetEntregaStage,
  onSetChecklist,
  onApplyChecklistToAll,
  onComment,
  onPatch,
  onSendToClient,
}: {
  influ: Influ;
  has: (k: InfluencerFieldKey) => boolean;
  cicloMesOptions?: { value: string; label: string }[];
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  onSetStatus: (status: InfluStatus) => void;
  onRunEntregaAction: (
    entregaId: string,
    action: EntregaEngineActionKind,
    opts?: {
      url?: string;
      anexo?: { categoria: EntregaAnexoCategoria; nome: string; url: string };
    },
  ) => void;
  onSetEntregaStage: (entregaId: string, coluna: EntregaFaseColuna) => void;
  onSetChecklist: (checklist: ChecklistItem[]) => void;
  onApplyChecklistToAll: (checklist: ChecklistItem[]) => void;
  onComment: (text: string) => void;
  onPatch: (patch: Partial<Influ>) => void;
  onSendToClient: () => void;
}) {
  const [commentText, setCommentText] = useState("");
  const [activeTab, setActiveTab] = useState("visao-geral");
  const bank = influ.bank ?? {};
  const fotoRef = useRef<HTMLInputElement>(null);

  const [editingHeader, setEditingHeader] = useState(false);
  const [draft, setDraft] = useState({
    nome: influ.nome,
    nicho: influ.nicho ?? "",
    telefone: influ.telefone ?? "",
    email: influ.email ?? "",
  });
  const startEditing = () => {
    setDraft({
      nome: influ.nome,
      nicho: influ.nicho ?? "",
      telefone: influ.telefone ?? "",
      email: influ.email ?? "",
    });
    setEditingHeader(true);
  };
  const saveHeader = () => {
    onPatch({
      nome: draft.nome,
      nicho: draft.nicho || undefined,
      telefone: draft.telefone || undefined,
      email: draft.email || undefined,
    });
    setEditingHeader(false);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0"
        onPointerDownOutside={() => {
          // Clicar fora fecha o diálogo antes do evento de blur do campo
          // focado terminar de disparar — o rascunho (ex: link de
          // publicação em AutoSaveInput) nunca chegava a salvar. Forçar o
          // blur aqui, síncrono, garante que o salvamento roda antes do
          // Radix desmontar o diálogo.
          (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
        <DialogTitle className="sr-only">Perfil do influenciador</DialogTitle>
        <DialogDescription className="sr-only">
          Informações completas do influenciador.
        </DialogDescription>

        {/* CABEÇALHO — avatar grande + nome; status/próxima ação numa linha
            própria abaixo do nome (não espremidos junto), contato como
            chips com contraste de verdade contra o card. Sem banner/degradê
            no topo — fundo plano, no mesmo tom do resto da plataforma. */}
        <div className="shrink-0 border-b border-border bg-background">
          <div className="px-7 pt-6 pb-6">
            <div className="flex flex-wrap items-start gap-5">
              <button
                type="button"
                onClick={() => fotoRef.current?.click()}
                aria-label="Trocar foto"
                className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted shadow-sm"
              >
                {influ.foto ? (
                  <img src={influ.foto} alt="" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-9 w-9 text-muted-foreground" strokeWidth={1.5} />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-foreground/60 text-background opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="h-5 w-5" />
                </span>
              </button>
              <input
                ref={fotoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void uploadInfluFoto(file).then((url) => {
                    if (url) onPatch({ foto: url });
                  });
                }}
              />
              <div className="min-w-0 flex-1 space-y-3 pt-2.5">
                {editingHeader ? (
                  <div className="space-y-2 rounded-lg border border-border bg-background p-3 shadow-sm">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={draft.nome}
                        onChange={(e) => setDraft((d) => ({ ...d, nome: e.target.value }))}
                        placeholder="Nome"
                        autoFocus
                        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-semibold outline-none focus:ring-1 focus:ring-ring"
                      />
                      <select
                        value={draft.nicho}
                        onChange={(e) => setDraft((d) => ({ ...d, nicho: e.target.value }))}
                        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Selecione um nicho</option>
                        {NICHOS.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <input
                        value={draft.telefone}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, telefone: formatPhoneBR(e.target.value) }))
                        }
                        placeholder="Telefone"
                        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                      />
                      <input
                        value={draft.email}
                        onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                        placeholder="E-mail"
                        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingHeader(false)}
                        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={saveHeader}
                        className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="group/name flex flex-wrap items-center gap-2">
                      <p className="truncate text-2xl font-bold tracking-tight text-foreground">
                        {influ.nome || "Sem nome"}
                      </p>
                      {influ.nicho && (
                        <span className="inline-block rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          {influ.nicho}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={startEditing}
                        className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/name:opacity-100"
                        aria-label="Editar nome, nicho e contato"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {has("status") && (
                        <InfluStatusPill value={influ.status} onChange={onSetStatus} />
                      )}
                      <NextActionBadge actor={nextActionForInflu(influ.status)} />
                      {influ.status === "EM_CURADORIA" && (
                        <button
                          type="button"
                          onClick={onSendToClient}
                          className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background shadow-sm hover:opacity-90"
                        >
                          Enviar para cliente
                        </button>
                      )}
                      {cicloMesOptions && cicloMesOptions.length > 0 && (
                        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          Mês
                          <select
                            value={influ.cicloMes ?? ""}
                            onChange={(e) => onPatch({ cicloMes: e.target.value })}
                            className="h-7 rounded-md border border-border bg-background px-1.5 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-ring"
                          >
                            {!influ.cicloMes && <option value="">Sem mês definido</option>}
                            {cicloMesOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {has("redes") &&
                    influ.redes.map((r) => (
                      <span
                        key={r.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm"
                      >
                        <PlatformIcon plataforma={r.plataforma} className="h-3.5 w-3.5" />
                        {r.handle ? `@${r.handle}` : r.plataforma}
                        {r.seguidores ? ` · ${formatSeguidores(r.seguidores)} seg.` : ""}
                      </span>
                    ))}
                  {influ.telefone && !editingHeader && (
                    <a
                      href={`tel:${influ.telefone.replace(/\D/g, "")}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
                    >
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatPhoneBR(influ.telefone)}
                    </a>
                  )}
                  {influ.email && !editingHeader && (
                    <a
                      href={`mailto:${influ.email}`}
                      className="inline-flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{influ.email}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_340px]">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex min-h-0 flex-col overflow-hidden"
          >
            <TabsList className="mx-7 mt-4 w-fit shrink-0">
              <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
              <TabsTrigger value="entregas">Entregas</TabsTrigger>
              <TabsTrigger value="perfil">Perfil</TabsTrigger>
              <TabsTrigger value="briefing">Briefing</TabsTrigger>
              <TabsTrigger value="metricas">Métricas</TabsTrigger>
              <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
            </TabsList>

            <TabsContent value="visao-geral" className="mt-0 flex-1 overflow-y-auto px-7 py-6">
              <InfluVisaoGeralTab
                influ={influ}
                onGoToTab={setActiveTab}
                onSetChecklist={onSetChecklist}
                onApplyChecklistToAll={onApplyChecklistToAll}
              />
            </TabsContent>

            <TabsContent value="entregas" className="mt-0 flex-1 overflow-y-auto px-7 py-6">
              {has("entregas") && (
                <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
                  <EntregasEditor
                    entregas={influ.entregas}
                    onChange={(next) => onPatch({ entregas: next })}
                    influActivity={influ.activity ?? []}
                    influNome={influ.nome}
                    influFoto={influ.foto}
                    onRunAction={onRunEntregaAction}
                    onSetStage={onSetEntregaStage}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="perfil" className="mt-0 flex-1 overflow-y-auto px-7 py-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {has("redes") && (
                  <ProfileSectionCard
                    title="Redes sociais"
                    icon={<Share2 className="h-3.5 w-3.5" />}
                    span="full"
                  >
                    <RedesEditor redes={influ.redes} onChange={(redes) => onPatch({ redes })} />
                  </ProfileSectionCard>
                )}
              </div>
            </TabsContent>

            <TabsContent value="briefing" className="mt-0 flex-1 overflow-y-auto px-7 py-6">
              <ProfileSectionCard
                title="Briefing e observações"
                icon={<FileText className="h-3.5 w-3.5" />}
                span="full"
              >
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel
                      title="Briefing personalizado"
                      hint="Instruções específicas pra este influenciador — aparece no portal do cliente."
                    />
                    <AutoSaveTextarea
                      key={influ.id}
                      value={influ.briefingPersonalizado ?? ""}
                      onSave={(v) => onPatch({ briefingPersonalizado: v || undefined })}
                      placeholder="Ex: focar no tom descontraído, evitar mencionar concorrentes..."
                    />
                    {influ.briefingAnexoUrl ? (
                      <div className="flex items-center gap-2 text-xs">
                        <a
                          href={influ.briefingAnexoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2"
                        >
                          <Paperclip className="h-3 w-3" />
                          {influ.briefingAnexoNome || "Anexo"}
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            onPatch({ briefingAnexoNome: undefined, briefingAnexoUrl: undefined })
                          }
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Remover anexo"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <BriefingAnexoUploadButton
                        onUpload={(nome, url) =>
                          onPatch({ briefingAnexoNome: nome, briefingAnexoUrl: url })
                        }
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      title="Observações"
                      hint="Nota livre — visível pro time e também no portal do cliente."
                    />
                    <AutoSaveTextarea
                      key={influ.id}
                      value={influ.observacoes ?? ""}
                      onSave={(v) => onPatch({ observacoes: v || undefined })}
                      placeholder="Ex: prefere ser contatado por WhatsApp à tarde..."
                    />
                  </div>
                </div>
              </ProfileSectionCard>

              {influ.inscricaoRespostas && influ.inscricaoRespostas.length > 0 && (
                <ProfileSectionCard
                  title="Respostas da inscrição"
                  hint="Perguntas personalizadas da Página de Inscrição, respondidas no momento em que este influenciador se candidatou."
                  icon={<FileText className="h-3.5 w-3.5" />}
                  span="full"
                >
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {influ.inscricaoRespostas.map((r) => (
                      <div key={r.questionId} className="space-y-0.5">
                        <dt className="text-xs font-medium text-muted-foreground">{r.label}</dt>
                        <dd className="text-sm text-foreground">
                          {Array.isArray(r.value) ? r.value.join(", ") || "—" : r.value || "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </ProfileSectionCard>
              )}
            </TabsContent>

            <TabsContent value="metricas" className="mt-0 flex-1 overflow-y-auto px-7 py-6">
              {has("metricas") && (
                <ProfileSectionCard
                  title="Métricas do perfil"
                  hint="Por rede social."
                  icon={<BarChart3 className="h-3.5 w-3.5" />}
                  span="full"
                >
                  <ProfileMetricsEditor
                    redes={influ.redes}
                    onChangeRedes={(redes) => onPatch({ redes })}
                    value={influ.profileMetrics}
                    onChange={(profileMetrics) => onPatch({ profileMetrics })}
                  />
                </ProfileSectionCard>
              )}
            </TabsContent>

            <TabsContent value="financeiro" className="mt-0 flex-1 overflow-y-auto px-7 py-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {has("pagamentos") && (
                  <ProfileSectionCard
                    title="Pagamento"
                    hint="Valor combinado, cobrindo todas as entregas."
                    icon={<Coins className="h-3.5 w-3.5" />}
                  >
                    <PagamentoInfluSection
                      value={influ.pagamento}
                      onChange={(pagamento) => onPatch({ pagamento })}
                    />
                  </ProfileSectionCard>
                )}

                {has("bancario") && (
                  <ProfileSectionCard
                    title="Dados bancários"
                    icon={<Landmark className="h-3.5 w-3.5" />}
                  >
                    <BankFields value={bank} onChange={(b) => onPatch({ bank: b })} compact />
                  </ProfileSectionCard>
                )}

                {has("contrato") && (
                  <ProfileSectionCard
                    title="Contrato"
                    icon={<FileSignature className="h-3.5 w-3.5" />}
                    span="full"
                  >
                    <ContratoEditor
                      value={influ.contrato}
                      onChange={(contrato) => onPatch({ contrato })}
                    />
                  </ProfileSectionCard>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex min-h-0 flex-col border-l border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <p className="text-sm font-semibold">Atividade</p>
              <span className="text-[10px] text-muted-foreground">
                {(influ.activity?.length ?? 0) + (influ.comments?.length ?? 0)}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {(influ.comments?.length ?? 0) + (influ.activity?.length ?? 0) === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nenhuma atividade ou comentário ainda.
                </p>
              ) : (
                <div className="space-y-3">
                  {[
                    ...(influ.activity ?? []).map((a) => ({ kind: "activity" as const, item: a })),
                    ...(influ.comments ?? []).map((c) => ({ kind: "comment" as const, item: c })),
                  ]
                    .sort(
                      (a, b) =>
                        new Date(a.item.createdAt).getTime() - new Date(b.item.createdAt).getTime(),
                    )
                    .map((e) => (
                      <div key={e.item.id} className="flex min-w-0 items-start gap-2">
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-semibold ${e.item.color}`}
                        >
                          {e.item.initials}
                        </span>
                        {e.kind === "activity" ? (
                          <div className="min-w-0 flex-1 break-words text-xs leading-relaxed [overflow-wrap:anywhere]">
                            <span className="font-medium text-foreground">{e.item.author}</span>{" "}
                            <span className="text-muted-foreground">{e.item.action}</span>
                            <div className="text-[10px] text-muted-foreground/70">
                              {new Date(e.item.createdAt).toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-2">
                            <div className="mb-0.5 flex items-baseline gap-1.5">
                              <span className="text-xs font-medium">{e.item.author}</span>
                              <span className="text-[10px] text-muted-foreground/70">
                                {new Date(e.item.createdAt).toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <div className="whitespace-pre-wrap break-words text-xs leading-relaxed [overflow-wrap:anywhere]">
                              {linkifyText(e.item.text)}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div className="border-t border-border bg-background p-3">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (commentText.trim()) {
                      onComment(commentText);
                      setCommentText("");
                    }
                  }
                }}
                rows={2}
                placeholder="Escreva um comentário..."
                className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/70 focus:border-primary"
              />
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!commentText.trim()) return;
                    onComment(commentText);
                    setCommentText("");
                  }}
                  disabled={!commentText.trim()}
                  className="rounded-md bg-foreground px-2.5 py-1 text-[11px] font-medium text-background hover:opacity-90 disabled:opacity-50"
                >
                  Comentar
                </button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t border-border bg-muted/30 px-6 py-3 sm:justify-between">
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * Diálogo de criação — só pra novo influenciador (editar um já
 * existente abre o perfil acima, nunca este formulário).
 * ============================================================ */
function InfluenciadorDialog({
  open,
  onOpenChange,
  has,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  has: (k: InfluencerFieldKey) => boolean;
  onSave: (i: Influ) => void;
}) {
  const [foto, setFoto] = useState<string | undefined>();
  const [nome, setNome] = useState("");
  const [nicho, setNicho] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [redes, setRedes] = useState<Rede[]>([]);
  const [profileMetrics, setProfileMetrics] = useState<ProfileMetrics>({});
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [pagamento, setPagamento] = useState<PagamentoEntrega | undefined>();
  const [contrato, setContrato] = useState<string | undefined>();
  const [status, setStatus] = useState<InfluStatus>("EM_CURADORIA");
  const [bank, setBank] = useState<BankInfo>({});
  const [saving, setSaving] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setFoto(undefined);
    setNome("");
    setNicho("");
    setTelefone("");
    setEmail("");
    setRedes([]);
    setProfileMetrics({});
    setEntregas([]);
    setPagamento(undefined);
    setContrato(undefined);
    setStatus("EM_CURADORIA");
    setBank({});
  }, [open]);

  const submit = () => {
    if (saving || !nome.trim()) return;
    setSaving(true);
    onSave({
      id: crypto.randomUUID(),
      foto,
      nome: nome.trim(),
      nicho: nicho || undefined,
      telefone: telefone.trim() || undefined,
      email: email.trim() || undefined,
      redes,
      profileMetrics,
      entregas,
      pagamento,
      contrato,
      status,
      statusUpdatedAt: todayISO(),
      bank,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-0 overflow-hidden border-border bg-background p-0">
        <div className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold">Novo influenciador</DialogTitle>
          <DialogDescription className="sr-only">Cadastrar novo influenciador</DialogDescription>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <section className="space-y-5">
            <FieldLabel title="Foto e nome" hint="Comece pela identificação do influenciador." />
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => fotoRef.current?.click()}
                className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border transition-all hover:ring-foreground/30"
                aria-label="Alterar foto"
              >
                {foto ? (
                  <>
                    <img src={foto} alt="" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-foreground/60 text-background opacity-0 transition-opacity group-hover:opacity-100">
                      <Camera className="h-5 w-5" />
                    </span>
                  </>
                ) : (
                  <Camera className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                )}
              </button>
              <input
                ref={fotoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void uploadInfluFoto(file).then((url) => {
                    if (url) setFoto(url);
                  });
                }}
              />
              <button
                type="button"
                onClick={() => fotoRef.current?.click()}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {foto ? "Trocar foto" : "Adicionar foto"}
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-tight text-foreground/80">
                Nome
              </label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo ou @handle"
                autoFocus
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-tight text-foreground/80">
                Nicho
              </label>
              <select
                value={nicho}
                onChange={(e) => setNicho(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              >
                <option value="">Selecione um nicho</option>
                {NICHOS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-tight text-foreground/80">
                  Telefone
                </label>
                <input
                  value={telefone}
                  onChange={(e) => setTelefone(formatPhoneBR(e.target.value))}
                  placeholder="(00) 00000-0000"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-tight text-foreground/80">
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            {has("redes") && (
              <div className="space-y-4 border-t border-border pt-5">
                <FieldLabel
                  title="Redes sociais"
                  hint="Selecione as plataformas e adicione o handle. Seguidores e demais métricas ficam em Métricas."
                />
                <RedesEditor redes={redes} onChange={setRedes} />
              </div>
            )}
          </section>

          {has("metricas") && (
            <section className="space-y-3 border-t border-border pt-6">
              <FieldLabel
                title="Métricas do perfil"
                hint="Métricas por rede social — vindas dos insights nativos de cada plataforma, não de uma entrega específica."
              />
              <ProfileMetricsEditor
                redes={redes}
                onChangeRedes={setRedes}
                value={profileMetrics}
                onChange={setProfileMetrics}
              />
            </section>
          )}

          {has("entregas") && (
            <section className="border-t border-border pt-6">
              <EntregasEditor
                entregas={entregas}
                onChange={setEntregas}
                influNome={nome || undefined}
                influFoto={foto}
              />
            </section>
          )}

          {has("pagamentos") && (
            <section className="space-y-1.5 border-t border-border pt-6">
              <FieldLabel title="Pagamento" hint="Valor combinado, cobrindo todas as entregas." />
              <PagamentoInfluSection value={pagamento} onChange={setPagamento} />
            </section>
          )}

          {has("bancario") && (
            <section className="space-y-3 border-t border-border pt-6">
              <FieldLabel
                title="Dados bancários"
                hint="Para transferência ou PIX ao influenciador."
              />
              <BankFields value={bank} onChange={setBank} />
            </section>
          )}

          {has("contrato") && (
            <section className="space-y-3 border-t border-border pt-6">
              <FieldLabel title="Contrato assinado" hint="Anexe PDF, imagem ou documento." />
              <ContratoEditor value={contrato} onChange={setContrato} />
            </section>
          )}

          {has("status") && (
            <section className="space-y-3 border-t border-border pt-6">
              <FieldLabel title="Status inicial" hint="Onde este influenciador começa no fluxo." />
              <div className="flex flex-col gap-1.5">
                {INFLU_STATUSES.map((s) => {
                  const active = status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      <span>{s}</span>
                      {active && <CheckCircle2 className="h-4 w-4" />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-background px-6 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!nome.trim() || saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Salvando..." : "Salvar influenciador"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Input de linha única com o mesmo padrão da AutoSaveTextarea abaixo —
 * estado local, salva só ao sair do campo. Sem isso, cada tecla digitada
 * (ex: colando/editando um link) disparava um upsert próprio no Supabase;
 * várias escritas concorrentes para o mesmo campo podiam se atropelar e
 * fazer a edição "não salvar" (o toast de erro aparecia, ou uma escrita
 * mais rápida sobrescrevia uma mais lenta com um valor antigo). */
function AutoSaveInput({
  value,
  onSave,
  placeholder,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
      placeholder={placeholder}
      className={
        className ??
        "w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
      }
    />
  );
}

/** Textarea com estado local, salvando só ao sair do campo (blur) — evita
 * gravar (e sincronizar com o Supabase) a cada tecla digitada num texto
 * livre, sem precisar de debounce. */
function AutoSaveTextarea({
  value,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
      placeholder={placeholder}
      rows={3}
      className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
    />
  );
}

/** Botão "Anexar arquivo" pro briefing personalizado — sobe pro Storage
 * (bucket `entrega-anexos`, mesmo usado pelos anexos de entrega) em vez de
 * base64 embutido no jsonb, que falha silenciosamente em arquivos maiores. */
function BriefingAnexoUploadButton({
  onUpload,
}: {
  onUpload: (nome: string, url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
      >
        <Paperclip className="h-3 w-3" /> {uploading ? "Enviando..." : "Anexar arquivo"}
      </button>
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
      <input
        ref={ref}
        type="file"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setUploading(true);
          setError("");
          try {
            const url = await uploadEntregaAnexo(file);
            onUpload(file.name, url);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Falha ao subir o arquivo.");
          } finally {
            setUploading(false);
          }
        }}
      />
    </>
  );
}

function FieldLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Moldura em card reutilizada por toda seção do perfil do influenciador
 * (Entregas, Pagamento, Redes, Métricas etc) — ícone em badge + título,
 * substituindo o antigo empilhamento de seções separadas só por
 * `border-t`, sem hierarquia visual nenhuma entre elas. */
function ProfileSectionCard({
  title,
  hint,
  icon,
  action,
  span,
  children,
}: {
  title: string;
  hint?: string;
  icon: ReactNode;
  action?: ReactNode;
  /** Ocupa as duas colunas do grid (seções grandes, tipo tabela de
   * entregas) — sem isso a seção fica numa coluna só, lado a lado com a
   * próxima, pra reduzir o tanto de scroll da página. */
  span?: "full";
  children: ReactNode;
}) {
  return (
    <div
      className={`space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm ${span === "full" ? "sm:col-span-2" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground">
            {icon}
          </span>
          <FieldLabel title={title} hint={hint} />
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function BankFields({
  value,
  onChange,
  compact = false,
}: {
  value: BankInfo;
  onChange: (v: BankInfo) => void;
  compact?: boolean;
}) {
  const set = (patch: Partial<BankInfo>) => onChange({ ...value, ...patch });
  const inp =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";
  const lbl = "block text-[11px] font-semibold uppercase tracking-tight text-foreground/70 mb-1";
  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div>
        <label className={lbl}>Titular</label>
        <input
          className={inp}
          value={value.titular ?? ""}
          onChange={(e) => set({ titular: e.target.value })}
          placeholder="Nome completo"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className={lbl}>CPF / CNPJ</label>
          <input
            className={inp}
            value={value.cpfCnpj ?? ""}
            onChange={(e) => set({ cpfCnpj: e.target.value })}
            placeholder="000.000.000-00"
          />
        </div>
        <div>
          <label className={lbl}>Banco</label>
          <input
            className={inp}
            value={value.banco ?? ""}
            onChange={(e) => set({ banco: e.target.value })}
            placeholder="Ex: Nubank"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div>
          <label className={lbl}>Agência</label>
          <input
            className={inp}
            value={value.agencia ?? ""}
            onChange={(e) => set({ agencia: e.target.value })}
            placeholder="0000"
          />
        </div>
        <div>
          <label className={lbl}>Conta</label>
          <input
            className={inp}
            value={value.conta ?? ""}
            onChange={(e) => set({ conta: e.target.value })}
            placeholder="00000-0"
          />
        </div>
        <div>
          <label className={lbl}>Tipo</label>
          <select
            className={inp}
            value={value.tipoConta ?? ""}
            onChange={(e) => set({ tipoConta: e.target.value as BankInfo["tipoConta"] })}
          >
            <option value="">—</option>
            <option value="corrente">Corrente</option>
            <option value="poupanca">Poupança</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-[140px_1fr] gap-2">
        <div>
          <label className={lbl}>Tipo PIX</label>
          <select
            className={inp}
            value={value.pixTipo ?? ""}
            onChange={(e) => set({ pixTipo: e.target.value as BankInfo["pixTipo"] })}
          >
            <option value="">—</option>
            <option value="cpf">CPF</option>
            <option value="cnpj">CNPJ</option>
            <option value="email">E-mail</option>
            <option value="telefone">Telefone</option>
            <option value="aleatoria">Aleatória</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Chave PIX</label>
          <input
            className={inp}
            value={value.pixChave ?? ""}
            onChange={(e) => set({ pixChave: e.target.value })}
            placeholder="Chave PIX"
          />
        </div>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
      {text}
    </p>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label="Remover"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

/* ============================================================
 * Pagamento — editor (per entrega, mirrors campaign's PagTipo UI) and
 * the read+approve list shared by the wizard's Pagamentos step and the
 * profile dialog.
 * ============================================================ */

function PagamentoEditor({
  value,
  onChange,
}: {
  value?: PagamentoEntrega;
  onChange: (p: PagamentoEntrega | undefined) => void;
}) {
  const norm = normalizePagamento(value);
  if (!norm) {
    return (
      <button
        type="button"
        onClick={() => onChange({ tipos: [], config: {}, aprovacao: "pendente" })}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      >
        <Coins className="h-3 w-3" /> Adicionar pagamento
      </button>
    );
  }
  const update = (patch: Partial<PagamentoEntrega>) => onChange({ ...norm, ...patch });
  const toggleTipo = (t: PagTipoEntrega) =>
    update({
      tipos: norm.tipos.includes(t) ? norm.tipos.filter((x) => x !== t) : [...norm.tipos, t],
    });
  const updateConfig = (t: PagTipoEntrega, patch: Partial<PagamentoConfigEntrega>) =>
    update({ config: { ...norm.config, [t]: { ...(norm.config[t] ?? {}), ...patch } } });

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {PAG_TIPOS_ENTREGA.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTipo(t)}
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                norm.tipos.includes(t)
                  ? "bg-foreground text-background"
                  : "bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remover pagamento"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {norm.tipos.includes("Valor") && (
        <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2">
          <span className="text-xs text-muted-foreground">R$</span>
          <input
            value={norm.config.Valor?.valor ?? ""}
            onChange={(e) => updateConfig("Valor", { valor: e.target.value })}
            placeholder="0,00"
            className="w-full bg-transparent py-1.5 text-sm tabular-nums outline-none"
          />
        </div>
      )}
      {norm.tipos.includes("Por Hora") && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2">
            <span className="text-xs text-muted-foreground">R$/h</span>
            <input
              value={norm.config["Por Hora"]?.porHoraValor ?? ""}
              onChange={(e) => updateConfig("Por Hora", { porHoraValor: e.target.value })}
              placeholder="0,00"
              className="w-full bg-transparent py-1.5 text-sm tabular-nums outline-none"
            />
          </div>
          <textarea
            value={norm.config["Por Hora"]?.porHoraDescricao ?? ""}
            onChange={(e) => updateConfig("Por Hora", { porHoraDescricao: e.target.value })}
            placeholder="Detalhes (ex: quantidade de horas estimada, escopo do trabalho...)"
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
          />
        </div>
      )}
      {norm.tipos.includes("Comissão") && (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <input
            value={norm.config.Comissão?.comissaoPct ?? ""}
            onChange={(e) => updateConfig("Comissão", { comissaoPct: e.target.value })}
            placeholder="Ex: 10%"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
          />
          <input
            value={norm.config.Comissão?.comissaoSobre ?? ""}
            onChange={(e) => updateConfig("Comissão", { comissaoSobre: e.target.value })}
            placeholder="Sobre o quê (ex: vendas via cupom)"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
          />
        </div>
      )}
      {norm.tipos.includes("Permuta") && (
        <textarea
          value={norm.config.Permuta?.permutaDescricao ?? ""}
          onChange={(e) => updateConfig("Permuta", { permutaDescricao: e.target.value })}
          placeholder="Descrição da permuta"
          rows={2}
          className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
        />
      )}
      {norm.tipos.includes("Outro") && (
        <div className="space-y-1.5">
          <input
            value={norm.config.Outro?.outroDescricao ?? ""}
            onChange={(e) => updateConfig("Outro", { outroDescricao: e.target.value })}
            placeholder="Descrição"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
          />
          <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2">
            <span className="text-xs text-muted-foreground">R$</span>
            <input
              value={norm.config.Outro?.outroValor ?? ""}
              onChange={(e) => updateConfig("Outro", { outroValor: e.target.value })}
              placeholder="0,00"
              className="w-full bg-transparent py-1.5 text-sm tabular-nums outline-none"
            />
          </div>
          <textarea
            value={norm.config.Outro?.outroCriterios ?? ""}
            onChange={(e) => updateConfig("Outro", { outroCriterios: e.target.value })}
            placeholder="Critérios de pagamento"
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
          />
        </div>
      )}
      <input
        type="date"
        value={norm.data ?? ""}
        onChange={(e) => update({ data: e.target.value })}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
      />

      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">Comprovante</p>
        {norm.comprovanteUrl ? (
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
            <a
              href={norm.comprovanteUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-foreground hover:underline"
            >
              <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{norm.comprovanteNome || "Comprovante"}</span>
            </a>
            <button
              type="button"
              onClick={() => update({ comprovanteNome: undefined, comprovanteUrl: undefined })}
              aria-label="Remover comprovante"
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <BriefingAnexoUploadButton
            onUpload={(nome, url) => update({ comprovanteNome: nome, comprovanteUrl: url })}
          />
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Some como <b>Pendente</b> — só vira despesa no Financeiro depois de aceito (Aceitar/Recusar
        fica logo abaixo, quando esse campo estiver habilitado).
      </p>
    </div>
  );
}

/* ============================================================
 * Entrega anexos — lista de arquivos ligados a uma entrega (roteiro,
 * gravação, conteúdo publicado, etc), independente do status/etapa em que
 * ela está e sem limite de quantidade por categoria.
 * ============================================================ */

/** Campo de data compacto (rótulo em cima, não ao lado) — usado em grade
 * de 3 colunas no painel de detalhe da entrega; rótulo ao lado (largura
 * fixa) estourava/sobrepunha o input nessa largura estreita. */
function PrazoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[10px] font-medium text-muted-foreground">{label}</span>
      <input
        type="date"
        value={value ?? ""}
        onChange={(ev) => onChange(ev.target.value || undefined)}
        className="w-full min-w-0 rounded-md border border-border bg-background px-1.5 py-1 text-[11px] outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  );
}

const ENTREGA_ANEXO_ICON: Record<EntregaAnexoCategoria, typeof FileText> = {
  Roteiro: FileText,
  Gravação: Film,
  "Conteúdo final": Upload,
  Outro: Paperclip,
};
function isImageName(nome: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(nome);
}
function isVideoName(nome: string): boolean {
  return /\.(mp4|mov|webm|avi|mkv)$/i.test(nome);
}

/** Sobe a foto de perfil pro bucket `avatars` (Storage) e devolve uma URL
 * assinada válida por ~10 anos — antes virava um data: URL (base64) direto
 * na linha JSONB: ~80KB por foto, baixados de novo em TODA busca/resync da
 * tabela inteira (não só quando alguém realmente vê a foto), inflando
 * bastante o egress. Mesmo padrão de `uploadEntregaAnexo` abaixo. */
async function uploadInfluFoto(file: File): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const ext = (file.name.split(".").pop() || "jpg").replace(/[^\w]+/g, "");
  // A policy de INSERT do bucket `avatars` exige que o primeiro segmento do
  // path seja o uid de quem está subindo (mesma regra já usada pelas
  // policies de leitura/update/delete) — o path antigo começava com
  // "campanha_influenciadores/", nunca batendo com `auth.uid()`, e por isso
  // TODO upload de foto de perfil vinha falhando com RLS silenciosamente.
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) {
    console.warn("[avatars] upload failed", error);
    return null;
  }
  const { data: signed } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  return signed?.signedUrl ?? null;
}

// Precisa acompanhar o "Max file size" configurado no Storage do Supabase
// (Dashboard → Storage → Configuration) — hoje 100MB. Checar no cliente
// evita esperar o upload inteiro (às vezes minutos, num vídeo grande) só
// pra descobrir no fim que o servidor ia recusar.
const ENTREGA_ANEXO_MAX_BYTES = 100 * 1024 * 1024;

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Sobe o arquivo pro bucket `entrega-anexos` (Storage) e devolve uma URL
 * assinada válida por ~1 ano — antes o arquivo virava um data: URL (base64)
 * embutido direto na linha JSONB, o que falhava silenciosamente pra
 * arquivos maiores (vídeos): o anexo nunca era salvo de fato. Mesmo padrão
 * já usado em `uploadChatAttachment` (chat-store.ts). Lança erro (em vez de
 * devolver `null`) com uma mensagem específica pro chamador poder mostrar
 * pra quem tentou o upload, em vez de um "falhou" genérico. */
async function uploadEntregaAnexo(file: File): Promise<string> {
  if (file.size > ENTREGA_ANEXO_MAX_BYTES) {
    throw new Error(
      `Arquivo muito grande (${formatMB(file.size)}). O máximo permitido é ${formatMB(ENTREGA_ANEXO_MAX_BYTES)}.`,
    );
  }
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Sessão expirada — atualize a página e tente de novo.");
  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const { error } = await supabase.storage.from("entrega-anexos").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) {
    console.warn("[entrega-anexos] upload failed", error);
    throw new Error("Falha ao subir o arquivo. Tente de novo.");
  }
  const { data: signed } = await supabase.storage
    .from("entrega-anexos")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (!signed) throw new Error("Falha ao gerar o link do arquivo. Tente de novo.");
  return signed.signedUrl;
}

/** Miniatura do anexo — imagem de verdade quando dá, ícone por tipo de
 * arquivo nos outros casos (vídeo, documento) — antes era só um nome de
 * arquivo sublinhado, difícil de saber de relance o que era cada anexo. */
function AnexoThumb({ nome, url }: { nome: string; url: string }) {
  if (isImageName(nome)) {
    return (
      <img
        src={url}
        alt=""
        className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
      />
    );
  }
  const Icon = isVideoName(nome) ? FileVideo : FileText;
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
      <Icon className="h-4 w-4" />
    </div>
  );
}

function EntregaAnexosEditor({
  anexos,
  onChange,
}: {
  anexos: EntregaAnexo[];
  onChange: (next: EntregaAnexo[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingCategoria = useRef<EntregaAnexoCategoria>("Roteiro");
  const [uploading, setUploading] = useState<EntregaAnexoCategoria | null>(null);
  const [error, setError] = useState("");

  const pick = (c: EntregaAnexoCategoria) => {
    pendingCategoria.current = c;
    fileRef.current?.click();
  };

  const handleFile = async (file: File) => {
    setError("");
    setUploading(pendingCategoria.current);
    try {
      const url = await uploadEntregaAnexo(file);
      onChange(addAnexoComVersao(anexos, pendingCategoria.current, file.name, url));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao subir o arquivo. Tente de novo.");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-2.5">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (fileRef.current) fileRef.current.value = "";
          if (file) void handleFile(file);
        }}
      />

      {/* Um único botão compacto abre um menu com as 4 categorias — todas
          continuam descobríveis e a um clique, sem gastar 4 blocos grandes
          de tela quando ainda não há nada anexado. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={uploading !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {uploading ? `Enviando ${uploading}...` : "Adicionar arquivo"}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {ENTREGA_ANEXO_CATEGORIAS.map((c) => {
            const Icon = ENTREGA_ANEXO_ICON[c];
            const count = anexos.filter((a) => a.categoria === c).length;
            return (
              <DropdownMenuItem key={c} onClick={() => pick(c)}>
                <Icon className="h-3.5 w-3.5" />
                {c}
                {count > 0 && (
                  <span className="ml-auto text-[10px] text-muted-foreground">{count}</span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      {anexos.length > 0 ? (
        <div className="space-y-2.5">
          {ENTREGA_ANEXO_CATEGORIAS.filter((c) => anexos.some((a) => a.categoria === c)).map(
            (c) => (
              <div key={c} className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">{c}</p>
                <ul className="space-y-1.5">
                  {anexos
                    .filter((a) => a.categoria === c)
                    .map((a) => {
                      const totalNaCategoria = anexos.filter(
                        (x) => x.categoria === a.categoria,
                      ).length;
                      return (
                        <li
                          key={a.id}
                          className="flex items-center gap-2.5 rounded-md border border-border bg-background p-1.5"
                        >
                          <AnexoThumb nome={a.nome} url={a.url} />
                          <div className="min-w-0 flex-1">
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              download={a.nome}
                              className="block truncate text-xs font-medium text-foreground underline-offset-2 hover:underline"
                            >
                              {a.nome}
                            </a>
                            {totalNaCategoria > 1 && (
                              <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                v{a.versao ?? 1}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onChange(anexos.filter((x) => x.id !== a.id))}
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                            aria-label="Remover anexo"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ),
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/70">Nenhum anexo ainda.</p>
      )}
    </div>
  );
}

/* ============================================================
 * Marketplace interno — adicionar influenciadores direto do Banco de
 * Influenciadores, sem recriar do zero a cada campanha.
 * ============================================================ */

function BankPickerDialog({
  open,
  onOpenChange,
  alreadyAdded,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  alreadyAdded: string[];
  onAdd: (picked: BankInflu[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [nicho, setNicho] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bank = useMemo(() => (open ? loadBank() : []), [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setNicho("");
      setSelected(new Set());
    }
  }, [open]);

  const nichos = useMemo(() => NICHOS.filter((n) => bank.some((b) => b.nicho === n)), [bank]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bank.filter((b) => {
      if (alreadyAdded.includes(b.nome.trim().toLowerCase())) return false;
      if (nicho && b.nicho !== nicho) return false;
      if (!q) return true;
      return (
        b.nome.toLowerCase().includes(q) || b.redes.some((r) => r.handle.toLowerCase().includes(q))
      );
    });
  }, [bank, query, nicho, alreadyAdded]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden border-border bg-background p-0">
        <div className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold">Adicionar do banco</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
            Escolha influenciadores já cadastrados no Banco de Influenciadores.
          </DialogDescription>
        </div>

        <div className="flex items-center gap-2 border-b border-border p-4">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou @"
              className="w-full bg-transparent py-1.5 text-sm outline-none"
            />
          </div>
          <select
            value={nicho}
            onChange={(e) => setNicho(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
          >
            <option value="">Todos os nichos</option>
            {nichos.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <EmptyHint text="Nenhum influenciador disponível para adicionar." />
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((b) => {
                const active = selected.has(b.id);
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => toggle(b.id)}
                      className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                        active ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                        {b.foto ? (
                          <img src={b.foto} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{b.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {b.nicho ? `${b.nicho} · ` : ""}
                          {b.redes.map((r) => r.handle || r.plataforma).join(" · ") || "—"}
                        </p>
                      </div>
                      {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-foreground" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-3">
          <span className="text-xs text-muted-foreground">
            {selected.size} selecionado{selected.size === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={() => onAdd(bank.filter((b) => selected.has(b.id)))}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar selecionados
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * Download influenciadores dialog
 * ============================================================ */

/** Resume as métricas de perfil já preenchidas (por rede) de um influ, uma
 * linha por rede com dado — usado no PDF de exportação. */
function metricsLinesFor(influ: Influ): string[] {
  const lines: string[] = [];
  for (const r of influ.redes) {
    const m = influ.profileMetrics?.porRede?.[r.id];
    if (!m) continue;
    const bits: string[] = [];
    if (m.interacoes) bits.push(`${m.interacoes.toLocaleString("pt-BR")} interações`);
    if (m.visualizacoes) bits.push(`${m.visualizacoes.toLocaleString("pt-BR")} visualizações`);
    if (m.taxaInteracao) bits.push(`${m.taxaInteracao}% taxa de interação`);
    if (m.taxaAtencaoInicial) bits.push(`${m.taxaAtencaoInicial}% atenção inicial`);
    if (bits.length) lines.push(`${r.plataforma}: ${bits.join(", ")}`);
  }
  return lines;
}

/** Gera um PDF da lista de influenciadores (nome, redes, métricas,
 * entregas, status) abrindo uma página HTML pronta pra imprimir — o
 * usuário salva como PDF pelo diálogo de impressão do navegador, mesmo
 * padrão já usado no media kit do Banco de influenciadores. */
function openPdfExport(
  rows: Influ[],
  exportName: string,
  has: (k: InfluencerFieldKey) => boolean,
): void {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const win = window.open("", "_blank");
  if (!win) return;
  const title = exportName || "Influenciadores";
  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)} — Influenciadores</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; padding: 32px; max-width: 860px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #777; font-size: 12px; margin-bottom: 24px; }
  .card { border: 1px solid #e5e5e5; border-radius: 10px; padding: 16px 18px; margin-bottom: 14px; page-break-inside: avoid; }
  .card h2 { font-size: 16px; margin: 0 0 6px; }
  .row { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: #555; margin-bottom: 6px; }
  .row b { color: #111; }
  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #999; margin-top: 8px; }
  ul { margin: 4px 0 0; padding-left: 18px; font-size: 12px; }
  li { margin-bottom: 2px; }
  .badge { display: inline-block; background: #f2f2f2; border-radius: 999px; padding: 2px 8px; font-size: 11px; margin-right: 4px; }
  @media print { body { padding: 0; } .card { break-inside: avoid; } }
</style></head>
<body>
  <h1>${esc(title)}</h1>
  <p class="sub">${rows.length} influenciador${rows.length === 1 ? "" : "es"} · gerado em ${new Date().toLocaleDateString("pt-BR")}</p>
  ${rows
    .map((i) => {
      const metricsLines = has("metricas") ? metricsLinesFor(i) : [];
      return `<div class="card">
        <h2>${esc(i.nome || "Sem nome")}</h2>
        <div class="row">
          ${i.nicho ? `<span class="badge">${esc(i.nicho)}</span>` : ""}
          ${has("status") ? `<span>Status: <b>${esc(i.status)}</b></span>` : ""}
          ${has("pagamentos") ? `<span>Valor total: <b>${fmtBRL(totalAceito(i.pagamento))}</b></span>` : ""}
        </div>
        ${
          has("redes") && i.redes.length > 0
            ? `<div class="section-label">Redes</div><ul>${i.redes
                .map(
                  (r) =>
                    `<li>${esc(r.plataforma)}${r.handle ? ` — ${esc(r.handle)}` : ""}${r.seguidores ? ` (${formatSeguidores(r.seguidores)} seguidores)` : ""}</li>`,
                )
                .join("")}</ul>`
            : ""
        }
        ${
          metricsLines.length > 0
            ? `<div class="section-label">Métricas</div><ul>${metricsLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
            : ""
        }
        ${
          has("entregas") && i.entregas.length > 0
            ? `<div class="section-label">Entregas</div><ul>${i.entregas
                .map((e) => `<li>${e.quantidade}× ${esc(e.tipo)} — ${esc(e.status)}</li>`)
                .join("")}</ul>`
            : ""
        }
      </div>`;
    })
    .join("")}
</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function DownloadInflusDialog({
  open,
  onOpenChange,
  influs,
  exportName,
  has,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  influs: Influ[];
  exportName: string;
  has: (k: InfluencerFieldKey) => boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<"csv" | "json" | "pdf">("csv");

  useEffect(() => {
    if (open) setSelected(new Set(influs.map((i) => i.id)));
  }, [open, influs]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const allChecked = selected.size === influs.length && influs.length > 0;
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(influs.map((i) => i.id)));

  const download = () => {
    const rows = influs.filter((i) => selected.has(i.id));
    if (rows.length === 0) return;
    const safeName = (exportName || "influenciadores").replace(/[^a-z0-9-_]+/gi, "_");
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "pdf") {
      openPdfExport(rows, exportName, has);
      onOpenChange(false);
      return;
    }

    if (format === "json") {
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      triggerDownload(blob, `influenciadores_${safeName}_${stamp}.json`);
    } else {
      const headers = ["Nome"];
      if (has("redes")) headers.push("Redes");
      if (has("entregas")) headers.push("Entregas");
      if (has("pagamentos")) headers.push("Valor total (R$)");
      if (has("contrato")) headers.push("Contrato");
      if (has("status")) headers.push("Status");
      const csvRows = rows.map((i) => {
        const row = [i.nome];
        if (has("redes")) row.push(i.redes.map((r) => `${r.plataforma}:${r.handle}`).join(" | "));
        if (has("entregas"))
          row.push(i.entregas.map((e) => `${e.quantidade}x ${e.tipo} (${e.status})`).join(" | "));
        if (has("pagamentos")) row.push(totalAceito(i.pagamento).toString());
        if (has("contrato")) row.push(i.contrato ?? "");
        if (has("status")) row.push(i.status);
        return row;
      });
      const csv = [headers, ...csvRows]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      triggerDownload(blob, `influenciadores_${safeName}_${stamp}.csv`);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Baixar lista de influenciadores</DialogTitle>
        <DialogDescription>Selecione quais influenciadores deseja exportar.</DialogDescription>

        <div className="mt-2 flex items-center justify-between text-xs">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={allChecked} onChange={toggleAll} />
            <span className="font-medium">Selecionar todos</span>
          </label>
          <span className="text-muted-foreground">
            {selected.size} de {influs.length} selecionados
          </span>
        </div>

        <div className="max-h-[320px] overflow-y-auto rounded-md border border-border">
          {influs.map((i) => (
            <label
              key={i.id}
              className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50"
            >
              <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{i.nome || "—"}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {has("redes") ? i.redes.map((r) => `@${r.handle}`).join(", ") || "sem redes" : ""}
                  {has("redes") && has("status") ? " · " : ""}
                  {has("status") ? i.status : ""}
                </p>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Formato:</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as "csv" | "json" | "pdf")}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            >
              <option value="csv">CSV (Excel)</option>
              <option value="json">JSON</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={download}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> Baixar ({selected.size})
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
