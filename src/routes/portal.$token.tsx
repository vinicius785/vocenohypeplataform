import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
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
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Facebook,
  FileText,
  History,
  Instagram,
  Linkedin,
  LayoutGrid,
  Megaphone,
  Newspaper,
  ImageIcon,
  PlayCircle,
  Sparkles,
  Twitter,
  Upload,
  Users,
  X,
  XCircle,
  Youtube,
} from "lucide-react";
import {
  ENTREGA_ETAPA_LABEL,
  ENTREGA_STATUS_TONE,
  type EntregaStatus,
} from "@/lib/campanha-status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { renderMarkdownLite, ArticleReader } from "@/components/marketing/BlogPanel";
import type { BlogEngagement } from "@/lib/blog-engagement";
import { PortalBugReportButton } from "@/components/PortalBugReportButton";
import { BackButton } from "@/components/BackButton";
import { VersionWatcher } from "@/components/VersionWatcher";
import { PortalDemandButton } from "@/components/PortalDemandButton";
import {
  getClienteLinkData,
  respondCampanhaInflu,
  respondCampanhaEntrega,
  updateInfluBriefing,
  updateInfluObservacoes,
  updateInfluBriefingAnexo,
  loadArtigoEngagement,
  toggleArtigoLike,
  addArtigoComentario,
} from "@/lib/cliente-link.functions";
import { formatSeguidores } from "@/lib/format";
import { fetchWorkspace, type Workspace } from "@/lib/workspace-store";
import { t, usePortalLang, PORTAL_LANGS, type PortalLang } from "@/lib/portal-i18n";
import type { MetricasRelatorio } from "@/components/influenciadores/InfluencerBoard";

/**
 * Portal do cliente (`/portal/$token`) — um link só, com TODAS as campanhas
 * do cliente. Estrutura de portal de verdade: barra lateral fixa (cliente +
 * navegação entre Início e cada campanha) e área principal com
 * lista-mestre/detalhe de influenciadores — nada de modal por cima da
 * página. Usa os mesmos componentes/tokens do resto da plataforma
 * (Avatar/Badge/Button, cores de tema claro/escuro).
 */

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Instagram,
  YouTube: Youtube,
  Facebook,
  LinkedIn: Linkedin,
  X: Twitter,
};
function PlatformIcon({ plataforma, className }: { plataforma: string; className?: string }) {
  const Icon = PLATFORM_ICONS[plataforma] ?? AtSign;
  return <Icon className={className} />;
}

const PLATFORM_URL_BUILDERS: Record<string, (handle: string) => string> = {
  Instagram: (h) => `https://instagram.com/${h}`,
  YouTube: (h) => `https://youtube.com/${h.startsWith("@") ? h : `@${h}`}`,
  Facebook: (h) => `https://facebook.com/${h}`,
  LinkedIn: (h) => `https://linkedin.com/in/${h}`,
  X: (h) => `https://x.com/${h}`,
};

function profileUrl(plataforma: string, handle: string): string | undefined {
  const clean = handle.trim().replace(/^@/, "");
  if (!clean) return undefined;
  if (/^https?:\/\//i.test(handle.trim())) return handle.trim();
  const build = PLATFORM_URL_BUILDERS[plataforma];
  return build ? build(clean) : undefined;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("pt-BR");
}

/** Pra timestamps completos (ISO com hora), diferente de `fmtDate` acima
 * que só entende datas soltas "YYYY-MM-DD". */
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Mesmo critério usado na galeria de conteúdos da VI — decide se um anexo
 * pode ser mostrado como thumbnail de imagem ou precisa de um ícone
 * genérico (vídeo, pdf, etc). */
function isImageUrl(nome?: string): boolean {
  return !!nome && /\.(png|jpe?g|gif|webp|svg)$/i.test(nome);
}

export const Route = createFileRoute("/portal/$token")({
  component: ClientPortalPage,
  // Carrega os dados da campanha (e o workspace, pro cabeçalho) no servidor
  // antes de mandar qualquer HTML — antes esta rota era `ssr: false` e
  // dependia 100% do JS carregar no navegador do cliente pra mostrar
  // qualquer coisa, o que trava em navegadores embutidos mais fracos (ex:
  // o navegador interno do Telegram) ou em conexões ruins: a pessoa fica
  // numa tela em branco pra sempre, sem nenhum erro. Com loader, o servidor
  // já manda o conteúdo pronto — funciona mesmo se o JS demorar ou falhar
  // pra hidratar.
  loader: async ({ params }) => {
    const [clienteData, ws] = await Promise.all([
      getClienteLinkData({ data: { token: params.token } }).catch(() => null),
      fetchWorkspace().catch(() => ({ nome: "Você no Hype", logo: "" })),
    ]);
    return { clienteData: clienteData as ClienteLinkData | null, ws };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.clienteData?.clienteNome || "Portal"} · Hype` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type PostMetrics = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
};
type DemographicEntry = { id: string; label: string; percentual: number };
type RedeMetrics = {
  interacoes?: number;
  visualizacoes?: number;
  taxaInteracao?: number;
  taxaAtencaoInicial?: number;
  genero?: DemographicEntry[];
  faixaEtaria?: DemographicEntry[];
  paises?: DemographicEntry[];
  cidades?: DemographicEntry[];
};
type Veredito = { motivo: string; respondedAt: string };
type PublicEntrega = {
  id: string;
  tipo: string;
  titulo?: string;
  quantidade: number;
  status: "orcado" | "combinado" | "publicado";
  conteudoStatus?: string;
  etapa?: "roteiro" | "conteudo";
  statusCliente: string;
  dataPostagem?: string;
  publicadoEm?: string;
  url?: string;
  anexos?: { id: string; categoria: string; nome: string; url: string }[];
  metrics?: PostMetrics;
  roteiroReprovacao?: Veredito;
  conteudoReprovacao?: Veredito;
};
type PublicInfluencer = {
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
};
type PublicCronogramaItem = {
  id: string;
  date: string;
  title: string;
  description?: string;
  recurring?: boolean;
};
type PublicCampanha = {
  id: string;
  nome: string;
  prazo?: string;
  dataInicio?: string;
  planejado: number;
  influencers: PublicInfluencer[];
  cronograma: PublicCronogramaItem[];
  relatorioMetricas?: MetricasRelatorio;
};
type PublicArticle = {
  id: string;
  title: string;
  cover?: string;
  category?: string;
  excerpt?: string;
  content?: string;
  authorName?: string;
  publishDate?: string;
};
type ClienteLinkData = {
  clienteNome: string;
  clienteFoto?: string;
  campanhas: PublicCampanha[];
  artigos: PublicArticle[];
};

/** Resumo compacto das entregas agrupadas por tipo, ex: "3× Reels · 2× Stories". */
function entregasSummary(entregas: PublicEntrega[]): string {
  const byTipo = new Map<string, number>();
  for (const e of entregas) byTipo.set(e.tipo, (byTipo.get(e.tipo) ?? 0) + (e.quantidade || 1));
  return Array.from(byTipo.entries())
    .map(([tipo, qtd]) => `${qtd}× ${tipo}`)
    .join(" · ");
}

/** Um influenciador "precisa de você agora" se a seleção está aguardando
 * decisão, ou alguma entrega está aguardando aprovação de roteiro/conteúdo. */
function pendingReason(inf: PublicInfluencer, lang: PortalLang): string | null {
  if (inf.status === "ENVIADO_AO_CLIENTE" && !inf.clienteReprovacao) return t(lang, "pendingInflu");
  const roteiro = inf.entregas.some(
    (e) => e.conteudoStatus === "AGUARDANDO_APROVACAO" && e.etapa === "roteiro",
  );
  if (roteiro) return t(lang, "pendingRoteiro");
  const conteudo = inf.entregas.some(
    (e) => e.conteudoStatus === "AGUARDANDO_APROVACAO" && e.etapa === "conteudo",
  );
  if (conteudo) return t(lang, "pendingConteudo");
  return null;
}

/** Mesma lógica do ícone de aprovação/reprovação sobre a foto usado
 * internamente (InfluCard, na VI). */
function influApproval(inf: PublicInfluencer): "aprovado" | "reprovado" | null {
  if (inf.status === "RECUSADO") return "reprovado";
  if (inf.status === "ENVIADO_AO_CLIENTE") return inf.clienteReprovacao ? "reprovado" : null;
  return "aprovado";
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function TopBar({
  ws,
  lang,
  onLangChange,
}: {
  ws: Workspace;
  lang: PortalLang;
  onLangChange: (l: PortalLang) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = PORTAL_LANGS.find((l) => l.code === lang) ?? PORTAL_LANGS[0];
  return (
    <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border bg-background px-5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground text-background">
        {ws.logo ? (
          <img src={ws.logo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[11px] font-bold">{ws.nome.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <span className="text-sm font-semibold text-foreground">{ws.nome}</span>

      <div className="relative ml-auto">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm hover:bg-muted"
          aria-label="Idioma"
        >
          <span className="text-base leading-none">{current.flag}</span>
          <span className="hidden text-xs font-medium text-foreground sm:inline">
            {current.label}
          </span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-20 mt-1.5 w-40 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
              {PORTAL_LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    onLangChange(l.code);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${
                    l.code === lang ? "bg-muted font-medium" : ""
                  }`}
                >
                  <span className="text-base leading-none">{l.flag}</span>
                  {l.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </header>
  );
}

function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function MetricStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

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
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <DemographicMiniChart data={data} chartType={chartType} />
    </div>
  );
}

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

