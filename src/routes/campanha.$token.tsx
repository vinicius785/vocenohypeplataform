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
  AtSign,
  Calendar,
  CalendarDays,
  Check,
  Facebook,
  FileText,
  Instagram,
  Linkedin,
  Sparkles,
  Twitter,
  User,
  X,
  Youtube,
} from "lucide-react";
import {
  getCampanhaLinkData,
  respondCampanhaInflu,
  respondCampanhaEntrega,
} from "@/lib/campanha-link.functions";
import { formatSeguidores } from "@/lib/format";
import { fetchWorkspace, type Workspace } from "@/lib/workspace-store";

/**
 * Página pública de campanha (`/campanha/$token`) — microsite de marca
 * própria pro cliente ver e aprovar, deliberadamente NÃO usa o tema
 * claro/escuro do resto do app (essa é uma persona visual fixa e
 * cuidada, tipo um "relatório de campanha" premium, não uma tela interna).
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

export const Route = createFileRoute("/campanha/$token")({
  ssr: false,
  component: CampanhaPublicPage,
  head: () => ({
    meta: [{ title: "Campanha · Hype" }, { name: "robots", content: "noindex, nofollow" }],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
});

/* ============================================================
 * Design system local desta página — paleta quente/editorial,
 * escopada via classe `.cp-root`, independente do tema do app.
 * ============================================================ */
const PAGE_STYLES = `
.cp-root {
  --cp-bg: #120f0c;
  --cp-surface: #1c1712;
  --cp-surface-2: #241e15;
  --cp-border: rgba(232, 213, 183, 0.12);
  --cp-border-strong: rgba(232, 213, 183, 0.24);
  --cp-text: #f4ead9;
  --cp-text-dim: #b6a68d;
  --cp-text-faint: #7d6f5a;
  --cp-accent: #e2b657;
  --cp-accent-ink: #241a06;
  --cp-accent-soft: rgba(226, 182, 87, 0.14);
  --cp-success: #93ad74;
  --cp-success-soft: rgba(147, 173, 116, 0.14);
  --cp-danger: #d97a5a;
  --cp-danger-soft: rgba(217, 122, 90, 0.14);
  --cp-font-display: "Fraunces", "Iowan Old Style", serif;
  --cp-font-body: "Manrope", -apple-system, sans-serif;
  background: var(--cp-bg);
  color: var(--cp-text);
  font-family: var(--cp-font-body);
  min-height: 100vh;
  position: relative;
}
.cp-root::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.5;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E");
  z-index: 0;
}
.cp-serif { font-family: var(--cp-font-display); }
@keyframes cp-fade-up {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes cp-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes cp-scale-in {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.cp-anim-up { animation: cp-fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
.cp-anim-in { animation: cp-fade-in 0.5s ease backwards; }
.cp-anim-scale { animation: cp-scale-in 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
.cp-card {
  background: var(--cp-surface);
  border: 1px solid var(--cp-border);
}
.cp-card:hover { border-color: var(--cp-border-strong); }
.cp-scrollbar::-webkit-scrollbar { width: 8px; }
.cp-scrollbar::-webkit-scrollbar-thumb { background: var(--cp-border-strong); border-radius: 8px; }
.cp-btn-accent {
  background: var(--cp-accent);
  color: var(--cp-accent-ink);
}
.cp-btn-accent:hover { filter: brightness(1.08); }
.cp-btn-accent:disabled { opacity: 0.45; }
`;

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
type CampanhaLinkData = {
  campanhaNome: string;
  clienteNome: string;
  clienteFoto?: string;
  prazo?: string;
  dataInicio?: string;
  planejado: number;
  influencers: PublicInfluencer[];
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

function TopBar({ ws }: { ws: Workspace }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[color:var(--cp-border)] bg-[color:var(--cp-bg)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2.5 px-5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[color:var(--cp-accent)] text-[color:var(--cp-accent-ink)]">
          {ws.logo ? (
            <img src={ws.logo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[11px] font-bold">{ws.nome.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cp-text-dim)]">
          {ws.nome}
        </span>
      </div>
    </header>
  );
}

function Kpi({
  label,
  value,
  tone = "default",
  delay = 0,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
  delay?: number;
}) {
  const toneColor = {
    default: "var(--cp-text)",
    success: "var(--cp-success)",
    warning: "var(--cp-accent)",
  }[tone];
  return (
    <div
      className="cp-card cp-anim-up min-w-0 rounded-2xl px-5 py-4"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cp-text-faint)]">
        {label}
      </p>
      <p
        className="cp-serif mt-1.5 truncate text-3xl font-semibold tabular-nums"
        style={{ color: toneColor }}
      >
        {value}
      </p>
    </div>
  );
}

function MetricStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--cp-text-faint)]">
        {label}
      </p>
      <p className="cp-serif mt-0.5 text-base font-semibold tabular-nums text-[color:var(--cp-text)]">
        {value}
      </p>
    </div>
  );
}

