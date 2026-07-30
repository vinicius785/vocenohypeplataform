import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  Coins,
  Columns3,
  Download,
  ExternalLink,
  Facebook,
  FileText,
  Instagram,
  Landmark,
  Linkedin,
  LayoutList,
  Mail,
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
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { loadBank, saveBank, type BankInflu } from "@/lib/banco-influs-store";
import type { PagGrupo } from "@/components/VincularCampanhaDialog";

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

export type Rede = { id: string; plataforma: string; handle: string };
export type PostMetrics = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
};
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
 * Um pagamento de entrega pode combinar mais de um tipo (ex: "Valor" +
 * "Por Hora", vindos de um grupo de pagamento da campanha) — por isso
 * `tipos` é uma lista, com a config de cada tipo guardada separadamente.
 */
export type PagamentoEntrega = {
  grupoId?: string;
  grupoNome?: string;
  tipos: PagTipoEntrega[];
  config: Record<string, PagamentoConfigEntrega>;
  aprovacao: AprovacaoPagamento;
  data?: string;
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
/** Soma em dinheiro dos pagamentos já aceitos entre as entregas do influenciador. */
export function totalAceito(entregas: Entrega[]): number {
  return entregas
    .filter((e) => e.pagamento?.aprovacao === "aceito")
    .reduce((s, e) => s + pagamentoCashValue(e.pagamento), 0);
}

export type ReliabilityStats = {
  score: number; // 0-100
  total: number;
  onTime: number;
  late: number;
  overdue: number;
};

/**
 * Score de confiabilidade — baseado no histórico real de entregas
 * (across todas as campanhas): quanto o influenciador cumpriu o prazo
 * combinado. Considera só entregas além de "orçado" (ou seja, já
 * combinadas); publicadas no prazo pontuam bem, publicadas depois da
 * data combinada ou ainda pendentes com prazo vencido pesam contra.
 */
export function computeReliability(entregas: Entrega[]): ReliabilityStats {
  const relevant = entregas.filter((e) => e.status !== "orcado");
  const today = todayISO();
  let onTime = 0;
  let late = 0;
  let overdue = 0;
  for (const e of relevant) {
    if (e.status === "publicado") {
      if (e.dataPostagem && e.publicadoEm && e.publicadoEm > e.dataPostagem) late += 1;
      else onTime += 1;
    } else if (e.status === "combinado" && e.dataPostagem && e.dataPostagem < today) {
      overdue += 1;
    }
  }
  const total = relevant.length;
  if (total === 0) return { score: 100, total: 0, onTime: 0, late: 0, overdue: 0 };
  const penalty = ((late + overdue * 1.5) / total) * 100;
  return { score: Math.max(0, Math.round(100 - penalty)), total, onTime, late, overdue };
}

/** Prazo (dias) que consideramos razoável para um cliente responder uma solicitação de aprovação. */
export const APPROVAL_SLA_DAYS = 3;

/** Se o influenciador está "Enviado para aprovação" há mais dias que o SLA, retorna há quantos dias. */
export function approvalSlaOverdueDays(influ: Influ): number | null {
  if (influ.status !== "Enviado para aprovação" || !influ.statusUpdatedAt) return null;
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
export const ENTREGA_CONTEUDO_STATUSES = [
  "Combinado",
  "Aguardando roteiro",
  "Roteiro aprovado",
  "Em gravação",
  "Aprovação gravação",
  "Gravação aprovada",
  "Postado",
] as const;
export type EntregaConteudoStatus = (typeof ENTREGA_CONTEUDO_STATUSES)[number];
export const ENTREGA_CONTEUDO_TONE: Record<EntregaConteudoStatus, string> = {
  Combinado: "bg-muted text-muted-foreground",
  "Aguardando roteiro": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "Roteiro aprovado": "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  "Em gravação": "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  "Aprovação gravação": "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  "Gravação aprovada": "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  Postado: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

export const ENTREGA_ANEXO_CATEGORIAS = [
  "Roteiro",
  "Gravação",
  "Conteúdo publicado",
  "Outro",
] as const;
export type EntregaAnexoCategoria = (typeof ENTREGA_ANEXO_CATEGORIAS)[number];
export type EntregaAnexo = {
  id: string;
  categoria: EntregaAnexoCategoria;
  nome: string;
  url: string;
};

export type Entrega = {
  id: string;
  tipo: string;
  titulo?: string;
  quantidade: number;
  status: "orcado" | "combinado" | "publicado";
  /** Etapa de produção do conteúdo — independente do status de orçamento/publicação acima. */
  conteudoStatus?: EntregaConteudoStatus;
  dataPostagem?: string; // data planejada (ou realizada) para a postagem
  dataRecebimentoRoteiro?: string; // quando o roteiro foi recebido do influenciador
  dataRecebimentoConteudo?: string; // quando a gravação/conteúdo foi recebido do influenciador
  /** Anexos da entrega (roteiro, gravação, conteúdo publicado, etc) — podem
   * ser adicionados em qualquer etapa/status, e mais de um por categoria. */
  anexos?: EntregaAnexo[];
  /** @deprecated migrado para `anexos` (categoria "Roteiro") por `normalizeInflus`. */
  roteiro?: string;
  /** @deprecated migrado para `anexos` (categoria "Roteiro") por `normalizeInflus`. */
  roteiroNome?: string;
  /** Link do post publicado (texto, não anexo). */
  url?: string;
  /** @deprecated quando presente, `url` era o anexo em si — migrado pra `anexos` (categoria "Conteúdo publicado"). */
  arquivoNome?: string;
  publicadoEm?: string;
  metrics?: PostMetrics;
  pagamento?: PagamentoEntrega;
};

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

export const INFLU_STATUSES = [
  "Lista",
  "Enviado para aprovação",
  "Aprovado",
  "Aguardando roteiro",
  "Aprovação de roteiro",
  "Em gravação",
  "Aprovação de conteúdo",
  "Conteúdo aprovado",
  "Postado",
  "Pago",
] as const;
export type InfluStatus = (typeof INFLU_STATUSES)[number];

/**
 * O status do influenciador (fluxo geral) e o status de cada entrega
 * (orçado/combinado/publicado) são dois controles separados que
 * costumavam ficar dessincronizados. Para unificar sem perder a
 * granularidade por entrega: (1) publicar uma entrega só é permitido a
 * partir de "Aprovado" em diante — evita marcar conteúdo no ar antes da
 * aprovação; (2) quando todas as entregas ficam "publicado", o status
 * geral avança automaticamente para "Postado" (ver `advanceStatusFromEntregas`).
 */
export function canPublishEntrega(status: InfluStatus): boolean {
  return INFLU_STATUSES.indexOf(status) >= INFLU_STATUSES.indexOf("Aprovado");
}
export function advanceStatusFromEntregas(status: InfluStatus, entregas: Entrega[]): InfluStatus {
  const allPublished = entregas.length > 0 && entregas.every((e) => e.status === "publicado");
  if (allPublished && INFLU_STATUSES.indexOf(status) < INFLU_STATUSES.indexOf("Postado")) {
    return "Postado";
  }
  return status;
}

export const INFLU_STATUS_TONE: Record<InfluStatus, string> = {
  Lista: "bg-muted text-muted-foreground",
  "Enviado para aprovação": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  Aprovado: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  "Aguardando roteiro": "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  "Aprovação de roteiro": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "Em gravação": "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  "Aprovação de conteúdo": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "Conteúdo aprovado": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Postado: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  Pago: "bg-foreground text-background",
};

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

export type Influ = {
  id: string;
  foto?: string;
  nome: string;
  nicho?: string;
  telefone?: string;
  email?: string;
  redes: Rede[];
  entregas: Entrega[];
  contrato?: string;
  status: InfluStatus;
  statusUpdatedAt?: string; // data em que o status atual foi definido (p/ SLA de aprovação)
  bank?: BankInfo;
  comments?: InfluComment[];
  activity?: InfluActivity[];
  createdAt?: string;
  updatedAt?: string;
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
    const entregas: Entrega[] = (r.entregas ?? []).map((e) => {
      const anexos = [...(e.anexos ?? [])];
      if (e.roteiro) {
        anexos.push({
          id: `${e.id}-mig-roteiro`,
          categoria: "Roteiro",
          nome: e.roteiroNome || "Roteiro",
          url: e.roteiro,
        });
      }
      if (e.url && e.arquivoNome) {
        anexos.push({
          id: `${e.id}-mig-publicado`,
          categoria: "Conteúdo publicado",
          nome: e.arquivoNome,
          url: e.url,
        });
      }
      return {
        ...e,
        status: e.status ?? "combinado",
        anexos,
        // Quando `url` era o próprio anexo (arquivoNome setado), o link vira
        // o anexo acima — não faz mais sentido manter os dois.
        url: e.arquivoNome ? undefined : e.url,
        roteiro: undefined,
        roteiroNome: undefined,
        arquivoNome: undefined,
      };
    });
    for (const c of r.conteudos ?? []) {
      entregas.push({
        id: (c.id as string) ?? crypto.randomUUID(),
        tipo: c.tipo === "anexo" ? "Anexo" : "Link",
        titulo: c.titulo as string | undefined,
        quantidade: 1,
        status: "publicado",
        url: c.url as string | undefined,
        arquivoNome: c.arquivoNome as string | undefined,
        publicadoEm: c.criadoEm as string | undefined,
        metrics: c.metrics as PostMetrics | undefined,
      });
    }
    for (const v of r.valores ?? []) {
      entregas.push({
        id: v.id ?? crypto.randomUUID(),
        tipo: "Pagamento avulso",
        quantidade: 1,
        status: "publicado",
        pagamento: {
          tipos: ["Valor"],
          config: { Valor: { valor: v.valor as string | undefined } },
          aprovacao: "aceito",
          data: v.quando as string | undefined,
        },
      });
    }
    const { conteudos: _drop, valores: _drop2, ...rest } = r;
    return { ...rest, entregas };
  });
}

const REDES_OPTS = ["Instagram", "TikTok", "YouTube", "X", "LinkedIn", "Facebook"];
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
  | "status";

export const INFLUENCER_FIELDS: { key: InfluencerFieldKey; label: string; hint: string }[] = [
  {
    key: "redes",
    label: "Redes sociais",
    hint: "Instagram, TikTok, YouTube e outras, com handle.",
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
function syncToBanco(i: { nome: string; foto?: string; nicho?: string; redes: Rede[] }) {
  const nome = i.nome.trim();
  if (!nome) return;
  try {
    const list = loadBank();
    const key = nome.toLowerCase();
    const idx = list.findIndex((x) => x.nome.trim().toLowerCase() === key);
    const next =
      idx >= 0
        ? list.map((x, j) =>
            j === idx
              ? {
                  ...x,
                  nome,
                  foto: i.foto ?? x.foto,
                  nicho: i.nicho ?? x.nicho,
                  redes: i.redes?.length ? i.redes : x.redes,
                }
              : x,
          )
        : [
            ...list,
            {
              id: crypto.randomUUID(),
              nome,
              foto: i.foto,
              nicho: i.nicho,
              redes: i.redes ?? [],
            },
          ];
    saveBank(next);
  } catch {
    /* ignore */
  }
}

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

export type ApprovalBadge = { status: "aprovado" | "reprovado"; motivo?: string };

export function InfluencerBoard({
  influs,
  onChange,
  exportName,
  allowedFields,
  headerExtra,
  approvalStatusFor,
  pagGrupos,
}: {
  influs: Influ[];
  onChange: (next: Influ[]) => void;
  exportName: string;
  allowedFields?: InfluencerFieldKey[];
  /** Extra action rendered in the header row, next to "Baixar lista" (e.g. campaign approval-link button). */
  headerExtra?: ReactNode;
  /** Looks up the latest public-approval response for an influencer, shown as a badge on their card. */
  approvalStatusFor?: (influId: string) => ApprovalBadge | undefined;
  /** Grupos de pagamento configurados na campanha (ver VincularCampanhaDialog) — quando presentes, o editor de pagamento por entrega deixa escolher um grupo pronto em vez de preencher tudo do zero. */
  pagGrupos?: PagGrupo[];
}) {
  const fields = allowedFields ?? ALL_INFLUENCER_FIELDS;
  const has = (k: InfluencerFieldKey) => fields.includes(k);

  const [influDialog, setInfluDialog] = useState<{ mode: "new" | "edit"; data?: Influ } | null>(
    null,
  );
  const [viewing, setViewing] = useState<Influ | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"lista" | "kanban">("lista");
  const [sortBy, setSortBy] = useState<"az" | "za" | "updated" | "created">("az");
  const [dragId, setDragId] = useState<string | null>(null);
  const exportMenu = useDropdown();
  const novoMenu = useDropdown();
  const viewMenu = useDropdown();
  const carRef = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) =>
    carRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  const pushActivity = (i: Influ, action: string): Influ => {
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
          createdAt: new Date().toISOString(),
        },
      ],
    };
  };

  const changeStatus = (influId: string, status: InfluStatus) =>
    onChange(
      influs.map((x) =>
        x.id === influId
          ? pushActivity(
              { ...x, status, statusUpdatedAt: todayISO() },
              `mudou status para ${status}`,
            )
          : x,
      ),
    );

  const addComment = (influId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const me = getCurrentAuthor();
    const next = influs.map((x) =>
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
    onChange(next);
    setViewing((v) => next.find((x) => x.id === v?.id) ?? null);
  };

  const save = (i: Influ) => {
    const now = new Date().toISOString();
    if (influDialog?.mode === "edit") {
      const existing = influs.find((x) => x.id === i.id);
      const withStamps = { ...i, createdAt: existing?.createdAt ?? now, updatedAt: now };
      onChange(influs.map((x) => (x.id === i.id ? withStamps : x)));
      syncToBanco(withStamps);
    } else {
      const withStamps = { ...i, createdAt: now, updatedAt: now };
      onChange([...influs, withStamps]);
      syncToBanco(withStamps);
    }
  };

  const setAprovacao = (influId: string, entregaId: string, aprovacao: AprovacaoPagamento) => {
    const next = influs.map((x) => {
      if (x.id !== influId) return x;
      return {
        ...x,
        updatedAt: new Date().toISOString(),
        entregas: x.entregas.map((e) =>
          e.id === entregaId && e.pagamento
            ? {
                ...e,
                pagamento: {
                  ...e.pagamento,
                  aprovacao,
                  data:
                    e.pagamento.data || (aprovacao === "aceito" ? todayISO() : e.pagamento.data),
                },
              }
            : e,
        ),
      };
    });
    onChange(next);
    setViewing((v) => next.find((x) => x.id === v?.id) ?? null);
  };

  // O status geral da entrega (orçado/combinado/publicado) não tem mais um
  // controle manual próprio — ele é derivado do status individual (etapa de
  // produção). "Postado" vira "publicado" (libera link/métricas e entra no
  // Financeiro); qualquer outra etapa volta a ser "combinado". A trava de só
  // publicar a partir de "Aprovado" (ver `canPublishEntrega`) continua valendo.
  const setConteudoStatus = (
    influId: string,
    entregaId: string,
    conteudoStatus: EntregaConteudoStatus,
  ) => {
    const next = influs.map((x) => {
      if (x.id !== influId) return x;
      const entrega = x.entregas.find((e) => e.id === entregaId);
      if (!entrega || entrega.conteudoStatus === conteudoStatus) return x;
      if (conteudoStatus === "Postado" && !canPublishEntrega(x.status)) return x;
      const label = entrega.titulo ? `${entrega.tipo} · ${entrega.titulo}` : entrega.tipo;
      return pushActivity(
        {
          ...x,
          entregas: x.entregas.map((e) =>
            e.id === entregaId
              ? {
                  ...e,
                  conteudoStatus,
                  status: conteudoStatus === "Postado" ? "publicado" : "combinado",
                  publicadoEm:
                    conteudoStatus === "Postado" ? (e.publicadoEm ?? todayISO()) : e.publicadoEm,
                }
              : e,
          ),
        },
        `mudou status de "${label}" para ${conteudoStatus}`,
      );
    });
    onChange(next);
    setViewing((v) => next.find((x) => x.id === v?.id) ?? null);
  };

  // Deixa anexar (ou remover) arquivo de uma entrega direto no resumo, sem
  // precisar abrir o formulário de edição inteiro.
  const setEntregaAnexos = (influId: string, entregaId: string, anexos: EntregaAnexo[]) => {
    const next = influs.map((x) =>
      x.id !== influId
        ? x
        : { ...x, entregas: x.entregas.map((e) => (e.id === entregaId ? { ...e, anexos } : e)) },
    );
    onChange(next);
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
                <div onClick={() => exportMenu.setOpen(false)}>{headerExtra}</div>
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
                    setInfluDialog({ mode: "new" });
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
          onClick={() => setInfluDialog({ mode: "new" })}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-12 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/30"
        >
          <Plus className="h-5 w-5" />
          Adicionar o primeiro influenciador
        </button>
      ) : viewMode === "kanban" ? (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
          {INFLU_STATUSES.map((col) => {
            const items = sortedInflus.filter((i) => i.status === col);
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
                    {col}
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
                        onEdit={() => setInfluDialog({ mode: "edit", data: i })}
                        onStatus={(status) => changeStatus(i.id, status)}
                        onRemove={() => onChange(influs.filter((x) => x.id !== i.id))}
                        approval={approvalStatusFor?.(i.id)}
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
            {sortedInflus.map((i) => (
              <InfluCard
                key={i.id}
                influ={i}
                has={has}
                onView={() => setViewing(i)}
                onEdit={() => setInfluDialog({ mode: "edit", data: i })}
                onStatus={(status) => changeStatus(i.id, status)}
                onRemove={() => onChange(influs.filter((x) => x.id !== i.id))}
                approval={approvalStatusFor?.(i.id)}
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

      {viewing && (
        <InfluencerProfileDialog
          influ={viewing}
          has={has}
          onOpenChange={(o) => !o && setViewing(null)}
          onEdit={() => {
            setInfluDialog({ mode: "edit", data: viewing });
            setViewing(null);
          }}
          onRemove={() => {
            onChange(influs.filter((x) => x.id !== viewing.id));
            setViewing(null);
          }}
          onSetAprovacao={(entregaId, aprovacao) => setAprovacao(viewing.id, entregaId, aprovacao)}
          onSetConteudoStatus={(entregaId, status) =>
            setConteudoStatus(viewing.id, entregaId, status)
          }
          onSetAnexos={(entregaId, anexos) => setEntregaAnexos(viewing.id, entregaId, anexos)}
          onComment={(text) => addComment(viewing.id, text)}
        />
      )}

      <InfluenciadorDialog
        open={!!influDialog}
        onOpenChange={(o) => !o && setInfluDialog(null)}
        initial={influDialog?.data}
        has={has}
        pagGrupos={pagGrupos}
        onSave={(i) => {
          save(i);
          setInfluDialog(null);
        }}
      />

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
          onChange([
            ...influs,
            ...picked.map(
              (b): Influ => ({
                id: crypto.randomUUID(),
                foto: b.foto,
                nome: b.nome,
                nicho: b.nicho,
                redes: b.redes,
                entregas: [],
                status: "Lista",
              }),
            ),
          ]);
          setBankPickerOpen(false);
        }}
      />
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
  onEdit,
  onStatus,
  onRemove,
  approval,
}: {
  influ: Influ;
  has: (k: InfluencerFieldKey) => boolean;
  onView: () => void;
  onEdit: () => void;
  onStatus: (s: InfluStatus) => void;
  onRemove: () => void;
  approval?: ApprovalBadge;
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const totalPago = totalAceito(influ.entregas);
  const nPublicadas = influ.entregas.filter((e) => e.status === "publicado").length;
  const entregasStr =
    influ.entregas.length === 0
      ? "—"
      : `${influ.entregas.length} · ${nPublicadas} publicada${nPublicadas === 1 ? "" : "s"}`;

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
                  {s}
                </option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 opacity-70" />
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

      {(has("entregas") || has("pagamentos") || (has("contrato") && influ.contrato)) && (
        <dl className="space-y-1 border-t border-border/60 bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
          {has("entregas") && <MetaRow label="Entregas" value={entregasStr} />}
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

      <div className="flex items-center justify-between border-t border-border/60 px-4 py-2">
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onEdit();
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:opacity-80"
        >
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
        <div className="flex items-center gap-1">
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

function MetricStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

/* ============================================================
 * Profile — read-only view opened by clicking a card. Everything
 * collected for this influencer, organized by section with icons;
 * "Editar" jumps into the same wizard used to create/edit.
 * ============================================================ */

/** Botões lado a lado (Métricas, Pagamentos, Dados bancários, Contrato) —
 * nenhum aberto por padrão; clicar num abre o painel dele logo abaixo (e
 * fecha automaticamente se outro for aberto). */
function HiddenSectionsPanel({
  sections,
}: {
  sections: { key: string; icon: React.ReactNode; title: string; content: React.ReactNode }[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const activeSection = sections.find((s) => s.key === active);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setActive((a) => (a === s.key ? null : s.key))}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              active === s.key
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {s.icon}
            {s.title}
          </button>
        ))}
      </div>
      {activeSection && (
        <div className="rounded-lg border border-border bg-background p-3">
          {activeSection.content}
        </div>
      )}
    </div>
  );
}

/** Pill do status individual de uma entrega — dropdown customizado (não um
 * `<select>` nativo, que renderia como uma caixa cinza do navegador). */
function EntregaStatusPill({
  value,
  influStatus,
  onChange,
}: {
  value: EntregaConteudoStatus;
  influStatus: InfluStatus;
  onChange: (s: EntregaConteudoStatus) => void;
}) {
  const menu = useDropdown();
  return (
    <div ref={menu.ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => menu.setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${ENTREGA_CONTEUDO_TONE[value]}`}
      >
        {value}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {menu.open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-md border border-border bg-popover p-1 shadow-md">
          {ENTREGA_CONTEUDO_STATUSES.map((s) => {
            const disabled = s === "Postado" && !canPublishEntrega(influStatus);
            return (
              <button
                key={s}
                type="button"
                disabled={disabled}
                title={disabled ? "Disponível a partir de 'Aprovado'" : undefined}
                onClick={() => {
                  onChange(s);
                  menu.setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${ENTREGA_CONTEUDO_TONE[s]}`} />
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Botão compacto de "Adicionar anexo" pro card de entrega no resumo — abre
 * o mesmo menu de categoria do editor, mas sem precisar sair do resumo pra
 * anexar roteiro/gravação/conteúdo publicado. */
function EntregaAnexoQuickAdd({ onAdd }: { onAdd: (anexo: EntregaAnexo) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingCategoria = useRef<EntregaAnexoCategoria>("Roteiro");
  const menu = useDropdown();

  return (
    <div ref={menu.ref} className="relative shrink-0">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const r = new FileReader();
          r.onload = () =>
            onAdd({
              id: crypto.randomUUID(),
              categoria: pendingCategoria.current,
              nome: file.name,
              url: String(r.result),
            });
          r.readAsDataURL(file);
          if (fileRef.current) fileRef.current.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => menu.setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
      >
        <Paperclip className="h-3 w-3" /> Anexar
      </button>
      {menu.open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-md border border-border bg-popover p-1 shadow-md">
          {ENTREGA_ANEXO_CATEGORIAS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                pendingCategoria.current = c;
                menu.setOpen(false);
                fileRef.current?.click();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${ENTREGA_ANEXO_TONE[c]}`} />
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InfluencerProfileDialog({
  influ,
  has,
  onOpenChange,
  onEdit,
  onRemove,
  onSetAprovacao,
  onSetConteudoStatus,
  onSetAnexos,
  onComment,
}: {
  influ: Influ;
  has: (k: InfluencerFieldKey) => boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
  onSetAprovacao: (entregaId: string, aprovacao: AprovacaoPagamento) => void;
  onSetConteudoStatus: (entregaId: string, status: EntregaConteudoStatus) => void;
  onSetAnexos: (entregaId: string, anexos: EntregaAnexo[]) => void;
  onComment: (text: string) => void;
}) {
  const [commentText, setCommentText] = useState("");
  const bank = influ.bank ?? {};
  const hasBank = Object.values(bank).some((v) => v && String(v).trim());

  const metricsTotal = influ.entregas.reduce(
    (acc, e) => {
      acc.views += e.metrics?.views ?? 0;
      acc.likes += e.metrics?.likes ?? 0;
      acc.comments += e.metrics?.comments ?? 0;
      acc.shares += e.metrics?.shares ?? 0;
      acc.saves += e.metrics?.saves ?? 0;
      acc.reach += e.metrics?.reach ?? 0;
      return acc;
    },
    { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0 },
  );
  const hasMetrics = Object.values(metricsTotal).some((v) => v > 0);
  const reliability = computeReliability(influ.entregas);

  const hasExtras = has("pagamentos") || has("bancario") || has("contrato");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Perfil do influenciador</DialogTitle>
        <DialogDescription className="sr-only">
          Informações completas do influenciador.
        </DialogDescription>

        {/* CABEÇALHO — foto, nome, redes e contato em destaque */}
        <DialogHeader className="space-y-3 border-b border-border bg-muted/40 px-6 py-6">
          <div className="flex items-start gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted shadow-sm ring-2 ring-background">
              {influ.foto ? (
                <img src={influ.foto} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-lg font-semibold text-foreground">
                  {influ.nome || "Sem nome"}
                </p>
                {influ.nicho && (
                  <span className="inline-block rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
                    {influ.nicho}
                  </span>
                )}
                {has("status") && (
                  <span
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold shadow-sm ${INFLU_STATUS_TONE[influ.status]}`}
                  >
                    {influ.status}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {has("redes") &&
                  influ.redes.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm"
                    >
                      <PlatformIcon plataforma={r.plataforma} className="h-3.5 w-3.5" />
                      {r.handle ? `@${r.handle}` : r.plataforma}
                    </span>
                  ))}
                {influ.telefone && (
                  <a
                    href={`tel:${influ.telefone.replace(/\D/g, "")}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-background/70"
                  >
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatPhoneBR(influ.telefone)}
                  </a>
                )}
                {influ.email && (
                  <a
                    href={`mailto:${influ.email}`}
                    className="inline-flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-background/70"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{influ.email}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_320px]">
          <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-6">
            {/* ENTREGAS — conteúdo principal, sempre visível */}
            {has("entregas") &&
              (influ.entregas.length > 0 ? (
                <div className="-mx-1 overflow-x-auto px-1 pb-2">
                  <div className="flex min-w-max gap-5 border-t-2 border-border pt-7">
                    {influ.entregas.map((e) => {
                      const anexosVisiveis = (e.anexos ?? []).slice(0, 2);
                      const anexosOcultos = (e.anexos?.length ?? 0) - anexosVisiveis.length;
                      return (
                        <div key={e.id} className="relative w-64 shrink-0">
                          <span className="absolute -top-[31px] left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-background bg-foreground" />
                          <div className="flex h-28 flex-col overflow-hidden rounded-lg border border-border bg-background p-2.5 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 truncate text-sm font-medium text-foreground">
                                {e.titulo ? `${e.tipo} · ${e.titulo}` : e.tipo}
                              </p>
                              <EntregaStatusPill
                                value={e.conteudoStatus ?? "Combinado"}
                                influStatus={influ.status}
                                onChange={(s) => onSetConteudoStatus(e.id, s)}
                              />
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {e.quantidade}×
                              {e.dataPostagem &&
                                ` · ${new Date(e.dataPostagem + "T00:00:00").toLocaleDateString("pt-BR")}`}
                            </p>
                            <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border pt-1.5">
                              {e.url && (
                                <a
                                  href={e.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-foreground underline underline-offset-2"
                                >
                                  <ExternalLink className="h-3 w-3" /> Ver publicação
                                </a>
                              )}
                              {anexosVisiveis.map((a) => (
                                <a
                                  key={a.id}
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  download={a.nome}
                                  title={a.nome}
                                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium underline underline-offset-2 ${ENTREGA_ANEXO_TONE[a.categoria]}`}
                                >
                                  <Paperclip className="h-3 w-3" />
                                  {a.categoria}
                                </a>
                              ))}
                              {anexosOcultos > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{anexosOcultos}
                                </span>
                              )}
                              <EntregaAnexoQuickAdd
                                onAdd={(a) => onSetAnexos(e.id, [...(e.anexos ?? []), a])}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma entrega combinada ainda.</p>
              ))}

            {/* SEÇÕES SECUNDÁRIAS — botões lado a lado, conteúdo oculto até clicar */}
            <HiddenSectionsPanel
              sections={[
                ...(has("entregas") && (hasMetrics || reliability.total > 0)
                  ? [
                      {
                        key: "metricas",
                        icon: <BarChart3 className="h-3.5 w-3.5" />,
                        title: "Métricas",
                        content: (
                          <div className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-4">
                            <MetricStat label="Confiabilidade" value={`${reliability.score}%`} />
                            {metricsTotal.views > 0 && (
                              <MetricStat
                                label="Visualizações"
                                value={metricsTotal.views.toLocaleString("pt-BR")}
                              />
                            )}
                            {metricsTotal.reach > 0 && (
                              <MetricStat
                                label="Alcance"
                                value={metricsTotal.reach.toLocaleString("pt-BR")}
                              />
                            )}
                            {metricsTotal.likes > 0 && (
                              <MetricStat
                                label="Curtidas"
                                value={metricsTotal.likes.toLocaleString("pt-BR")}
                              />
                            )}
                            {metricsTotal.comments > 0 && (
                              <MetricStat
                                label="Comentários"
                                value={metricsTotal.comments.toLocaleString("pt-BR")}
                              />
                            )}
                            {metricsTotal.shares > 0 && (
                              <MetricStat
                                label="Compart."
                                value={metricsTotal.shares.toLocaleString("pt-BR")}
                              />
                            )}
                            {metricsTotal.saves > 0 && (
                              <MetricStat
                                label="Salvos"
                                value={metricsTotal.saves.toLocaleString("pt-BR")}
                              />
                            )}
                          </div>
                        ),
                      },
                    ]
                  : []),
                ...(has("pagamentos")
                  ? [
                      {
                        key: "pagamentos",
                        icon: <Coins className="h-3.5 w-3.5" />,
                        title: "Pagamentos",
                        content: (
                          <PagamentosList
                            entregas={influ.entregas}
                            onSetAprovacao={onSetAprovacao}
                          />
                        ),
                      },
                    ]
                  : []),
                ...(has("bancario") && hasBank
                  ? [
                      {
                        key: "bancario",
                        icon: <Landmark className="h-3.5 w-3.5" />,
                        title: "Dados bancários",
                        content: (
                          <dl className="space-y-1 text-xs">
                            {bank.titular && <MetaRow label="Titular" value={bank.titular} />}
                            {bank.cpfCnpj && <MetaRow label="CPF/CNPJ" value={bank.cpfCnpj} />}
                            {bank.banco && <MetaRow label="Banco" value={bank.banco} />}
                            {(bank.agencia || bank.conta) && (
                              <MetaRow
                                label="Ag./Conta"
                                value={[bank.agencia, bank.conta].filter(Boolean).join(" / ")}
                              />
                            )}
                            {bank.pixChave && (
                              <MetaRow
                                label={`Pix${bank.pixTipo ? ` (${bank.pixTipo})` : ""}`}
                                value={bank.pixChave}
                              />
                            )}
                          </dl>
                        ),
                      },
                    ]
                  : []),
                ...(has("contrato") && influ.contrato
                  ? [
                      {
                        key: "contrato",
                        icon: <FileText className="h-3.5 w-3.5" />,
                        title: "Contrato",
                        content: (
                          <a
                            href={influ.contrato}
                            download
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            <Download className="h-3.5 w-3.5" /> Baixar contrato assinado
                          </a>
                        ),
                      },
                    ]
                  : []),
              ]}
            />

            {!has("entregas") && !hasExtras && (
              <p className="text-xs text-muted-foreground">
                Nenhuma informação adicional configurada para este influenciador.
              </p>
            )}
          </div>

          <div className="flex min-h-0 flex-col border-l border-border bg-muted/20">
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
                      <div key={e.item.id} className="flex items-start gap-2">
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-semibold ${e.item.color}`}
                        >
                          {e.item.initials}
                        </span>
                        {e.kind === "activity" ? (
                          <div className="flex-1 text-xs leading-relaxed">
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
                          <div className="flex-1 rounded-md border border-border bg-background px-2.5 py-2">
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
                            <div className="whitespace-pre-wrap text-xs leading-relaxed">
                              {e.item.text}
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
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * Create / edit dialog — steps adapt to `allowedFields`.
 * ============================================================ */

type StepKey = "perfil" | "redes" | "entregas" | "pagamentos" | "bancario" | "contrato" | "status";

function InfluenciadorDialog({
  open,
  onOpenChange,
  initial,
  has,
  onSave,
  pagGrupos,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: Influ;
  has: (k: InfluencerFieldKey) => boolean;
  onSave: (i: Influ) => void;
  pagGrupos?: PagGrupo[];
}) {
  const [foto, setFoto] = useState<string | undefined>();
  const [nome, setNome] = useState("");
  const [nicho, setNicho] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [redes, setRedes] = useState<Rede[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  // Cada entrega vira um card recolhido por padrão (só cabeçalho: formato +
  // quantidade + resumo) — expandir só quando for mexer em data/anexos/
  // pagamento/publicação, senão 3+ entregas deixavam a etapa gigantesca e
  // poluída de olhar.
  const [expandedEntregas, setExpandedEntregas] = useState<Set<string>>(new Set());
  const toggleEntregaExpanded = (id: string) =>
    setExpandedEntregas((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [contrato, setContrato] = useState<string | undefined>();
  const [contratoNome, setContratoNome] = useState<string>("");
  const [status, setStatus] = useState<InfluStatus>("Lista");
  const [bank, setBank] = useState<BankInfo>({});
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const contratoRef = useRef<HTMLInputElement>(null);

  const steps = useMemo(() => {
    const s: { key: StepKey; label: string; icon: typeof User }[] = [
      { key: "perfil", label: "Perfil", icon: User },
    ];
    if (has("redes")) s.push({ key: "redes", label: "Redes", icon: Share2 });
    if (has("entregas")) s.push({ key: "entregas", label: "Entregas", icon: Package });
    if (has("pagamentos")) s.push({ key: "pagamentos", label: "Pagamentos", icon: Coins });
    if (has("bancario")) s.push({ key: "bancario", label: "Bancário", icon: Landmark });
    if (has("contrato")) s.push({ key: "contrato", label: "Contrato", icon: FileText });
    if (has("status")) s.push({ key: "status", label: "Status", icon: CheckCircle2 });
    return s;
  }, [has]);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSaving(false);
    setExpandedEntregas(new Set());
    if (initial) {
      setFoto(initial.foto);
      setNome(initial.nome);
      setNicho(initial.nicho ?? "");
      setTelefone(initial.telefone ?? "");
      setEmail(initial.email ?? "");
      setRedes(initial.redes);
      setEntregas(initial.entregas);
      setContrato(initial.contrato);
      setContratoNome(initial.contrato ? "Contrato anexado" : "");
      setStatus(initial.status);
      setBank(initial.bank ?? {});
    } else {
      setFoto(undefined);
      setNome("");
      setNicho("");
      setTelefone("");
      setEmail("");
      setRedes([]);
      setEntregas([]);
      setContrato(undefined);
      setContratoNome("");
      setStatus("Lista");
      setBank({});
    }
  }, [open, initial]);

  const readFile = (file: File | undefined, cb: (data: string, name: string) => void) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => cb(String(r.result), file.name);
    r.readAsDataURL(file);
  };

  const submit = () => {
    if (saving || !nome.trim()) return;
    setSaving(true);
    const finalStatus = advanceStatusFromEntregas(status, entregas);
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      foto,
      nome: nome.trim(),
      nicho: nicho || undefined,
      telefone: telefone.trim() || undefined,
      email: email.trim() || undefined,
      redes,
      entregas,
      contrato,
      status: finalStatus,
      statusUpdatedAt: finalStatus === initial?.status ? initial?.statusUpdatedAt : todayISO(),
      bank,
    });
  };

  const isLast = step === steps.length - 1;
  const canNext = steps[step]?.key === "perfil" ? nome.trim().length > 0 : true;
  const current = steps[step]?.key ?? "perfil";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-xl flex-col gap-0 overflow-hidden border-border bg-background p-0">
        <div className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold">
            {initial ? "Editar influenciador" : "Novo influenciador"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Etapa {step + 1} de {steps.length} · {steps[step]?.label}
          </DialogDescription>

          <ol className="mt-4 flex items-start">
            {steps.map((s, i) => {
              const done = i < step;
              const active = i === step;
              const reachable = i <= step || (i === 1 && canNext);
              const Icon = s.icon;
              return (
                <li key={s.key} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full items-center">
                    <div
                      className={`h-0.5 flex-1 rounded-full transition-colors ${i === 0 ? "invisible" : done || active ? "bg-foreground" : "bg-muted"}`}
                    />
                    <button
                      type="button"
                      disabled={!reachable}
                      onClick={() => reachable && setStep(i)}
                      aria-label={`Ir para ${s.label}`}
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors ${
                        done
                          ? "border-foreground bg-foreground text-background"
                          : active
                            ? "border-foreground text-foreground"
                            : "border-border text-muted-foreground"
                      } ${reachable ? "cursor-pointer" : "cursor-not-allowed"}`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    </button>
                    <div
                      className={`h-0.5 flex-1 rounded-full transition-colors ${i === steps.length - 1 ? "invisible" : done ? "bg-foreground" : "bg-muted"}`}
                    />
                  </div>
                  <span
                    className={`max-w-full truncate text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {current === "perfil" && (
            <div className="space-y-5">
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
                  onChange={(e) => readFile(e.target.files?.[0], (d) => setFoto(d))}
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
            </div>
          )}

          {current === "redes" && (
            <div className="space-y-4">
              <FieldLabel
                title="Redes sociais"
                hint="Selecione as plataformas e adicione o handle."
              />
              <div className="flex flex-wrap gap-1.5">
                {REDES_OPTS.map((p) => {
                  const active = redes.some((r) => r.plataforma === p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setRedes((rs) =>
                          active
                            ? rs.filter((r) => r.plataforma !== p)
                            : [...rs, { id: crypto.randomUUID(), plataforma: p, handle: "" }],
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
                          setRedes((rs) =>
                            rs.map((x) => (x.id === r.id ? { ...x, handle: e.target.value } : x)),
                          )
                        }
                        placeholder="usuario"
                        className="flex-1 bg-transparent text-sm outline-none"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {current === "entregas" && (
            <div className="space-y-3">
              <FieldLabel
                title="Entregas"
                hint="Combine o formato e a quantidade. O status individual de cada entrega (etapa de produção) fica na tela de resumo do influenciador."
              />
              {entregas.length === 0 && <EmptyHint text="Nenhuma entrega adicionada." />}
              <div className="space-y-2">
                {entregas.map((e) => {
                  const update = (patch: Partial<Entrega>) =>
                    setEntregas((es) => es.map((x) => (x.id === e.id ? { ...x, ...patch } : x)));
                  const published = e.conteudoStatus === "Postado";
                  const expanded = expandedEntregas.has(e.id);
                  const resumoBits = [
                    e.dataPostagem &&
                      new Date(e.dataPostagem + "T00:00:00").toLocaleDateString("pt-BR"),
                    e.pagamento && pagamentoResumo(e.pagamento),
                    (e.anexos?.length ?? 0) > 0 &&
                      `${e.anexos!.length} anexo${e.anexos!.length === 1 ? "" : "s"}`,
                  ].filter(Boolean);
                  return (
                    <div key={e.id} className="rounded-lg border border-border bg-background">
                      {/* Cabeçalho sempre visível: formato + quantidade + resumo compacto.
                          Detalhes (data, anexos, pagamento, publicação) só aparecem expandidos —
                          com 3+ entregas, tudo sempre aberto virava uma parede de campos. */}
                      <div className="flex items-center gap-2 p-2.5">
                        <button
                          type="button"
                          onClick={() => toggleEntregaExpanded(e.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <ChevronDown
                            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                          />
                          <input
                            list="entregas-tipos"
                            value={e.tipo}
                            onClick={(ev) => ev.stopPropagation()}
                            onChange={(ev) => update({ tipo: ev.target.value })}
                            placeholder="Reels, Stories..."
                            className="w-28 shrink-0 rounded-md bg-transparent px-1 py-1 text-sm font-medium outline-none"
                          />
                          {!expanded && resumoBits.length > 0 && (
                            <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                              {resumoBits.join(" · ")}
                            </span>
                          )}
                        </button>
                        <div
                          className="flex shrink-0 items-center rounded-md bg-muted"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => update({ quantidade: Math.max(1, e.quantidade - 1) })}
                            className="h-7 w-7 text-sm text-muted-foreground hover:text-foreground"
                          >
                            −
                          </button>
                          <span className="w-7 text-center text-sm font-medium tabular-nums">
                            {e.quantidade}
                          </span>
                          <button
                            type="button"
                            onClick={() => update({ quantidade: e.quantidade + 1 })}
                            className="h-7 w-7 text-sm text-muted-foreground hover:text-foreground"
                          >
                            +
                          </button>
                        </div>
                        <RemoveBtn
                          onClick={() => setEntregas((es) => es.filter((x) => x.id !== e.id))}
                        />
                      </div>

                      {expanded && (
                        <div className="space-y-3 border-t border-border p-3">
                          <div className="space-y-1.5">
                            <EntregaDateField
                              label="Recebimento do roteiro"
                              value={e.dataRecebimentoRoteiro}
                              onChange={(v) => update({ dataRecebimentoRoteiro: v })}
                            />
                            <EntregaDateField
                              label="Recebimento do conteúdo"
                              value={e.dataRecebimentoConteudo}
                              onChange={(v) => update({ dataRecebimentoConteudo: v })}
                            />
                            <EntregaDateField
                              label="Postagem"
                              value={e.dataPostagem}
                              onChange={(v) => update({ dataPostagem: v })}
                            />
                          </div>

                          <EntregaAnexosEditor
                            anexos={e.anexos ?? []}
                            onChange={(anexos) => update({ anexos })}
                          />

                          <div className="space-y-1.5">
                            <p className="text-[11px] font-medium text-muted-foreground">
                              Pagamento combinado
                            </p>
                            <PagamentoEditor
                              value={e.pagamento}
                              onChange={(pagamento) => update({ pagamento })}
                              pagGrupos={pagGrupos}
                            />
                          </div>

                          {published && (
                            <div className="space-y-2 border-t border-border pt-2.5">
                              <p className="text-[11px] font-medium text-muted-foreground">
                                Publicação
                              </p>
                              <input
                                value={e.url ?? ""}
                                onChange={(ev) => update({ url: ev.target.value })}
                                placeholder="Link do conteúdo publicado"
                                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                              />
                              <div>
                                <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                                  Métricas
                                </p>
                                <MetricsEditor
                                  value={e.metrics}
                                  onChange={(m) => update({ metrics: m })}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <datalist id="entregas-tipos">
                {ENTREGAS_OPTS.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={() => {
                  const id = crypto.randomUUID();
                  setEntregas((es) => [
                    ...es,
                    { id, tipo: "Reels", quantidade: 1, status: "combinado" },
                  ]);
                  setExpandedEntregas((s) => new Set(s).add(id));
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar entrega
              </button>
            </div>
          )}

          {current === "pagamentos" && (
            <div className="space-y-3">
              <FieldLabel
                title="Pagamentos"
                hint="Aceite ou recuse os orçamentos combinados em cada entrega (etapa anterior). Só o que estiver Aceito conta no Financeiro."
              />
              <PagamentosList
                entregas={entregas}
                onSetAprovacao={(entregaId, aprovacao) =>
                  setEntregas((es) =>
                    es.map((x) =>
                      x.id === entregaId && x.pagamento
                        ? {
                            ...x,
                            pagamento: {
                              ...x.pagamento,
                              aprovacao,
                              data:
                                x.pagamento.data ||
                                (aprovacao === "aceito" ? todayISO() : x.pagamento.data),
                            },
                          }
                        : x,
                    ),
                  )
                }
              />
            </div>
          )}

          {current === "bancario" && (
            <div className="space-y-3">
              <FieldLabel
                title="Dados bancários"
                hint="Para transferência ou PIX ao influenciador."
              />
              <BankFields value={bank} onChange={setBank} />
            </div>
          )}

          {current === "contrato" && (
            <div className="space-y-3">
              <FieldLabel title="Contrato assinado" hint="Anexe PDF, imagem ou documento." />
              <input
                ref={contratoRef}
                type="file"
                className="hidden"
                onChange={(e) =>
                  readFile(e.target.files?.[0], (d, n) => {
                    setContrato(d);
                    setContratoNome(n);
                  })
                }
              />
              {contrato ? (
                <div className="flex items-center gap-3 rounded-md border border-border bg-background p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{contratoNome || "Contrato"}</p>
                    <p className="text-xs text-muted-foreground">Anexado</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => contratoRef.current?.click()}
                    className="rounded-md px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    Substituir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setContrato(undefined);
                      setContratoNome("");
                    }}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Remover"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => contratoRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-transparent px-3 py-10 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                >
                  <Upload className="h-5 w-5" />
                  <span>Clique para anexar o contrato</span>
                </button>
              )}
            </div>
          )}

          {current === "status" && (
            <div className="space-y-3">
              <FieldLabel title="Status atual" hint="Onde este influenciador está no fluxo." />
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
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-background px-6 py-3">
          <button
            type="button"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {step === 0 ? "Cancelar" : "Voltar"}
          </button>
          <div className="flex items-center gap-2">
            {/* Salvar fica disponível em qualquer etapa (não só na última) —
                antes, editar um campo cedo (ex.: telefone na etapa Perfil) e
                fechar o diálogo sem passar por todas as etapas perdia a
                alteração silenciosamente. */}
            <button
              type="button"
              onClick={submit}
              disabled={!nome.trim() || saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Salvando..." : initial ? "Salvar" : "Salvar influenciador"}
            </button>
            {!isLast && (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={!canNext}
                className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próximo
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  pagGrupos,
}: {
  value?: PagamentoEntrega;
  onChange: (p: PagamentoEntrega | undefined) => void;
  pagGrupos?: PagGrupo[];
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
      grupoId: undefined,
      grupoNome: undefined,
    });
  const updateConfig = (t: PagTipoEntrega, patch: Partial<PagamentoConfigEntrega>) =>
    update({ config: { ...norm.config, [t]: { ...(norm.config[t] ?? {}), ...patch } } });
  const applyGrupo = (g: PagGrupo) =>
    update({
      tipos: g.tipos as unknown as PagTipoEntrega[],
      config: g.config,
      grupoId: g.id,
      grupoNome: g.nome,
    });

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

      {pagGrupos && pagGrupos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Grupo:</span>
          {pagGrupos.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => applyGrupo(g)}
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                norm.grupoId === g.id
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                  : "bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {g.nome}
            </button>
          ))}
        </div>
      )}

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
      <p className="text-[10px] text-muted-foreground">
        Some para a aba Pagamentos como <b>Pendente</b> — só vira despesa no Financeiro depois de
        aceito.
      </p>
    </div>
  );
}

function PagamentosList({
  entregas,
  onSetAprovacao,
}: {
  entregas: Entrega[];
  onSetAprovacao: (entregaId: string, aprovacao: AprovacaoPagamento) => void;
}) {
  const comPagamento = entregas.filter((e) => e.pagamento);
  const total = totalAceito(entregas);

  if (comPagamento.length === 0) {
    return <EmptyHint text="Nenhum pagamento combinado ainda — adicione um na etapa Entregas." />;
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {comPagamento.map((e) => {
          const p = e.pagamento!;
          return (
            <li
              key={e.id}
              className="space-y-1.5 rounded-md border border-border bg-background p-2.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">{e.tipo}</span>
                  <span className="ml-1.5 text-muted-foreground">{pagamentoResumo(p)}</span>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${APROVACAO_TONE[p.aprovacao]}`}
                >
                  {APROVACAO_LABEL[p.aprovacao]}
                </span>
              </div>
              {p.data && <p className="text-[11px] text-muted-foreground">{fmtDate(p.data)}</p>}
              {p.aprovacao === "pendente" ? (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSetAprovacao(e.id, "aceito")}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                  >
                    Aceitar
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetAprovacao(e.id, "recusado")}
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
                  >
                    Recusar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSetAprovacao(e.id, "pendente")}
                  className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Marcar como pendente
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-right text-xs font-semibold text-foreground">
        Total aceito {fmtBRL(total)}
      </p>
    </div>
  );
}

/* ============================================================
 * Entrega anexos — lista de arquivos ligados a uma entrega (roteiro,
 * gravação, conteúdo publicado, etc), independente do status/etapa em que
 * ela está e sem limite de quantidade por categoria.
 * ============================================================ */

/** Campo de data opcional de uma entrega (roteiro/conteúdo/postagem são
 * controles independentes) — com um "x" pra limpar quando não se aplica
 * àquela entrega em específico, sem afetar as outras datas. */
function EntregaDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
      <span className="w-40 shrink-0">{label}</span>
      <input
        type="date"
        value={value ?? ""}
        onChange={(ev) => onChange(ev.target.value || undefined)}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={`Limpar ${label.toLowerCase()}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </label>
  );
}

const ENTREGA_ANEXO_TONE: Record<EntregaAnexoCategoria, string> = {
  Roteiro: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  Gravação: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  "Conteúdo publicado": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Outro: "bg-muted text-muted-foreground",
};

function EntregaAnexosEditor({
  anexos,
  onChange,
}: {
  anexos: EntregaAnexo[];
  onChange: (next: EntregaAnexo[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingCategoria = useRef<EntregaAnexoCategoria>("Roteiro");
  const addMenu = useDropdown();

  const pickCategoria = (c: EntregaAnexoCategoria) => {
    pendingCategoria.current = c;
    addMenu.setOpen(false);
    fileRef.current?.click();
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-foreground">Anexos</p>
        <div ref={addMenu.ref} className="relative">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const r = new FileReader();
              r.onload = () =>
                onChange([
                  ...anexos,
                  {
                    id: crypto.randomUUID(),
                    categoria: pendingCategoria.current,
                    nome: file.name,
                    url: String(r.result),
                  },
                ]);
              r.readAsDataURL(file);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => addMenu.setOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
          >
            <Paperclip className="h-3 w-3" /> Adicionar anexo
            <ChevronDown className="h-3 w-3" />
          </button>
          {addMenu.open && (
            <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-border bg-popover p-1 shadow-md">
              {ENTREGA_ANEXO_CATEGORIAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickCategoria(c)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ENTREGA_ANEXO_TONE[c]}`} />
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {anexos.length > 0 ? (
        <ul className="space-y-1">
          {anexos.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1"
            >
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ENTREGA_ANEXO_TONE[a.categoria]}`}
              >
                {a.categoria}
              </span>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                download={a.nome}
                className="min-w-0 flex-1 truncate text-xs text-foreground underline underline-offset-2"
              >
                {a.nome}
              </a>
              <button
                type="button"
                onClick={() => onChange(anexos.filter((x) => x.id !== a.id))}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Remover anexo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
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
  const [format, setFormat] = useState<"csv" | "json">("csv");

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
        if (has("pagamentos")) row.push(totalAceito(i.entregas).toString());
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
              onChange={(e) => setFormat(e.target.value as "csv" | "json")}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            >
              <option value="csv">CSV (Excel)</option>
              <option value="json">JSON</option>
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