function hasEntregaMetrics(m?: PostMetrics): boolean {
  return Boolean(m && Object.values(m).some((v) => v));
}

/** Chip de anexo (roteiro/conteúdo) — reaproveitado nos cards de entrega e
 * no card de briefing, no lugar de um link solto sublinhado. */
function AnexoChip({ nome, url, onRemove }: { nome?: string; url: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 py-1 pl-1 pr-2 text-xs">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 font-medium text-foreground hover:text-foreground/80"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
          <FileText className="h-3 w-3" />
        </span>
        <span className="max-w-[180px] truncate">{nome || "Anexo"}</span>
        <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
      </a>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Remover anexo"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/** Alguns motivos foram colados direto de um texto gerado por IA e
 * carregam sobras do "prompt" (preâmbulo tipo "Aqui está:" e um cabeçalho
 * "Justificativa de reprovação — [Nome do influenciador]" repetindo um
 * placeholder de colchetes que nunca foi preenchido). Limpa só a
 * apresentação — o texto salvo no banco não é alterado. */
function sanitizeMotivo(raw: string, nome: string): string {
  let text = raw.trim();
  text = text.replace(/^aqui est[áa]:?\s*\n+/i, "");
  text = text.replace(/^justificativa de reprova[cç][ãa]o\s*[—-]?[^\n]*\n+/i, "");
  text = text.replace(/\[\s*nome do influenciador\s*\]/gi, nome);
  return text.trim();
}

/** Aviso persistente de reprovação (do influ ou de uma entrega), até o
 * time reenviar e o cliente decidir de novo. */
function ReprovacaoBanner({ v, lang, nome }: { v: Veredito; lang: PortalLang; nome: string }) {
  const motivo = sanitizeMotivo(v.motivo, nome);
  return (
    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {t(lang, "reprovouAviso")}
        </p>
        <span className="text-[10px] text-rose-700/70 dark:text-rose-400/70">
          {fmtDateTime(v.respondedAt)}
        </span>
      </div>
      {motivo && (
        <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-rose-900/90 dark:text-rose-200/85">
          {motivo}
        </p>
      )}
    </div>
  );
}

/** Barra de ação Aprovar/Reprovar reaproveitada nos 3 pontos de decisão
 * (seleção do influ, roteiro de uma entrega, conteúdo de uma entrega). */
function ApproveRejectBar({
  busy,
  rejecting,
  motivo,
  lang,
  setRejecting,
  setMotivo,
  onApprove,
  onConfirmReject,
}: {
  busy: boolean;
  rejecting: boolean;
  motivo: string;
  lang: PortalLang;
  setRejecting: (v: boolean) => void;
  setMotivo: (v: string) => void;
  onApprove: () => void;
  onConfirmReject: () => void;
}) {
  if (rejecting) {
    return (
      <div className="space-y-1.5">
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={t(lang, "motivoPlaceholder")}
          autoFocus
          className="h-16 w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
        <div className="flex justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => {
              setRejecting(false);
              setMotivo("");
            }}
          >
            {t(lang, "cancelar")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={onConfirmReject}
            disabled={busy}
          >
            {t(lang, "confirmarReprovacao")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-1.5">
      <Button size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={onApprove} disabled={busy}>
        <CheckCircle2 className="h-3 w-3" />
        {t(lang, "aprovar")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2.5 text-xs"
        onClick={() => setRejecting(true)}
        disabled={busy}
      >
        <XCircle className="h-3 w-3" />
        {t(lang, "reprovar")}
      </Button>
    </div>
  );
}

/** Selo de estágio no fim de cada linha da lista — âmbar+ponto quando
 * precisa de ação do cliente agora, neutro (Badge outline) nos demais. */
function StatusBadge({
  inf,
  lang,
  className = "",
}: {
  inf: PublicInfluencer;
  lang: PortalLang;
  className?: string;
}) {
  const pending = pendingReason(inf, lang);
  if (pending) {
    return (
      <Badge
        className={`gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 ${className}`}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
        {pending}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={`text-muted-foreground ${className}`}>
      {inf.statusCliente}
    </Badge>
  );
}

/** Card de galeria — usado na lista de influenciadores de uma campanha
 * (foto grande em destaque, em vez da lista de linhas). */
function InfluencerGalleryCard({
  inf,
  onOpen,
  lang,
}: {
  inf: PublicInfluencer;
  onOpen: () => void;
  lang: PortalLang;
}) {
  const approval = influApproval(inf);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-background p-4 text-center transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md"
    >
      <div className="relative h-16 w-16 shrink-0">
        <Avatar className="h-16 w-16 ring-1 ring-border transition-all group-hover:ring-foreground/30">
          {inf.foto && <AvatarImage src={inf.foto} alt={inf.nome} />}
          <AvatarFallback className="text-base font-semibold">
            {initialsOf(inf.nome)}
          </AvatarFallback>
        </Avatar>
        {approval && (
          <span
            title={approval === "reprovado" ? inf.clienteReprovacao?.motivo : undefined}
            className={`absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background ${
              approval === "aprovado" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
            }`}
          >
            {approval === "aprovado" ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
          </span>
        )}
      </div>
      <p className="truncate text-sm font-semibold text-foreground">{inf.nome}</p>
      {inf.nicho && (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
          {inf.nicho}
        </Badge>
      )}
      {inf.entregas.length > 0 && (
        <p className="truncate text-xs text-muted-foreground">{entregasSummary(inf.entregas)}</p>
      )}
      <StatusBadge inf={inf} lang={lang} className="px-2 py-0 text-[10px]" />
    </button>
  );
}

/** Painel de detalhe — substitui a lista dentro da mesma área principal
 * (com botão Voltar), em vez de abrir um modal por cima da página. */
function InfluencerDetail({
  inf,
  lang,
  onBack,
  onRespondInflu,
  onRespondEntrega,
  onSaveBriefing,
  onSaveObservacoes,
  onSaveBriefingAnexo,
}: {
  inf: PublicInfluencer;
  lang: PortalLang;
  onBack: () => void;
  onRespondInflu: (status: "aprovado" | "reprovado", motivo?: string) => Promise<void>;
  onRespondEntrega: (
    entregaId: string,
    kind: "roteiro" | "conteudo",
    status: "aprovado" | "reprovado",
    motivo?: string,
  ) => Promise<void>;
  onSaveBriefing: (briefingPersonalizado: string) => Promise<void>;
  onSaveObservacoes: (observacoes: string) => Promise<void>;
  onSaveBriefingAnexo: (file: { nome: string; dataUrl: string } | null) => Promise<void>;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rejectingKey, setRejectingKey] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [briefingDraft, setBriefingDraft] = useState(inf.briefingPersonalizado ?? "");
  const [briefingSaving, setBriefingSaving] = useState(false);
  const [observacoesDraft, setObservacoesDraft] = useState(inf.observacoes ?? "");
  const [observacoesSaving, setObservacoesSaving] = useState(false);
  const [anexoUploading, setAnexoUploading] = useState(false);
  const anexoInputRef = useRef<HTMLInputElement>(null);
  useEffect(
    () => setBriefingDraft(inf.briefingPersonalizado ?? ""),
    [inf.id, inf.briefingPersonalizado],
  );
  useEffect(() => setObservacoesDraft(inf.observacoes ?? ""), [inf.id, inf.observacoes]);
  const saveBriefing = async () => {
    if (briefingDraft === (inf.briefingPersonalizado ?? "")) return;
    setBriefingSaving(true);
    try {
      await onSaveBriefing(briefingDraft);
    } finally {
      setBriefingSaving(false);
    }
  };
  const saveObservacoes = async () => {
    if (observacoesDraft === (inf.observacoes ?? "")) return;
    setObservacoesSaving(true);
    try {
      await onSaveObservacoes(observacoesDraft);
    } finally {
      setObservacoesSaving(false);
    }
  };
  const uploadAnexo = async (file: File) => {
    setAnexoUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      await onSaveBriefingAnexo({ nome: file.name, dataUrl });
    } finally {
      setAnexoUploading(false);
    }
  };

  const entregasComMetrics = inf.entregas.filter((e) => hasEntregaMetrics(e.metrics));
  const redesComMetrics = inf.redes.filter((r) =>
    hasRedeMetrics(inf.profileMetrics?.porRede?.[r.id ?? r.plataforma]),
  );
  const semNadaAlem = entregasComMetrics.length === 0 && redesComMetrics.length === 0;
  const influPending = inf.status === "ENVIADO_AO_CLIENTE" && !inf.clienteReprovacao;

  const runInflu = async (status: "aprovado" | "reprovado") => {
    setBusyKey("influ");
    try {
      await onRespondInflu(status, status === "reprovado" ? motivo.trim() : undefined);
      setRejectingKey(null);
      setMotivo("");
    } finally {
      setBusyKey(null);
    }
  };
  const runEntrega = async (
    entregaId: string,
    kind: "roteiro" | "conteudo",
    status: "aprovado" | "reprovado",
  ) => {
    const key = `${kind}:${entregaId}`;
    setBusyKey(key);
    try {
      await onRespondEntrega(
        entregaId,
        kind,
        status,
        status === "reprovado" ? motivo.trim() : undefined,
      );
      setRejectingKey(null);
      setMotivo("");
    } finally {
      setBusyKey(null);
    }
  };

  // Timeline: mais cedo primeiro; entregas sem data planejada ficam no fim.
  const entregasOrdenadas = [...inf.entregas].sort((a, b) => {
    if (!a.dataPostagem && !b.dataPostagem) return 0;
    if (!a.dataPostagem) return 1;
    if (!b.dataPostagem) return -1;
    return a.dataPostagem.localeCompare(b.dataPostagem);
  });

  // Galeria: só o conteúdo já publicado deste influenciador, mesmo critério
  // da galeria da campanha na VI (anexo categoria "Conteúdo publicado", com
  // o link "url" como alternativa quando não há anexo).
  const galeriaItems: { entrega: PublicEntrega; nome?: string; url: string }[] = inf.entregas
    .filter((e) => e.status === "publicado")
    .flatMap((e) => {
      const publicados = (e.anexos ?? []).filter((a) => a.categoria === "Conteúdo publicado");
      if (publicados.length > 0) {
        return publicados.map((a) => ({
          entrega: e,
          nome: a.nome as string | undefined,
          url: a.url,
        }));
      }
      return e.url ? [{ entrega: e, nome: undefined as string | undefined, url: e.url }] : [];
    });

  return (
    <div>
      <BackButton onClick={onBack} label={t(lang, "back")} className="mb-4" />

      {/* HERO — foto/nome em destaque, com aprovar/reprovar direto no cabeçalho
          quando pendente, mesmo efeito de elevação sutil usado nos cards da
          plataforma interna (hover -translate-y + shadow). */}
      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        <div
          className="h-16 sm:h-20"
          style={{
            background: "linear-gradient(135deg, var(--chart-1), var(--chart-2), var(--chart-3))",
          }}
        />
        <div className="px-5 pb-5">
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-end sm:text-left">
            <Avatar className="-mt-10 h-20 w-20 shrink-0 ring-4 ring-background sm:h-24 sm:w-24">
              {inf.foto && <AvatarImage src={inf.foto} alt={inf.nome} />}
              <AvatarFallback className="text-xl font-semibold">
                {initialsOf(inf.nome)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h2 className="text-xl font-semibold text-foreground">{inf.nome}</h2>
                {inf.nicho && <Badge variant="secondary">{inf.nicho}</Badge>}
                <StatusBadge inf={inf} lang={lang} />
              </div>
            </div>
            {influPending && !rejectingKey && (
              <div className="flex shrink-0 gap-2 pb-1">
                <Button
                  size="sm"
                  disabled={busyKey === "influ"}
                  onClick={() => void runInflu("aprovado")}
                  className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t(lang, "aprovar")}
                </Button>
                <Button
                  size="sm"
                  disabled={busyKey === "influ"}
                  onClick={() => setRejectingKey("influ")}
                  className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {t(lang, "reprovar")}
                </Button>
              </div>
            )}
          </div>

          {influPending && rejectingKey === "influ" && (
            <div className="mt-3 space-y-1.5 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={t(lang, "motivoPlaceholder")}
                autoFocus
                className="h-16 w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => {
                    setRejectingKey(null);
                    setMotivo("");
                  }}
                >
                  {t(lang, "cancelar")}
                </Button>
                <Button
                  size="sm"
                  className="h-7 gap-1 bg-rose-600 px-2.5 text-xs text-white hover:bg-rose-700"
                  onClick={() => void runInflu("reprovado")}
                  disabled={busyKey === "influ"}
                >
                  {t(lang, "confirmarReprovacao")}
                </Button>
              </div>
            </div>
          )}
          {!influPending && inf.clienteReprovacao && (
            <div className="mt-3">
              <ReprovacaoBanner v={inf.clienteReprovacao} lang={lang} nome={inf.nome} />
            </div>
          )}

          {/* Redes + toggle de métricas */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {inf.redes.length === 0 ? (
              <span className="text-xs text-muted-foreground">{t(lang, "noRedes")}</span>
            ) : (
              inf.redes.map((r, i) => {
                const url = profileUrl(r.plataforma, r.handle);
                const content = (
                  <>
                    <PlatformIcon plataforma={r.plataforma} className="h-3.5 w-3.5" />
                    {r.handle || r.plataforma}
                    {r.seguidores ? ` · ${formatSeguidores(r.seguidores)} seg.` : ""}
                  </>
                );
                const className = `inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground${url ? " hover:bg-muted-foreground/20" : ""}`;
                return url ? (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className={className}>
                    {content}
                  </a>
                ) : (
                  <span key={i} className={className}>
                    {content}
                  </span>
                );
              })
            )}
            {!semNadaAlem && (
              <button
                type="button"
                onClick={() => setMetricsOpen((o) => !o)}
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                {t(lang, metricsOpen ? "fecharMetricas" : "abrirMetricas")}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${metricsOpen ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>

          {/* Métricas — expande/recolhe, sem sumir a hero de cima. */}
          <div
            className={`grid transition-all duration-300 ease-out ${metricsOpen ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
          >
            <div className="min-h-0 space-y-4 overflow-hidden">
              {redesComMetrics.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(lang, "metricasPerfil")}
                  </p>
                  {redesComMetrics.map((r) => {
                    const rm = inf.profileMetrics!.porRede![r.id ?? r.plataforma]!;
                    return (
                      <div
                        key={r.id ?? r.plataforma}
                        className="space-y-4 rounded-xl border border-border bg-muted/20 p-4"
                      >
                        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <PlatformIcon plataforma={r.plataforma} className="h-3.5 w-3.5" />
                          {r.handle ? `@${r.handle}` : r.plataforma}
                        </p>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                          {r.seguidores ? (
                            <MetricStat
                              label={t(lang, "seguidores")}
                              value={formatSeguidores(r.seguidores)}
                            />
                          ) : null}
                          {rm.interacoes ? (
                            <MetricStat
                              label={t(lang, "interacoes")}
                              value={rm.interacoes.toLocaleString("pt-BR")}
                            />
                          ) : null}
                          {rm.visualizacoes ? (
                            <MetricStat
                              label={t(lang, "visualizacoes")}
                              value={rm.visualizacoes.toLocaleString("pt-BR")}
                            />
                          ) : null}
                          {rm.taxaInteracao ? (
                            <MetricStat
                              label={t(lang, "taxaInteracao")}
                              value={`${rm.taxaInteracao}%`}
                            />
                          ) : null}
                          {rm.taxaAtencaoInicial ? (
                            <MetricStat
                              label={t(lang, "atencaoInicial")}
                              value={`${rm.taxaAtencaoInicial}%`}
                            />
                          ) : null}
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <DemographicChart
                            title={t(lang, "genero")}
                            entries={rm.genero}
                            chartType="pie"
                          />
                          <DemographicChart
                            title={t(lang, "faixaEtaria")}
                            entries={rm.faixaEtaria}
                          />
                          <DemographicChart title={t(lang, "paises")} entries={rm.paises} />
                          <DemographicChart title={t(lang, "cidades")} entries={rm.cidades} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {entregasComMetrics.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(lang, "metricasEntregas")}
                  </p>
                  {entregasComMetrics.map((e) => (
                    <div key={e.id} className="rounded-xl border border-border bg-muted/20 p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {e.tipo}
                      </p>
                      <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                        {e.metrics?.views ? (
                          <MetricStat
                            label={t(lang, "views")}
                            value={e.metrics.views.toLocaleString("pt-BR")}
                          />
                        ) : null}
                        {e.metrics?.reach ? (
                          <MetricStat
                            label={t(lang, "alcance")}
                            value={e.metrics.reach.toLocaleString("pt-BR")}
                          />
                        ) : null}
                        {e.metrics?.likes ? (
                          <MetricStat
                            label={t(lang, "curtidas")}
                            value={e.metrics.likes.toLocaleString("pt-BR")}
                          />
                        ) : null}
                        {e.metrics?.comments ? (
                          <MetricStat
                            label={t(lang, "comentarios")}
                            value={e.metrics.comments.toLocaleString("pt-BR")}
                          />
                        ) : null}
                        {e.metrics?.shares ? (
                          <MetricStat
                            label={t(lang, "compartilhamentos")}
                            value={e.metrics.shares.toLocaleString("pt-BR")}
                          />
                        ) : null}
                        {e.metrics?.saves ? (
                          <MetricStat
                            label={t(lang, "salvos")}
                            value={e.metrics.saves.toLocaleString("pt-BR")}
                          />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* ENTREGAS — cards organizados por entrega, com status e ação inline.
            Perfil recusado nunca chegou a ser aprovado (única transição pra
            RECUSADO é antes de APROVADO), então não faz sentido mostrar
            entregas com status de produção/aprovação em andamento aqui. */}
        {inf.status === "RECUSADO" ? (
          <section className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            {t(lang, "recusadoSemEntregas")}
          </section>
        ) : (
          entregasOrdenadas.length > 0 && (
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Clock className="h-4 w-4" />{" "}
                {t(lang, "entregasHeader", { count: inf.entregas.length })}
              </h3>
              <div className="space-y-2.5">
                {entregasOrdenadas.map((e) => {
                  const roteiroPendente =
                    e.conteudoStatus === "AGUARDANDO_APROVACAO" && e.etapa === "roteiro";
                  const conteudoPendente =
                    e.conteudoStatus === "AGUARDANDO_APROVACAO" && e.etapa === "conteudo";
                  const publicado = e.status === "publicado";
                  const pendente = roteiroPendente || conteudoPendente;
                  const roteiroAnexos = (e.anexos ?? []).filter((a) => a.categoria === "Roteiro");
                  const conteudoAnexos = (e.anexos ?? []).filter(
                    (a) => a.categoria === "Conteúdo publicado",
                  );
                  const barTone = publicado
                    ? "bg-emerald-500"
                    : pendente
                      ? "bg-amber-500"
                      : "bg-border";
                  const pillTone = e.conteudoStatus
                    ? (ENTREGA_STATUS_TONE[e.conteudoStatus as EntregaStatus] ??
                      "bg-muted text-muted-foreground")
                    : "bg-muted text-muted-foreground";
                  return (
                    <div
                      key={e.id}
                      className="flex overflow-hidden rounded-xl border border-border bg-background shadow-sm"
                    >
                      <span className={`w-1 shrink-0 ${barTone}`} />
                      <div className="min-w-0 flex-1 p-3.5 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="font-medium text-foreground">
                              {e.quantidade && e.quantidade > 1 ? `${e.quantidade}× ` : ""}
                              {e.titulo ? `${e.tipo} · ${e.titulo}` : e.tipo}
                            </span>
                            {e.etapa && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {ENTREGA_ETAPA_LABEL[e.etapa]}
                              </span>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {e.dataPostagem && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <CalendarDays className="h-3 w-3" /> {fmtDate(e.dataPostagem)}
                              </span>
                            )}
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${pillTone}`}
                            >
                              {e.statusCliente}
                            </span>
                          </div>
                        </div>

                        {roteiroPendente && (
                          <div className="mt-3 space-y-2 border-t border-border pt-3">
                            {roteiroAnexos.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {roteiroAnexos.map((a) => (
                                  <AnexoChip key={a.id} nome={a.nome} url={a.url} />
                                ))}
                              </div>
                            )}
                            <ApproveRejectBar
                              busy={busyKey === `roteiro:${e.id}`}
                              rejecting={rejectingKey === `roteiro:${e.id}`}
                              motivo={motivo}
                              lang={lang}
                              setRejecting={(v) => {
                                setRejectingKey(v ? `roteiro:${e.id}` : null);
                                setMotivo("");
                              }}
                              setMotivo={setMotivo}
                              onApprove={() => void runEntrega(e.id, "roteiro", "aprovado")}
                              onConfirmReject={() => void runEntrega(e.id, "roteiro", "reprovado")}
                            />
                          </div>
                        )}
                        {!roteiroPendente && e.roteiroReprovacao && (
                          <div className="mt-3">
                            <ReprovacaoBanner v={e.roteiroReprovacao} lang={lang} nome={inf.nome} />
                          </div>
                        )}

                        {conteudoPendente && (
                          <div className="mt-3 space-y-2 border-t border-border pt-3">
                            {conteudoAnexos.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {conteudoAnexos.map((a) => (
                                  <AnexoChip key={a.id} nome={a.nome} url={a.url} />
                                ))}
                              </div>
                            )}
                            <ApproveRejectBar
                              busy={busyKey === `conteudo:${e.id}`}
                              rejecting={rejectingKey === `conteudo:${e.id}`}
                              motivo={motivo}
                              lang={lang}
                              setRejecting={(v) => {
                                setRejectingKey(v ? `conteudo:${e.id}` : null);
                                setMotivo("");
                              }}
                              setMotivo={setMotivo}
                              onApprove={() => void runEntrega(e.id, "conteudo", "aprovado")}
                              onConfirmReject={() => void runEntrega(e.id, "conteudo", "reprovado")}
                            />
                          </div>
                        )}
                        {!conteudoPendente && e.conteudoReprovacao && (
                          <div className="mt-3">
                            <ReprovacaoBanner
                              v={e.conteudoReprovacao}
                              lang={lang}
                              nome={inf.nome}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )
        )}

        {/* GALERIA — só o conteúdo publicado deste influenciador nesta campanha */}
        {galeriaItems.length > 0 && (
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ImageIcon className="h-4 w-4" /> {t(lang, "galeriaHeader")}
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {galeriaItems.map(({ entrega, nome, url }, idx) => {
                const showImage = isImageUrl(nome);
                return (
                  <a
                    key={`${entrega.id}-${idx}`}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="group overflow-hidden rounded-xl border border-border bg-background transition-colors hover:border-foreground/30"
                  >
                    <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted">
                      {showImage ? (
                        <img
                          src={url}
                          alt={entrega.titulo ?? entrega.tipo}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                          <PlayCircle className="h-6 w-6" strokeWidth={1.5} />
                          <span className="text-[11px]">{entrega.tipo}</span>
                        </div>
                      )}
                    </div>
                    <p className="truncate p-2 text-[11px] text-muted-foreground">
                      {entrega.titulo || entrega.tipo}
                    </p>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        <div className="border-t border-border" />

        {/* BRIEFING + OBSERVAÇÕES */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col rounded-2xl border border-border bg-background shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-sm font-semibold text-foreground">
                  {t(lang, "briefingHeader")}
                </h3>
              </div>
              {briefingSaving && (
                <span className="text-[10px] font-medium text-muted-foreground">
                  {t(lang, "saving")}
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <textarea
                value={briefingDraft}
                onChange={(e) => setBriefingDraft(e.target.value)}
                onBlur={() => void saveBriefing()}
                placeholder={t(lang, "briefingPlaceholder")}
                rows={5}
                className="w-full flex-1 resize-none rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-ring focus:bg-background focus:ring-1 focus:ring-ring"
              />
              {inf.briefingAnexoUrl ? (
                <AnexoChip
                  nome={inf.briefingAnexoNome}
                  url={inf.briefingAnexoUrl}
                  onRemove={() => void onSaveBriefingAnexo(null)}
                />
              ) : (
                <>
                  <button
                    type="button"
                    disabled={anexoUploading}
                    onClick={() => anexoInputRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/30 hover:text-foreground disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {anexoUploading ? t(lang, "enviando") : t(lang, "anexarArquivo")}
                  </button>
                  <input
                    ref={anexoInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadAnexo(file);
                    }}
                  />
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col rounded-2xl border border-border bg-background shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-sm font-semibold text-foreground">
                  {t(lang, "observacoesHeader")}
                </h3>
              </div>
              {observacoesSaving && (
                <span className="text-[10px] font-medium text-muted-foreground">
                  {t(lang, "saving")}
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <textarea
                value={observacoesDraft}
                onChange={(e) => setObservacoesDraft(e.target.value)}
                onBlur={() => void saveObservacoes()}
                placeholder={t(lang, "observacoesPlaceholder")}
                rows={5}
                className="w-full flex-1 resize-none rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-ring focus:bg-background focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </section>

        {(() => {
          type TimelineItem = { label: string; at: string; tone?: "reprovado" };
          const items: TimelineItem[] = [];
          if (inf.criadoEm) items.push({ label: t(lang, "adicionadoCampanha"), at: inf.criadoEm });
          for (const h of inf.historico ?? []) items.push({ label: h.status, at: h.at });
          if (inf.clienteReprovacao) {
            items.push({
              label: t(lang, "reprovadoEm"),
              at: inf.clienteReprovacao.respondedAt,
              tone: "reprovado",
            });
          }
          items.sort((a, b) => a.at.localeCompare(b.at));
          if (items.length === 0) return null;
          return (
            <section className="rounded-2xl border border-border bg-background p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <History className="h-4 w-4" /> {t(lang, "historicoHeader")}
              </h3>
              <ol className="space-y-2.5 border-l border-border pl-4">
                {items.map((it, i) => (
                  <li key={i} className="relative text-sm">
                    <span
                      className={`absolute -left-[21px] top-1 h-2 w-2 rounded-full ${
                        it.tone === "reprovado" ? "bg-rose-500" : "bg-foreground/40"
                      }`}
                    />
                    <span
                      className={
                        it.tone === "reprovado"
                          ? "font-medium text-rose-600 dark:text-rose-400"
                          : "font-medium text-foreground"
                      }
                    >
                      {it.label}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">{fmtDateTime(it.at)}</span>
                  </li>
                ))}
              </ol>
            </section>
          );
        })()}

        {semNadaAlem && !metricsOpen && inf.entregas.length === 0 && (
          <p className="text-sm text-muted-foreground">{t(lang, "noMetrics")}</p>
        )}
      </div>
    </div>
  );
}

type PendingFeedItem = {
  campanhaId: string;
  campanhaNome: string;
  inf: PublicInfluencer;
  reason: string;
};
type ContentFeedItem = {
  campanhaId: string;
  campanhaNome: string;
  inf: PublicInfluencer;
  entrega: PublicEntrega;
};

function ClientPortalPage() {
  const { token } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const getDataFn = useServerFn(getClienteLinkData);
  const respondInfluFn = useServerFn(respondCampanhaInflu);
  const respondEntregaFn = useServerFn(respondCampanhaEntrega);
  const updateBriefingFn = useServerFn(updateInfluBriefing);
  const updateObservacoesFn = useServerFn(updateInfluObservacoes);
  const updateBriefingAnexoFn = useServerFn(updateInfluBriefingAnexo);
  const loadEngagementFn = useServerFn(loadArtigoEngagement);
  const toggleLikeFn = useServerFn(toggleArtigoLike);
  const addComentarioFn = useServerFn(addArtigoComentario);
  const [data, setData] = useState<ClienteLinkData | null>(loaderData.clienteData);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">(
    loaderData.clienteData ? "ready" : "notfound",
  );
  const [activeCampanhaId, setActiveCampanhaId] = useState<string | null>(null);
  const [influTab, setInfluTab] = useState<"todos" | "reprovados">("todos");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [readingArticleId, setReadingArticleId] = useState<string | null>(null);
  const [readingEngagement, setReadingEngagement] = useState<BlogEngagement | null>(null);

  useEffect(() => {
    if (!readingArticleId) {
      setReadingEngagement(null);
      return;
    }
    let cancelled = false;
    loadEngagementFn({ data: { token, postId: readingArticleId } }).then((e) => {
      if (!cancelled) setReadingEngagement(e);
    });
    return () => {
      cancelled = true;
    };
  }, [readingArticleId, loadEngagementFn, token]);
  const [ws, setWs] = useState<Workspace>(loaderData.ws);
  const [lang, setLang] = usePortalLang();
  useEffect(() => setInfluTab("todos"), [activeCampanhaId]);

  // Recarrega os dados depois de uma ação do cliente (aprovar/reprovar,
  // salvar briefing, etc) — o carregamento inicial já veio pronto do
  // servidor via `loader`, isso aqui só refresca em resposta a mutações.
  const load = () => {
    getDataFn({ data: { token } })
      .then((row) => {
        setData(row as ClienteLinkData);
        setStatus("ready");
        document.title = `${(row as ClienteLinkData).clienteNome || "Portal"} · Hype`;
      })
      .catch(() => setStatus("notfound"));
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <TopBar ws={ws} lang={lang} onLangChange={setLang} />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">{t(lang, "loading")}</p>
        </div>
      </div>
    );
  }

  if (status === "notfound" || !data) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <TopBar ws={ws} lang={lang} onLangChange={setLang} />
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <h1 className="text-lg font-semibold text-foreground">{t(lang, "notFoundTitle")}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{t(lang, "notFoundBody")}</p>
          </div>
        </div>
      </div>
    );
  }

  const activeCampanha = data.campanhas.find((c) => c.id === activeCampanhaId) ?? null;
  const reprovados = activeCampanha?.influencers.filter((i) => i.clienteReprovacao) ?? [];
  const ativos = activeCampanha?.influencers.filter((i) => !i.clienteReprovacao) ?? [];
  const viewing = activeCampanha?.influencers.find((i) => i.id === viewingId) ?? null;

  const allInfluencers = data.campanhas.flatMap((c) => c.influencers);
  const totalInflus = allInfluencers.length;
  const totalAguardando = allInfluencers.filter((i) => pendingReason(i, lang)).length;

  const feed: PendingFeedItem[] = data.campanhas.flatMap((c) =>
    c.influencers
      .map((inf) => {
        const reason = pendingReason(inf, lang);
        return reason ? { campanhaId: c.id, campanhaNome: c.nome, inf, reason } : null;
      })
      .filter((x): x is PendingFeedItem => x !== null),
  );

  // Conteúdo já publicado, mais recente primeiro — o "feed" central,
  // mesmo espírito de um feed de rede social (LinkedIn), só que com os
  // posts reais da campanha.
  const contentFeed: ContentFeedItem[] = data.campanhas
    .flatMap((c) =>
      c.influencers.flatMap((inf) =>
        inf.entregas
          .filter((e) => e.status === "publicado")
          .map((entrega) => ({ campanhaId: c.id, campanhaNome: c.nome, inf, entrega })),
      ),
    )
    .sort((a, b) => {
      const da = a.entrega.publicadoEm ?? a.entrega.dataPostagem ?? "";
      const db = b.entrega.publicadoEm ?? b.entrega.dataPostagem ?? "";
      return db.localeCompare(da);
    });

  const openInflu = (campanhaId: string, influId: string) => {
    setActiveCampanhaId(campanhaId);
    setViewingId(influId);
  };

  const respondInflu = viewing
    ? async (respStatus: "aprovado" | "reprovado", motivo?: string) => {
        await respondInfluFn({
          data: {
            token,
            campanhaId: activeCampanha!.id,
            influencerId: viewing.id,
            status: respStatus,
            motivo,
          },
        });
        load();
      }
    : undefined;

  const respondEntrega = viewing
    ? async (
        entregaId: string,
        kind: "roteiro" | "conteudo",
        respStatus: "aprovado" | "reprovado",
        motivo?: string,
      ) => {
        await respondEntregaFn({
          data: {
            token,
            campanhaId: activeCampanha!.id,
            influencerId: viewing.id,
            entregaId,
            kind,
            status: respStatus,
            motivo,
          },
        });
        load();
      }
    : undefined;

  const saveBriefing = viewing
    ? async (briefingPersonalizado: string) => {
        await updateBriefingFn({
          data: {
            token,
            campanhaId: activeCampanha!.id,
            influencerId: viewing.id,
            briefingPersonalizado,
          },
        });
        load();
      }
    : undefined;

  const saveObservacoes = viewing
    ? async (observacoes: string) => {
        await updateObservacoesFn({
          data: { token, campanhaId: activeCampanha!.id, influencerId: viewing.id, observacoes },
        });
        load();
      }
    : undefined;

  const saveBriefingAnexo = viewing
    ? async (file: { nome: string; dataUrl: string } | null) => {
        await updateBriefingAnexoFn({
          data: { token, campanhaId: activeCampanha!.id, influencerId: viewing.id, file },
        });
        load();
      }
    : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar ws={ws} lang={lang} onLangChange={setLang} />
      <PortalBugReportButton token={token} lang={lang} />
      <VersionWatcher scope="vc" />

      <div className="flex flex-1 flex-col md:flex-row">
        {/* SIDEBAR — cartão de perfil do cliente + cartão de navegação,
            igual à estrutura do LinkedIn (banner+avatar, depois uma lista
            de "páginas" com ícone + contador). */}
        <aside className="shrink-0 space-y-3 border-b border-border bg-muted/10 p-4 md:w-72 md:border-b-0 md:border-r">
          <div className="overflow-hidden rounded-xl border border-border bg-background">
            <div
              className="h-12"
              style={{
                background:
                  "linear-gradient(135deg, var(--chart-1), var(--chart-2), var(--chart-3))",
              }}
            />
            <div className="px-4 pb-4">
              <Avatar className="-mt-7 h-14 w-14 rounded-xl ring-4 ring-background">
                {data.clienteFoto && <AvatarImage src={data.clienteFoto} alt={data.clienteNome} />}
                <AvatarFallback className="rounded-xl text-base font-semibold">
                  {(data.clienteNome || "C").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="mt-2 truncate text-sm font-semibold text-foreground">
                {data.clienteNome}
              </p>
              <p className="text-xs text-muted-foreground">{t(lang, "portalSubtitle")}</p>

              <div className="mt-3 flex items-center gap-4 border-t border-border pt-3">
                <div>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {data.campanhas.length}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{t(lang, "statCampanhas")}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {totalInflus}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t(lang, "statInfluenciadores")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <nav className="overflow-hidden rounded-xl border border-border bg-background">
            <button
              type="button"
              onClick={() => {
                setActiveCampanhaId(null);
                setViewingId(null);
                setReadingArticleId(null);
              }}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
                activeCampanhaId === null && !readingArticleId ? "bg-muted" : "hover:bg-muted/60"
              }`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                <LayoutGrid className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {t(lang, "navInicio")}
              </span>
              {totalAguardando > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-amber-500/15 px-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  {totalAguardando}
                </span>
              )}
            </button>

            <p className="border-t border-border px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t(lang, "statCampanhas")}
            </p>
            {data.campanhas.map((c) => {
              const aguardandoAqui = c.influencers.filter((i) => pendingReason(i, lang)).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveCampanhaId(c.id);
                    setViewingId(null);
                    setReadingArticleId(null);
                  }}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
                    activeCampanhaId === c.id && !readingArticleId
                      ? "bg-muted"
                      : "hover:bg-muted/60"
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                    <Megaphone className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{c.nome}</span>
                  {aguardandoAqui > 0 && (
                    <span className="ml-auto inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-amber-500/15 px-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      {aguardandoAqui}
                    </span>
                  )}
                </button>
              );
            })}
            {data.campanhas.length === 0 && (
              <p className="px-3.5 py-2.5 text-xs text-muted-foreground">
                {t(lang, "navNoCampanhas")}
              </p>
            )}
          </nav>
        </aside>

        {/* CONTEÚDO PRINCIPAL */}
        <main className="min-w-0 flex-1 p-6">
          {readingArticleId ? (
            (() => {
              const reading = data.artigos.find((a) => a.id === readingArticleId) ?? null;
              if (!reading) return null;
              return (
                <div className="mx-auto max-w-4xl">
                  <ArticleReader
                    cover={reading.cover}
                    category={reading.category}
                    title={reading.title}
                    authorLabel={reading.authorName || "Sem autor"}
                    dateLabel={reading.publishDate ? fmtDate(reading.publishDate) : undefined}
                    contentHtml={renderMarkdownLite(reading.content ?? reading.excerpt ?? "")}
                    headerExtra={
                      <BackButton
                        onClick={() => setReadingArticleId(null)}
                        label={t(lang, "back")}
                        className="mb-4"
                      />
                    }
                    engagement={{
                      likeCount: readingEngagement?.likeCount ?? 0,
                      likedByMe: readingEngagement?.likedByMe ?? false,
                      comments: readingEngagement?.comments ?? [],
                      commentPlaceholder: t(lang, "articleCommentPlaceholder"),
                      onToggleLike: async () => {
                        setReadingEngagement((e) =>
                          e
                            ? {
                                ...e,
                                likedByMe: !e.likedByMe,
                                likeCount: e.likeCount + (e.likedByMe ? -1 : 1),
                              }
                            : e,
                        );
                        await toggleLikeFn({ data: { token, postId: reading.id } });
                      },
                      onAddComment: async (body) => {
                        await addComentarioFn({ data: { token, postId: reading.id, body } });
                        const next = await loadEngagementFn({
                          data: { token, postId: reading.id },
                        });
                        setReadingEngagement(next);
                      },
                    }}
                  />
                </div>
              );
            })()
          ) : activeCampanha ? (
            viewing ? (
              <InfluencerDetail
                inf={viewing}
                lang={lang}
                onBack={() => setViewingId(null)}
                onRespondInflu={respondInflu!}
                onRespondEntrega={respondEntrega!}
                onSaveBriefing={saveBriefing!}
                onSaveObservacoes={saveObservacoes!}
                onSaveBriefingAnexo={saveBriefingAnexo!}
              />
            ) : (
              <>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="text-xl font-semibold tracking-tight text-foreground">
                      {activeCampanha.nome}
                    </h1>
                    {activeCampanha.prazo && (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" /> {t(lang, "prazo")}{" "}
                        {fmtDate(activeCampanha.prazo)}
                      </p>
                    )}
                  </div>
                  <PortalDemandButton token={token} campanhaId={activeCampanha.id} lang={lang} />
                </div>

                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {activeCampanha.planejado > 0 && (
                    <KpiCard
                      label={t(lang, "planejado")}
                      value={activeCampanha.planejado.toString()}
                    />
                  )}
                  <KpiCard
                    label={t(lang, "statInfluenciadores")}
                    value={activeCampanha.influencers.length.toString()}
                  />
                  <KpiCard
                    label={t(lang, "aguardandoVoce")}
                    value={activeCampanha.influencers
                      .filter((i) => pendingReason(i, lang))
                      .length.toString()}
                    tone={
                      activeCampanha.influencers.some((i) => pendingReason(i, lang))
                        ? "warning"
                        : "default"
                    }
                  />
                  <KpiCard
                    label={t(lang, "postados")}
                    value={activeCampanha.influencers
                      .reduce(
                        (s, i) => s + i.entregas.filter((e) => e.status === "publicado").length,
                        0,
                      )
                      .toString()}
                  />
                </div>

                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Users className="h-4 w-4" /> {t(lang, "influenciadoresHeader")}
                  </h2>
                  {reprovados.length > 0 && (
                    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
                      <button
                        type="button"
                        onClick={() => setInfluTab("todos")}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          influTab === "todos"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t(lang, "abaTodos")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setInfluTab("reprovados")}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          influTab === "reprovados"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t(lang, "abaReprovados")}
                        <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                          {reprovados.length}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
                {(influTab === "reprovados" ? reprovados : ativos).length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
                    {influTab === "reprovados"
                      ? t(lang, "semReprovados")
                      : t(lang, "semInfluenciadores")}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {(influTab === "reprovados" ? reprovados : ativos).map((inf) => (
                      <InfluencerGalleryCard
                        key={inf.id}
                        inf={inf}
                        lang={lang}
                        onOpen={() => setViewingId(inf.id)}
                      />
                    ))}
                  </div>
                )}

                {activeCampanha.relatorioMetricas && (
                  <>
                    <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <BarChart3 className="h-4 w-4" /> {t(lang, "relatorioHeader")}
                    </h2>
                    <div className="rounded-xl border border-border bg-background p-4">
                      <p className="text-xs text-muted-foreground">
                        {t(lang, "relatorioGeradoEm")}{" "}
                        {new Date(activeCampanha.relatorioMetricas.geradoEm).toLocaleDateString(
                          lang === "en-US" ? "en-US" : lang === "es" ? "es-ES" : "pt-BR",
                        )}{" "}
                        · {activeCampanha.relatorioMetricas.totalPublicadas}{" "}
                        {t(lang, "relatorioPublicacoes")}
                      </p>

                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {(
                          [
                            { key: "views", label: t(lang, "views") },
                            { key: "reach", label: t(lang, "alcance") },
                            { key: "likes", label: t(lang, "curtidas") },
                            { key: "comments", label: t(lang, "comentarios") },
                            { key: "shares", label: t(lang, "compartilhamentos") },
                            { key: "saves", label: t(lang, "salvos") },
                          ] as const
                        ).map((m) => (
                          <div
                            key={m.key}
                            className="rounded-lg border border-border p-2.5 text-center"
                          >
                            <div className="text-base font-semibold text-foreground">
                              {(activeCampanha.relatorioMetricas!.totais[m.key] ?? 0) > 0
                                ? activeCampanha.relatorioMetricas!.totais[m.key]!.toLocaleString(
                                    "pt-BR",
                                  )
                                : "—"}
                            </div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {m.label}
                            </div>
                          </div>
                        ))}
                      </div>

                      {activeCampanha.relatorioMetricas.melhorConteudo && (
                        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                            🏆 {t(lang, "relatorioMelhorConteudo")}
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {activeCampanha.relatorioMetricas.melhorConteudo.influNome} —{" "}
                            {activeCampanha.relatorioMetricas.melhorConteudo.tipo}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {(
                              activeCampanha.relatorioMetricas.melhorConteudo.metrics.views ?? 0
                            ).toLocaleString("pt-BR")}{" "}
                            {t(lang, "views").toLowerCase()} ·{" "}
                            {(
                              activeCampanha.relatorioMetricas.melhorConteudo.metrics.likes ?? 0
                            ).toLocaleString("pt-BR")}{" "}
                            {t(lang, "curtidas").toLowerCase()}
                            {activeCampanha.relatorioMetricas.melhorConteudo.url && (
                              <>
                                {" · "}
                                <a
                                  href={activeCampanha.relatorioMetricas.melhorConteudo.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline underline-offset-2 hover:text-foreground"
                                >
                                  {t(lang, "relatorioVerPost")}
                                </a>
                              </>
                            )}
                          </p>
                        </div>
                      )}

                      <p className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t(lang, "relatorioPorInflu")}
                      </p>
                      <ul className="divide-y divide-border rounded-lg border border-border">
                        {activeCampanha.relatorioMetricas.porInflu.map((p) => (
                          <li key={p.influId} className="flex items-center gap-3 px-3 py-2.5">
                            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
                              {p.foto ? (
                                <img src={p.foto} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-muted-foreground">
                                  {p.nome.charAt(0).toUpperCase() || "?"}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {p.nome}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {p.publicadas} {t(lang, "relatorioPublicacoes")}
                              </p>
                            </div>
                            <div className="shrink-0 text-right text-xs text-muted-foreground">
                              <div className="font-semibold text-foreground">
                                {(p.totais.views ?? 0).toLocaleString("pt-BR")} {t(lang, "views")}
                              </div>
                              <div>
                                {(p.totais.likes ?? 0).toLocaleString("pt-BR")}{" "}
                                {t(lang, "curtidas")}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {activeCampanha.cronograma.length > 0 && (
                  <>
                    <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Calendar className="h-4 w-4" /> {t(lang, "cronogramaHeader")}
                    </h2>
                    <ul className="divide-y divide-border rounded-xl border border-border bg-background">
                      {activeCampanha.cronograma.map((item) => (
                        <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              {item.recurring
                                ? t(lang, "cronogramaMonthlyDay", {
                                    day: String(Number(item.date.slice(8, 10))),
                                  })
                                : fmtDate(item.date)}
                            </p>
                            <p className="text-sm text-foreground">{item.title}</p>
                            {item.description && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )
          ) : (
            <>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> {t(lang, "visaoGeral")}
              </div>
              <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">
                {t(lang, "ola", { name: data.clienteNome })}
              </h1>

              {/* Hub central de "Ações pendentes" — reúne tudo que precisa
                  de aprovação em QUALQUER campanha num lugar só, sem o
                  cliente precisar abrir campanha por campanha pra achar o
                  que falta revisar. */}
              {feed.length > 0 && (
                <section className="mb-6 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      {t(lang, "acoesPendentes")}
                    </h2>
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      {t(lang, "acoesPendentesCount", { n: feed.length })}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {feed.map((item) => (
                      <button
                        key={`${item.campanhaId}:${item.inf.id}`}
                        type="button"
                        onClick={() => openInflu(item.campanhaId, item.inf.id)}
                        className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:border-amber-500/50"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          {item.inf.foto && <AvatarImage src={item.inf.foto} alt={item.inf.nome} />}
                          <AvatarFallback className="text-xs font-semibold">
                            {initialsOf(item.inf.nome)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">
                            {item.inf.nome}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {item.campanhaNome} · {item.reason}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] font-semibold text-foreground underline underline-offset-2">
                          {t(lang, "revisar")}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Estrutura tipo LinkedIn: centro = feed do conteúdo mais
                  recente, direita = novidades pendentes + campanhas. */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 space-y-6">
                  <section className="space-y-3">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <PlayCircle className="h-4 w-4" /> {t(lang, "ultimosConteudos")}
                    </h2>
                    {contentFeed.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                        {t(lang, "semConteudo")}
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {contentFeed.slice(0, 12).map((item) => {
                          const conteudoAnexos = (item.entrega.anexos ?? []).filter(
                            (a) => a.categoria === "Conteúdo publicado",
                          );
                          const thumbUrl = conteudoAnexos.find((a) => isImageUrl(a.nome))?.url;
                          return (
                            <button
                              key={`${item.campanhaId}:${item.inf.id}:${item.entrega.id}`}
                              type="button"
                              onClick={() => openInflu(item.campanhaId, item.inf.id)}
                              className="group overflow-hidden rounded-xl border border-border bg-background text-left transition-colors hover:border-foreground/30"
                            >
                              <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted">
                                {thumbUrl ? (
                                  <img
                                    src={thumbUrl}
                                    alt={item.entrega.titulo ?? item.entrega.tipo}
                                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                  />
                                ) : (
                                  <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                                    <PlayCircle className="h-6 w-6" strokeWidth={1.5} />
                                    <span className="text-[11px]">{item.entrega.tipo}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 p-2.5">
                                <Avatar className="h-6 w-6 shrink-0">
                                  {item.inf.foto && (
                                    <AvatarImage src={item.inf.foto} alt={item.inf.nome} />
                                  )}
                                  <AvatarFallback className="text-[10px] font-semibold">
                                    {initialsOf(item.inf.nome)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium text-foreground">
                                    {item.inf.nome}
                                  </p>
                                  <p className="truncate text-[10px] text-muted-foreground">
                                    {item.campanhaNome}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {data.artigos.length > 0 && (
                    <section className="space-y-3">
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Newspaper className="h-4 w-4" /> {t(lang, "artigos")}
                      </h2>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {data.artigos.slice(0, 4).map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setReadingArticleId(a.id)}
                            className="flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-background p-2 text-left transition-colors hover:bg-muted/40"
                          >
                            {a.cover ? (
                              <img
                                src={a.cover}
                                alt=""
                                className="h-12 w-12 shrink-0 rounded-md object-cover"
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
                                <Newspaper className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1 space-y-0.5">
                              {a.category && (
                                <Badge variant="secondary" className="text-[9px]">
                                  {a.category}
                                </Badge>
                              )}
                              <p className="truncate text-xs font-semibold text-foreground">
                                {a.title}
                              </p>
                              {a.publishDate && (
                                <p className="text-[10px] text-muted-foreground">
                                  {fmtDate(a.publishDate)}
                                </p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                <aside className="space-y-3">
                  {/* Widget "Novidades" — título dentro da mesma caixa da
                      lista, igual o módulo de notícias do LinkedIn. */}
                  <section className="overflow-hidden rounded-xl border border-border bg-background">
                    <h2 className="flex items-center gap-2 border-b border-border px-3.5 py-3 text-sm font-semibold text-foreground">
                      <Clock className="h-4 w-4" /> {t(lang, "novidades")}
                    </h2>
                    {feed.length === 0 ? (
                      <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">
                        {t(lang, "tudoEmDia")}
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                        {feed.slice(0, 6).map((item) => (
                          <button
                            key={`${item.campanhaId}:${item.inf.id}`}
                            type="button"
                            onClick={() => openInflu(item.campanhaId, item.inf.id)}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
                          >
                            <Avatar className="h-8 w-8 shrink-0">
                              {item.inf.foto && (
                                <AvatarImage src={item.inf.foto} alt={item.inf.nome} />
                              )}
                              <AvatarFallback className="text-xs font-semibold">
                                {initialsOf(item.inf.nome)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-foreground">
                                {item.inf.nome}
                              </p>
                              <p className="truncate text-[11px] text-amber-700 dark:text-amber-400">
                                {item.reason}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="overflow-hidden rounded-xl border border-border bg-background">
                    <h2 className="flex items-center gap-2 border-b border-border px-3.5 py-3 text-sm font-semibold text-foreground">
                      <Megaphone className="h-4 w-4" /> {t(lang, "statCampanhas")}
                    </h2>
                    {data.campanhas.length === 0 ? (
                      <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">
                        {t(lang, "navNoCampanhas")}
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                        {data.campanhas.map((c) => {
                          const aguardandoAqui = c.influencers.filter((i) =>
                            pendingReason(i, lang),
                          ).length;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setActiveCampanhaId(c.id)}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-foreground">
                                  {c.nome}
                                </p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {t(lang, "influenciadoresCount", { n: c.influencers.length })}
                                  {aguardandoAqui > 0 && (
                                    <span className="text-amber-700 dark:text-amber-400">
                                      {" "}
                                      · {t(lang, "aguardandoVoceInline", { n: aguardandoAqui })}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </aside>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
