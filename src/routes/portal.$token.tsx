import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
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
  ArrowLeft,
  AtSign,
  BarChart3,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Facebook,
  FileText,
  Instagram,
  Linkedin,
  LayoutGrid,
  Megaphone,
  Newspaper,
  PlayCircle,
  Sparkles,
  Twitter,
  Users,
  XCircle,
  Youtube,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { renderMarkdownLite, MARKDOWN_LITE_CLASSES } from "@/components/marketing/BlogPanel";
import {
  getClienteLinkData,
  respondCampanhaInflu,
  respondCampanhaEntrega,
} from "@/lib/cliente-link.functions";
import { formatSeguidores } from "@/lib/format";
import { fetchWorkspace, type Workspace } from "@/lib/workspace-store";

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

export const Route = createFileRoute("/portal/$token")({
  ssr: false,
  component: ClientPortalPage,
  head: () => ({
    meta: [{ title: "Portal do cliente · Hype" }, { name: "robots", content: "noindex, nofollow" }],
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
  clienteReprovacao?: Veredito;
  redes: { id?: string; plataforma: string; handle: string; seguidores?: string }[];
  entregas: PublicEntrega[];
  profileMetrics?: { porRede?: Record<string, RedeMetrics> };
};
type PublicCampanha = {
  id: string;
  nome: string;
  prazo?: string;
  dataInicio?: string;
  planejado: number;
  influencers: PublicInfluencer[];
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
function pendingReason(inf: PublicInfluencer): string | null {
  if (inf.status === "Enviado para aprovação") return "Aguardando sua aprovação";
  const roteiro = inf.entregas.some((e) => e.conteudoStatus === "Aguardando aprovação de roteiro");
  if (roteiro) return "Roteiro aguardando aprovação";
  const conteudo = inf.entregas.some((e) => e.conteudoStatus === "Aprovação conteúdo");
  if (conteudo) return "Conteúdo aguardando aprovação";
  return null;
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function TopBar({ ws }: { ws: Workspace }) {
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

/** Aviso persistente de reprovação (do influ ou de uma entrega), até o
 * time reenviar e o cliente decidir de novo. */
function ReprovacaoBanner({ v }: { v: Veredito }) {
  return (
    <div className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
      <p className="font-medium">Você reprovou — aguardando reenvio do time</p>
      <p className="mt-0.5">{v.motivo}</p>
    </div>
  );
}

/** Barra de ação Aprovar/Reprovar reaproveitada nos 3 pontos de decisão
 * (seleção do influ, roteiro de uma entrega, conteúdo de uma entrega). */
function ApproveRejectBar({
  busy,
  rejecting,
  motivo,
  setRejecting,
  setMotivo,
  onApprove,
  onConfirmReject,
}: {
  busy: boolean;
  rejecting: boolean;
  motivo: string;
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
          placeholder="Motivo da reprovação (obrigatório)"
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
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={onConfirmReject}
            disabled={!motivo.trim() || busy}
          >
            Confirmar reprovação
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-1.5">
      <Button size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={onApprove} disabled={busy}>
        <CheckCircle2 className="h-3 w-3" />
        Aprovar
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2.5 text-xs"
        onClick={() => setRejecting(true)}
        disabled={busy}
      >
        <XCircle className="h-3 w-3" />
        Reprovar
      </Button>
    </div>
  );
}

/** Selo de estágio no fim de cada linha da lista — âmbar+ponto quando
 * precisa de ação do cliente agora, neutro (Badge outline) nos demais. */
function StatusBadge({ inf, className = "" }: { inf: PublicInfluencer; className?: string }) {
  const pending = pendingReason(inf);
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
      {inf.status}
    </Badge>
  );
}

/** Card de galeria — usado na lista de influenciadores de uma campanha
 * (foto grande em destaque, em vez da lista de linhas). */
function InfluencerGalleryCard({ inf, onOpen }: { inf: PublicInfluencer; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-background p-4 text-center transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md"
    >
      <Avatar className="h-16 w-16 shrink-0 ring-1 ring-border transition-all group-hover:ring-foreground/30">
        {inf.foto && <AvatarImage src={inf.foto} alt={inf.nome} />}
        <AvatarFallback className="text-base font-semibold">{initialsOf(inf.nome)}</AvatarFallback>
      </Avatar>
      <p className="truncate text-sm font-semibold text-foreground">{inf.nome}</p>
      {inf.nicho && (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
          {inf.nicho}
        </Badge>
      )}
      {inf.entregas.length > 0 && (
        <p className="truncate text-xs text-muted-foreground">{entregasSummary(inf.entregas)}</p>
      )}
      <StatusBadge inf={inf} className="px-2 py-0 text-[10px]" />
    </button>
  );
}

/** Painel de detalhe — substitui a lista dentro da mesma área principal
 * (com botão Voltar), em vez de abrir um modal por cima da página. */
function InfluencerDetail({
  inf,
  onBack,
  onRespondInflu,
  onRespondEntrega,
}: {
  inf: PublicInfluencer;
  onBack: () => void;
  onRespondInflu: (status: "aprovado" | "reprovado", motivo?: string) => Promise<void>;
  onRespondEntrega: (
    entregaId: string,
    kind: "roteiro" | "conteudo",
    status: "aprovado" | "reprovado",
    motivo?: string,
  ) => Promise<void>;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rejectingKey, setRejectingKey] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const entregasComMetrics = inf.entregas.filter((e) => hasEntregaMetrics(e.metrics));
  const redesComMetrics = inf.redes.filter((r) =>
    hasRedeMetrics(inf.profileMetrics?.porRede?.[r.id ?? r.plataforma]),
  );
  const semNadaAlem = entregasComMetrics.length === 0 && redesComMetrics.length === 0;
  const influPending = inf.status === "Enviado para aprovação";

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

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar pra lista
      </button>

      <div className="flex items-start gap-3.5 rounded-xl border border-border bg-background p-4">
        <Avatar className="h-14 w-14 shrink-0">
          {inf.foto && <AvatarImage src={inf.foto} alt={inf.nome} />}
          <AvatarFallback className="text-sm font-semibold">{initialsOf(inf.nome)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{inf.nome}</h2>
            {inf.nicho && <Badge variant="secondary">{inf.nicho}</Badge>}
            <StatusBadge inf={inf} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {inf.redes.length === 0 ? (
              <span className="text-xs text-muted-foreground">Sem redes cadastradas</span>
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
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-7">
        {influPending && (
          <section className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm font-semibold text-foreground">
              Aprovar {inf.nome} pra essa campanha?
            </p>
            <ApproveRejectBar
              busy={busyKey === "influ"}
              rejecting={rejectingKey === "influ"}
              motivo={motivo}
              setRejecting={(v) => {
                setRejectingKey(v ? "influ" : null);
                setMotivo("");
              }}
              setMotivo={setMotivo}
              onApprove={() => void runInflu("aprovado")}
              onConfirmReject={() => void runInflu("reprovado")}
            />
          </section>
        )}
        {!influPending && inf.clienteReprovacao && <ReprovacaoBanner v={inf.clienteReprovacao} />}

        {inf.entregas.length > 0 && (
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4" /> Entregas ({inf.entregas.length})
            </h3>
            <ul className="space-y-3">
              {inf.entregas.map((e) => {
                const roteiroPendente = e.conteudoStatus === "Aguardando aprovação de roteiro";
                const conteudoPendente = e.conteudoStatus === "Aprovação conteúdo";
                const roteiroAnexos = (e.anexos ?? []).filter((a) => a.categoria === "Roteiro");
                const conteudoAnexos = (e.anexos ?? []).filter(
                  (a) => a.categoria === "Conteúdo publicado",
                );
                return (
                  <li
                    key={e.id}
                    className="rounded-md border border-border bg-background px-3 py-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {e.quantidade && e.quantidade > 1 ? `${e.quantidade}× ` : ""}
                        {e.tipo}
                        {e.conteudoStatus && (
                          <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px]">
                            {e.conteudoStatus}
                          </Badge>
                        )}
                      </span>
                      {e.dataPostagem && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <CalendarDays className="h-3 w-3" /> {fmtDate(e.dataPostagem)}
                        </span>
                      )}
                    </div>

                    {roteiroPendente && (
                      <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
                        {roteiroAnexos.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {roteiroAnexos.map((a) => (
                              <a
                                key={a.id}
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2"
                              >
                                <FileText className="h-3 w-3" /> {a.nome}
                              </a>
                            ))}
                          </div>
                        )}
                        <ApproveRejectBar
                          busy={busyKey === `roteiro:${e.id}`}
                          rejecting={rejectingKey === `roteiro:${e.id}`}
                          motivo={motivo}
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
                      <div className="mt-2.5">
                        <ReprovacaoBanner v={e.roteiroReprovacao} />
                      </div>
                    )}

                    {conteudoPendente && (
                      <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
                        {conteudoAnexos.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {conteudoAnexos.map((a) => (
                              <a
                                key={a.id}
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2"
                              >
                                <FileText className="h-3 w-3" /> {a.nome}
                              </a>
                            ))}
                          </div>
                        )}
                        <ApproveRejectBar
                          busy={busyKey === `conteudo:${e.id}`}
                          rejecting={rejectingKey === `conteudo:${e.id}`}
                          motivo={motivo}
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
                      <div className="mt-2.5">
                        <ReprovacaoBanner v={e.conteudoReprovacao} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {redesComMetrics.length > 0 && (
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BarChart3 className="h-4 w-4" /> Métricas do perfil
            </h3>
            <div className="space-y-4">
              {redesComMetrics.map((r) => {
                const rm = inf.profileMetrics!.porRede![r.id ?? r.plataforma]!;
                return (
                  <div
                    key={r.id ?? r.plataforma}
                    className="space-y-4 rounded-xl border border-border bg-background p-4"
                  >
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <PlatformIcon plataforma={r.plataforma} className="h-3.5 w-3.5" />
                      {r.handle ? `@${r.handle}` : r.plataforma}
                    </p>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                      {r.seguidores ? (
                        <MetricStat label="Seguidores" value={formatSeguidores(r.seguidores)} />
                      ) : null}
                      {rm.interacoes ? (
                        <MetricStat
                          label="Interações"
                          value={rm.interacoes.toLocaleString("pt-BR")}
                        />
                      ) : null}
                      {rm.visualizacoes ? (
                        <MetricStat
                          label="Visualizações"
                          value={rm.visualizacoes.toLocaleString("pt-BR")}
                        />
                      ) : null}
                      {rm.taxaInteracao ? (
                        <MetricStat label="Taxa de interação" value={`${rm.taxaInteracao}%`} />
                      ) : null}
                      {rm.taxaAtencaoInicial ? (
                        <MetricStat label="Atenção inicial" value={`${rm.taxaAtencaoInicial}%`} />
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <DemographicChart title="Gênero" entries={rm.genero} chartType="pie" />
                      <DemographicChart title="Faixa etária" entries={rm.faixaEtaria} />
                      <DemographicChart title="Países" entries={rm.paises} />
                      <DemographicChart title="Cidades" entries={rm.cidades} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {entregasComMetrics.length > 0 && (
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4" /> Métricas das entregas
            </h3>
            <div className="space-y-3">
              {entregasComMetrics.map((e) => (
                <div key={e.id} className="rounded-xl border border-border bg-background p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {e.tipo}
                  </p>
                  <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                    {e.metrics?.views ? (
                      <MetricStat label="Views" value={e.metrics.views.toLocaleString("pt-BR")} />
                    ) : null}
                    {e.metrics?.reach ? (
                      <MetricStat label="Alcance" value={e.metrics.reach.toLocaleString("pt-BR")} />
                    ) : null}
                    {e.metrics?.likes ? (
                      <MetricStat
                        label="Curtidas"
                        value={e.metrics.likes.toLocaleString("pt-BR")}
                      />
                    ) : null}
                    {e.metrics?.comments ? (
                      <MetricStat
                        label="Coment."
                        value={e.metrics.comments.toLocaleString("pt-BR")}
                      />
                    ) : null}
                    {e.metrics?.shares ? (
                      <MetricStat
                        label="Compart."
                        value={e.metrics.shares.toLocaleString("pt-BR")}
                      />
                    ) : null}
                    {e.metrics?.saves ? (
                      <MetricStat label="Salvos" value={e.metrics.saves.toLocaleString("pt-BR")} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {semNadaAlem && !influPending && (
          <p className="text-sm text-muted-foreground">Nenhuma métrica cadastrada ainda.</p>
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
  const getDataFn = useServerFn(getClienteLinkData);
  const respondInfluFn = useServerFn(respondCampanhaInflu);
  const respondEntregaFn = useServerFn(respondCampanhaEntrega);
  const [data, setData] = useState<ClienteLinkData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");
  const [activeCampanhaId, setActiveCampanhaId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [showArtigos, setShowArtigos] = useState(false);
  const [readingArticleId, setReadingArticleId] = useState<string | null>(null);
  const [ws, setWs] = useState<Workspace>({ nome: "Você no Hype", logo: "" });

  useEffect(() => {
    void fetchWorkspace().then(setWs);
  }, []);

  const load = () => {
    getDataFn({ data: { token } })
      .then((row) => {
        setData(row as ClienteLinkData);
        setStatus("ready");
        document.title = `${(row as ClienteLinkData).clienteNome || "Portal"} · Hype`;
      })
      .catch(() => setStatus("notfound"));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <TopBar ws={ws} />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (status === "notfound" || !data) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <TopBar ws={ws} />
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <h1 className="text-lg font-semibold text-foreground">Link não encontrado</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Esse link não existe mais ou é inválido.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeCampanha = data.campanhas.find((c) => c.id === activeCampanhaId) ?? null;
  const viewing = activeCampanha?.influencers.find((i) => i.id === viewingId) ?? null;

  const allInfluencers = data.campanhas.flatMap((c) => c.influencers);
  const totalInflus = allInfluencers.length;
  const totalAguardando = allInfluencers.filter((i) => pendingReason(i)).length;

  const feed: PendingFeedItem[] = data.campanhas.flatMap((c) =>
    c.influencers
      .map((inf) => {
        const reason = pendingReason(inf);
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar ws={ws} />

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
              <p className="text-xs text-muted-foreground">Portal do cliente</p>

              <div className="mt-3 flex items-center gap-4 border-t border-border pt-3">
                <div>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {data.campanhas.length}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Campanhas</p>
                </div>
                <div>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {totalInflus}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Influenciadores</p>
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
                setShowArtigos(false);
                setReadingArticleId(null);
              }}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
                activeCampanhaId === null && !showArtigos ? "bg-muted" : "hover:bg-muted/60"
              }`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                <LayoutGrid className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">Início</span>
              {totalAguardando > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-amber-500/15 px-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  {totalAguardando}
                </span>
              )}
            </button>

            {data.artigos.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveCampanhaId(null);
                  setViewingId(null);
                  setShowArtigos(true);
                  setReadingArticleId(null);
                }}
                className={`flex w-full items-center gap-2.5 border-t border-border px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
                  showArtigos ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                  <Newspaper className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">Artigos</span>
              </button>
            )}

            <p className="border-t border-border px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Campanhas
            </p>
            {data.campanhas.map((c) => {
              const aguardandoAqui = c.influencers.filter((i) => pendingReason(i)).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveCampanhaId(c.id);
                    setViewingId(null);
                    setShowArtigos(false);
                    setReadingArticleId(null);
                  }}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
                    activeCampanhaId === c.id && !showArtigos ? "bg-muted" : "hover:bg-muted/60"
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
              <p className="px-3.5 py-2.5 text-xs text-muted-foreground">Nenhuma campanha ainda.</p>
            )}
          </nav>
        </aside>

        {/* CONTEÚDO PRINCIPAL */}
        <main className="min-w-0 flex-1 p-6">
          {showArtigos ? (
            (() => {
              const reading = data.artigos.find((a) => a.id === readingArticleId) ?? null;
              if (reading) {
                return (
                  <div>
                    <button
                      type="button"
                      onClick={() => setReadingArticleId(null)}
                      className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Voltar pra artigos
                    </button>
                    <article className="mx-auto max-w-2xl">
                      {reading.cover && (
                        <img
                          src={reading.cover}
                          alt=""
                          className="mb-4 aspect-video w-full rounded-xl object-cover"
                        />
                      )}
                      {reading.category && (
                        <Badge variant="secondary" className="mb-2">
                          {reading.category}
                        </Badge>
                      )}
                      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        {reading.title}
                      </h1>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {reading.authorName && <span>{reading.authorName}</span>}
                        {reading.authorName && reading.publishDate && <span>·</span>}
                        {reading.publishDate && <span>{fmtDate(reading.publishDate)}</span>}
                      </div>
                      <div
                        className={`mt-6 ${MARKDOWN_LITE_CLASSES}`}
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdownLite(reading.content ?? reading.excerpt ?? ""),
                        }}
                      />
                    </article>
                  </div>
                );
              }
              return (
                <div className="mx-auto max-w-3xl">
                  <h1 className="mb-5 flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
                    <Newspaper className="h-5 w-5" /> Artigos
                  </h1>
                  {data.artigos.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
                      Nenhum artigo publicado ainda.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {data.artigos.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setReadingArticleId(a.id)}
                          className="flex flex-col overflow-hidden rounded-xl border border-border bg-background text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                        >
                          {a.cover ? (
                            <img
                              src={a.cover}
                              alt=""
                              className="aspect-video w-full object-cover"
                            />
                          ) : (
                            <div className="flex aspect-video w-full items-center justify-center bg-muted">
                              <Newspaper className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 space-y-1.5 p-4">
                            {a.category && (
                              <Badge variant="secondary" className="text-[10px]">
                                {a.category}
                              </Badge>
                            )}
                            <p className="text-sm font-semibold text-foreground">{a.title}</p>
                            {a.excerpt && (
                              <p className="line-clamp-2 text-xs text-muted-foreground">
                                {a.excerpt}
                              </p>
                            )}
                            {a.publishDate && (
                              <p className="pt-1 text-[11px] text-muted-foreground">
                                {fmtDate(a.publishDate)}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()
          ) : activeCampanha ? (
            viewing ? (
              <InfluencerDetail
                inf={viewing}
                onBack={() => setViewingId(null)}
                onRespondInflu={respondInflu!}
                onRespondEntrega={respondEntrega!}
              />
            ) : (
              <>
                <div className="mb-5">
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">
                    {activeCampanha.nome}
                  </h1>
                  {activeCampanha.prazo && (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" /> Prazo {fmtDate(activeCampanha.prazo)}
                    </p>
                  )}
                </div>

                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {activeCampanha.planejado > 0 && (
                    <KpiCard label="Planejado" value={activeCampanha.planejado.toString()} />
                  )}
                  <KpiCard
                    label="Influenciadores"
                    value={activeCampanha.influencers.length.toString()}
                  />
                  <KpiCard
                    label="Aguardando você"
                    value={activeCampanha.influencers
                      .filter((i) => pendingReason(i))
                      .length.toString()}
                    tone={
                      activeCampanha.influencers.some((i) => pendingReason(i))
                        ? "warning"
                        : "default"
                    }
                  />
                  <KpiCard
                    label="Postados"
                    value={activeCampanha.influencers
                      .reduce(
                        (s, i) => s + i.entregas.filter((e) => e.status === "publicado").length,
                        0,
                      )
                      .toString()}
                  />
                </div>

                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="h-4 w-4" /> Influenciadores
                </h2>
                {activeCampanha.influencers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
                    Nenhum influenciador enviado pra aprovação ainda.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {activeCampanha.influencers.map((inf) => (
                      <InfluencerGalleryCard
                        key={inf.id}
                        inf={inf}
                        onOpen={() => setViewingId(inf.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )
          ) : (
            <>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> Visão geral
              </div>
              <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">
                Olá, {data.clienteNome}
              </h1>

              {/* Estrutura tipo LinkedIn: centro = feed do conteúdo mais
                  recente, direita = novidades pendentes + campanhas. */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <section className="min-w-0 space-y-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <PlayCircle className="h-4 w-4" /> Últimos conteúdos
                  </h2>
                  {contentFeed.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                      Nenhum conteúdo publicado ainda.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {contentFeed.slice(0, 12).map((item) => {
                        // O link do post pode vir do campo "url" (texto
                        // manual) OU de um anexo categoria "Conteúdo
                        // publicado" (upload feito na entrega) — antes só o
                        // primeiro era considerado, e o conteúdo anexado
                        // sumia do feed do portal.
                        const conteudoAnexos = (item.entrega.anexos ?? []).filter(
                          (a) => a.categoria === "Conteúdo publicado",
                        );
                        const links = item.entrega.url
                          ? [{ id: "url", nome: "Ver publicação", url: item.entrega.url }]
                          : conteudoAnexos.map((a) => ({ id: a.id, nome: a.nome, url: a.url }));
                        return (
                          <div
                            key={`${item.campanhaId}:${item.inf.id}:${item.entrega.id}`}
                            className="rounded-xl border border-border bg-background p-4"
                          >
                            <button
                              type="button"
                              onClick={() => openInflu(item.campanhaId, item.inf.id)}
                              className="flex w-full items-center gap-3 text-left"
                            >
                              <Avatar className="h-10 w-10 shrink-0">
                                {item.inf.foto && (
                                  <AvatarImage src={item.inf.foto} alt={item.inf.nome} />
                                )}
                                <AvatarFallback className="text-sm font-semibold">
                                  {initialsOf(item.inf.nome)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {item.inf.nome}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {item.campanhaNome}
                                  {item.entrega.publicadoEm
                                    ? ` · ${fmtDate(item.entrega.publicadoEm)}`
                                    : item.entrega.dataPostagem
                                      ? ` · ${fmtDate(item.entrega.dataPostagem)}`
                                      : ""}
                                </p>
                              </div>
                              <Badge variant="secondary" className="shrink-0 text-[10px]">
                                {item.entrega.tipo}
                              </Badge>
                            </button>

                            {(item.entrega.metrics || links.length > 0) && (
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                                <div className="flex flex-wrap gap-4">
                                  {item.entrega.metrics?.views ? (
                                    <MetricStat
                                      label="Views"
                                      value={item.entrega.metrics.views.toLocaleString("pt-BR")}
                                    />
                                  ) : null}
                                  {item.entrega.metrics?.likes ? (
                                    <MetricStat
                                      label="Curtidas"
                                      value={item.entrega.metrics.likes.toLocaleString("pt-BR")}
                                    />
                                  ) : null}
                                  {item.entrega.metrics?.reach ? (
                                    <MetricStat
                                      label="Alcance"
                                      value={item.entrega.metrics.reach.toLocaleString("pt-BR")}
                                    />
                                  ) : null}
                                </div>
                                {links.length > 0 && (
                                  <div className="flex flex-wrap gap-3">
                                    {links.map((link) => (
                                      <a
                                        key={link.id}
                                        href={link.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2"
                                      >
                                        <ExternalLink className="h-3 w-3" /> {link.nome}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <aside className="space-y-3">
                  {/* Widget "Novidades" — título dentro da mesma caixa da
                      lista, igual o módulo de notícias do LinkedIn. */}
                  <section className="overflow-hidden rounded-xl border border-border bg-background">
                    <h2 className="flex items-center gap-2 border-b border-border px-3.5 py-3 text-sm font-semibold text-foreground">
                      <Clock className="h-4 w-4" /> Novidades
                    </h2>
                    {feed.length === 0 ? (
                      <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">
                        Tudo em dia por aqui.
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
                      <Megaphone className="h-4 w-4" /> Campanhas
                    </h2>
                    {data.campanhas.length === 0 ? (
                      <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">
                        Nenhuma campanha ainda.
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                        {data.campanhas.map((c) => {
                          const aguardandoAqui = c.influencers.filter((i) =>
                            pendingReason(i),
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
                                  {c.influencers.length} influenciadores
                                  {aguardandoAqui > 0 && (
                                    <span className="text-amber-700 dark:text-amber-400">
                                      {" "}
                                      · {aguardandoAqui} aguardando você
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