const PIE_COLORS = ["#e2b657", "#c97a4a", "#93ad74", "#b3697a", "#6f9a94"];

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
      fill="var(--cp-text-dim)"
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
              labelLine={{ stroke: "var(--cp-text-dim)", strokeWidth: 1 }}
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
              wrapperStyle={{ fontSize: 10, color: "var(--cp-text-dim)" }}
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
          <CartesianGrid horizontal={false} stroke="var(--cp-border)" />
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category"
            dataKey="name"
            width={90}
            tick={{ fontSize: 10, fill: "var(--cp-text-dim)" }}
            axisLine={false}
            tickLine={false}
          />
          <Bar
            dataKey="valor"
            fill="var(--cp-accent)"
            radius={3}
            barSize={12}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="valor"
              position="right"
              formatter={(v: number) => `${v}%`}
              style={{ fontSize: 10, fill: "var(--cp-text-dim)" }}
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
    <div
      className="rounded-xl p-3"
      style={{ background: "var(--cp-surface-2)", border: "1px solid var(--cp-border)" }}
    >
      <p className="text-xs font-semibold text-[color:var(--cp-text)]">{title}</p>
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
    <div
      className="rounded-lg px-3.5 py-2.5 text-xs"
      style={{ background: "var(--cp-danger-soft)", color: "var(--cp-danger)" }}
    >
      <p className="font-semibold">Você reprovou — aguardando reenvio do time</p>
      <p className="mt-0.5 opacity-90">{v.motivo}</p>
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
      <div className="space-y-2">
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo da reprovação (obrigatório)"
          autoFocus
          className="h-20 w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--cp-surface-2)",
            border: "1px solid var(--cp-border-strong)",
            color: "var(--cp-text)",
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setRejecting(false);
              setMotivo("");
            }}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold"
            style={{ border: "1px solid var(--cp-border-strong)", color: "var(--cp-text-dim)" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmReject}
            disabled={!motivo.trim() || busy}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--cp-danger)" }}
          >
            Confirmar reprovação
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onApprove}
        disabled={busy}
        className="cp-btn-accent inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold"
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
        Aprovar
      </button>
      <button
        type="button"
        onClick={() => setRejecting(true)}
        disabled={busy}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
        style={{ border: "1px solid var(--cp-border-strong)", color: "var(--cp-text-dim)" }}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        Reprovar
      </button>
    </div>
  );
}

function InfluencerProfileDialog({
  inf,
  onClose,
  onRespondInflu,
  onRespondEntrega,
}: {
  inf: PublicInfluencer;
  onClose: () => void;
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
  // `profileMetrics.porRede` é indexado pelo id da rede (não pela plataforma
  // — duas redes podem ser a mesma plataforma, ex: 2 contas de Instagram).
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
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(6, 4, 2, 0.72)" }}
      onClick={onClose}
    >
      <div
        className="cp-anim-scale cp-scrollbar flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl"
        style={{
          background: "var(--cp-surface)",
          border: "1px solid var(--cp-border-strong)",
          boxShadow: "0 40px 80px -20px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between gap-4 px-7 py-6"
          style={{ background: "var(--cp-surface-2)", borderBottom: "1px solid var(--cp-border)" }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full"
              style={{ border: "2px solid var(--cp-accent)" }}
            >
              {inf.foto ? (
                <img src={inf.foto} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="h-6 w-6 text-[color:var(--cp-text-faint)]" strokeWidth={1.5} />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="cp-serif text-xl font-semibold text-[color:var(--cp-text)]">
                  {inf.nome}
                </h3>
                {inf.nicho && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                    style={{ background: "var(--cp-surface)", color: "var(--cp-text-dim)" }}
                  >
                    {inf.nicho}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {inf.redes.length === 0 ? (
                  <span className="text-xs text-[color:var(--cp-text-faint)]">
                    Sem redes cadastradas
                  </span>
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
                    return (
                      <a
                        key={i}
                        href={url}
                        target={url ? "_blank" : undefined}
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                        style={{
                          background: "var(--cp-surface)",
                          color: "var(--cp-text)",
                          pointerEvents: url ? "auto" : "none",
                        }}
                      >
                        {content}
                      </a>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-[color:var(--cp-text-faint)] hover:text-[color:var(--cp-text)]"
            style={{ background: "var(--cp-surface)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="cp-scrollbar min-h-0 flex-1 space-y-7 overflow-y-auto px-7 py-6">
          {influPending && (
            <section
              className="space-y-3 rounded-xl p-4"
              style={{ background: "var(--cp-accent-soft)", border: "1px solid var(--cp-accent)" }}
            >
              <p className="text-sm font-semibold text-[color:var(--cp-text)]">
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
              <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--cp-text-faint)]">
                Entregas ({inf.entregas.length})
              </h4>
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
                      className="rounded-xl px-4 py-3 text-xs"
                      style={{ background: "var(--cp-surface-2)" }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[color:var(--cp-text)]">
                          {e.quantidade && e.quantidade > 1 ? `${e.quantidade}× ` : ""}
                          {e.tipo}
                          {e.conteudoStatus && (
                            <span
                              className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{
                                background: "var(--cp-surface)",
                                color: "var(--cp-text-dim)",
                              }}
                            >
                              {e.conteudoStatus}
                            </span>
                          )}
                        </span>
                        {e.dataPostagem && (
                          <span className="inline-flex items-center gap-1 text-[color:var(--cp-text-faint)]">
                            <CalendarDays className="h-3 w-3" /> {fmtDate(e.dataPostagem)}
                          </span>
                        )}
                      </div>

                      {roteiroPendente && (
                        <div
                          className="mt-3 space-y-2 pt-3"
                          style={{ borderTop: "1px solid var(--cp-border)" }}
                        >
                          {roteiroAnexos.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {roteiroAnexos.map((a) => (
                                <a
                                  key={a.id}
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 font-semibold text-[color:var(--cp-accent)] underline underline-offset-2"
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
                        <div className="mt-3">
                          <ReprovacaoBanner v={e.roteiroReprovacao} />
                        </div>
                      )}

                      {conteudoPendente && (
                        <div
                          className="mt-3 space-y-2 pt-3"
                          style={{ borderTop: "1px solid var(--cp-border)" }}
                        >
                          {conteudoAnexos.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {conteudoAnexos.map((a) => (
                                <a
                                  key={a.id}
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 font-semibold text-[color:var(--cp-accent)] underline underline-offset-2"
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
                        <div className="mt-3">
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
              <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--cp-text-faint)]">
                Métricas do perfil
              </h4>
              <div className="space-y-4">
                {redesComMetrics.map((r) => {
                  const rm = inf.profileMetrics!.porRede![r.id ?? r.plataforma]!;
                  return (
                    <div
                      key={r.id ?? r.plataforma}
                      className="space-y-4 rounded-xl p-4"
                      style={{
                        background: "var(--cp-surface-2)",
                        border: "1px solid var(--cp-border)",
                      }}
                    >
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--cp-text-dim)]">
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
              <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--cp-text-faint)]">
                Métricas das entregas
              </h4>
              <div className="space-y-3">
                {entregasComMetrics.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-xl p-4"
                    style={{
                      background: "var(--cp-surface-2)",
                      border: "1px solid var(--cp-border)",
                    }}
                  >
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--cp-text-dim)]">
                      {e.tipo}
                    </p>
                    <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                      {e.metrics?.views ? (
                        <MetricStat label="Views" value={e.metrics.views.toLocaleString("pt-BR")} />
                      ) : null}
                      {e.metrics?.reach ? (
                        <MetricStat
                          label="Alcance"
                          value={e.metrics.reach.toLocaleString("pt-BR")}
                        />
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
                        <MetricStat
                          label="Salvos"
                          value={e.metrics.saves.toLocaleString("pt-BR")}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {semNadaAlem && !influPending && (
            <p className="text-sm text-[color:var(--cp-text-faint)]">
              Nenhuma métrica cadastrada ainda.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CampanhaPublicPage() {
  const { token } = Route.useParams();
  const getDataFn = useServerFn(getCampanhaLinkData);
  const respondInfluFn = useServerFn(respondCampanhaInflu);
  const respondEntregaFn = useServerFn(respondCampanhaEntrega);
  const [data, setData] = useState<CampanhaLinkData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [ws, setWs] = useState<Workspace>({ nome: "Você no Hype", logo: "" });

  useEffect(() => {
    void fetchWorkspace().then(setWs);
  }, []);

  const load = () => {
    getDataFn({ data: { token } })
      .then((row) => {
        setData(row as CampanhaLinkData);
        setStatus("ready");
        document.title = `${(row as CampanhaLinkData).campanhaNome || "Campanha"} · Hype`;
      })
      .catch(() => setStatus("notfound"));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const viewing = data?.influencers.find((i) => i.id === viewingId) ?? null;

  if (status === "loading") {
    return (
      <div className="cp-root">
        <style>{PAGE_STYLES}</style>
        <TopBar ws={ws} />
        <div className="flex min-h-screen items-center justify-center p-6 pt-14">
          <p className="cp-anim-in text-sm text-[color:var(--cp-text-dim)]">Carregando...</p>
        </div>
      </div>
    );
  }

  if (status === "notfound" || !data) {
    return (
      <div className="cp-root">
        <style>{PAGE_STYLES}</style>
        <TopBar ws={ws} />
        <div className="flex min-h-screen items-center justify-center p-6 pt-14">
          <div className="cp-anim-up max-w-sm text-center">
            <h1 className="cp-serif text-xl font-semibold text-[color:var(--cp-text)]">
              Link não encontrado
            </h1>
            <p className="mt-2 text-sm text-[color:var(--cp-text-dim)]">
              Esse link de campanha não existe mais ou é inválido.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const total = data.influencers.length;
  const aguardando = data.influencers.filter((i) => pendingReason(i)).length;
  const aprovados = data.influencers.filter(
    (i) => i.status !== "Lista" && i.status !== "Enviado para aprovação",
  ).length;
  const postados = data.influencers.reduce(
    (sum, i) => sum + i.entregas.filter((e) => e.status === "publicado").length,
    0,
  );

  return (
    <div className="cp-root">
      <style>{PAGE_STYLES}</style>
      <TopBar ws={ws} />

      {/* HERO */}
      <div className="relative z-[1] overflow-hidden pt-14">
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full opacity-[0.18] blur-[100px]"
          style={{ background: "var(--cp-accent)" }}
        />
        <div className="relative mx-auto max-w-5xl px-5 pb-12 pt-16 sm:pb-16 sm:pt-20">
          <div className="cp-anim-up flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--cp-accent)]">
            <Sparkles className="h-3 w-3" />
            Campanha de influenciadores
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-6">
            <div
              className="cp-anim-up flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl"
              style={{
                animationDelay: "80ms",
                background: "var(--cp-surface)",
                border: "1px solid var(--cp-border-strong)",
                boxShadow: "0 20px 40px -12px rgba(0,0,0,0.5)",
              }}
            >
              {data.clienteFoto ? (
                <img src={data.clienteFoto} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="cp-serif text-3xl font-semibold text-[color:var(--cp-accent)]">
                  {(data.clienteNome || "C").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p
                className="cp-anim-up text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--cp-text-dim)]"
                style={{ animationDelay: "120ms" }}
              >
                {data.clienteNome || "Campanha"}
              </p>
              <h1
                className="cp-serif cp-anim-up mt-1 text-4xl font-semibold leading-[1.05] tracking-tight text-[color:var(--cp-text)] sm:text-5xl"
                style={{ animationDelay: "160ms" }}
              >
                {data.campanhaNome || "Influenciadores"}
              </h1>
              {data.prazo && (
                <p
                  className="cp-anim-up mt-3 inline-flex items-center gap-1.5 text-xs text-[color:var(--cp-text-faint)]"
                  style={{ animationDelay: "200ms" }}
                >
                  <Calendar className="h-3.5 w-3.5" /> Prazo {fmtDate(data.prazo)}
                </p>
              )}
            </div>
          </div>
          <p
            className="cp-anim-up mt-6 max-w-lg text-sm leading-relaxed text-[color:var(--cp-text-dim)]"
            style={{ animationDelay: "240ms" }}
          >
            Acompanhe cada etapa da campanha e aprove diretamente aqui — seleção de influenciadores,
            roteiro e conteúdo final.
          </p>
        </div>
      </div>

      <div className="relative z-[1] mx-auto max-w-5xl space-y-12 px-5 pb-20">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.planejado > 0 && (
            <Kpi label="Planejado" value={data.planejado.toString()} delay={0} />
          )}
          <Kpi label="Influenciadores" value={total.toString()} delay={40} />
          <Kpi
            label="Aguardando você"
            value={aguardando.toString()}
            tone={aguardando > 0 ? "warning" : "default"}
            delay={80}
          />
          <Kpi label="Aprovados" value={aprovados.toString()} tone="success" delay={120} />
          <Kpi label="Postados" value={postados.toString()} delay={160} />
        </div>

        {/* INFLUENCIADORES */}
        <section className="space-y-5">
          <div className="cp-anim-up flex items-center gap-3" style={{ animationDelay: "80ms" }}>
            <h2 className="cp-serif text-lg font-semibold text-[color:var(--cp-text)]">
              Influenciadores
            </h2>
            <div className="h-px flex-1" style={{ background: "var(--cp-border)" }} />
          </div>

          {data.influencers.length === 0 && (
            <p
              className="cp-anim-up rounded-2xl py-12 text-center text-sm text-[color:var(--cp-text-faint)]"
              style={{ border: "1px dashed var(--cp-border-strong)" }}
            >
              Nenhum influenciador enviado pra aprovação ainda.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.influencers.map((inf, i) => {
              const pending = pendingReason(inf);
              return (
                <div
                  key={inf.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewingId(inf.id)}
                  onKeyDown={(e) => e.key === "Enter" && setViewingId(inf.id)}
                  className="cp-card cp-anim-up group flex cursor-pointer flex-col items-center gap-3 rounded-2xl p-6 text-center transition-all duration-300 hover:-translate-y-1"
                  style={{
                    animationDelay: `${Math.min(i, 8) * 55}ms`,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = "0 24px 48px -16px rgba(0,0,0,0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.3)";
                  }}
                >
                  <div
                    className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full transition-all"
                    style={{ border: "2px solid var(--cp-border-strong)" }}
                  >
                    {inf.foto ? (
                      <img src={inf.foto} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <User
                        className="h-10 w-10 text-[color:var(--cp-text-faint)]"
                        strokeWidth={1.5}
                      />
                    )}
                  </div>
                  <p className="cp-serif text-lg font-semibold text-[color:var(--cp-text)]">
                    {inf.nome}
                  </p>
                  {inf.nicho && (
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                      style={{ background: "var(--cp-surface-2)", color: "var(--cp-text-dim)" }}
                    >
                      {inf.nicho}
                    </span>
                  )}
                  {inf.entregas.length > 0 && (
                    <p className="text-xs text-[color:var(--cp-text-faint)]">
                      {entregasSummary(inf.entregas)}
                    </p>
                  )}
                  {pending ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ background: "var(--cp-accent-soft)", color: "var(--cp-accent)" }}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--cp-accent)" }}
                      />
                      {pending}
                    </span>
                  ) : (
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                      style={{ background: "var(--cp-surface-2)", color: "var(--cp-text-dim)" }}
                    >
                      {inf.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {viewing && (
        <InfluencerProfileDialog
          inf={viewing}
          onClose={() => setViewingId(null)}
          onRespondInflu={async (respStatus, motivo) => {
            await respondInfluFn({
              data: { token, influencerId: viewing.id, status: respStatus, motivo },
            });
            load();
          }}
          onRespondEntrega={async (entregaId, kind, respStatus, motivo) => {
            await respondEntregaFn({
              data: {
                token,
                influencerId: viewing.id,
                entregaId,
                kind,
                status: respStatus,
                motivo,
              },
            });
            load();
          }}
        />
      )}
    </div>
  );
}
