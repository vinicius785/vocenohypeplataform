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
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Facebook,
  FileText,
  Instagram,
  Linkedin,
  Twitter,
  User,
  Users,
  X,
  XCircle,
  Youtube,
} from "lucide-react";
import {
  getCampanhaLinkData,
  respondCampanhaInflu,
  respondCampanhaEntrega,
} from "@/lib/campanha-link.functions";
import { formatSeguidores } from "@/lib/format";
import { fetchWorkspace, type Workspace } from "@/lib/workspace-store";

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
  redes: { plataforma: string; handle: string; seguidores?: string }[];
  entregas: PublicEntrega[];
  profileMetrics?: { porRede?: Record<string, RedeMetrics> };
};
type CampanhaLinkData = {
  campanhaNome: string;
  clienteNome: string;
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
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-2.5 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-foreground text-background">
          {ws.logo ? (
            <img src={ws.logo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-bold">{ws.nome.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <span className="text-sm font-semibold text-foreground">{ws.nome}</span>
      </div>
    </header>
  );
}

function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-rose-600 dark:text-rose-400",
  }[tone];
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1.5 truncate text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
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
      <div className="space-y-2">
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo da reprovação (obrigatório)"
          autoFocus
          className="h-20 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setRejecting(false);
              setMotivo("");
            }}
            className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmReject}
            disabled={!motivo.trim() || busy}
            className="flex-1 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Aprovar
      </button>
      <button
        type="button"
        onClick={() => setRejecting(true)}
        disabled={busy}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
      >
        <XCircle className="h-3.5 w-3.5" />
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
  const redesComMetrics = inf.redes.filter((r) =>
    hasRedeMetrics(inf.profileMetrics?.porRede?.[r.plataforma]),
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border bg-muted/30 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-2 ring-background">
              {inf.foto ? (
                <img src={inf.foto} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">{inf.nome}</h3>
                {inf.nicho && (
                  <span className="rounded-full bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
                    {inf.nicho}
                  </span>
                )}
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
                    const className = `inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground shadow-sm${url ? " hover:bg-muted" : ""}`;
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
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-6">
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
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="h-4 w-4" /> Entregas ({inf.entregas.length})
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
                    <li key={e.id} className="rounded-md bg-muted/40 px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                          {e.quantidade && e.quantidade > 1 ? `${e.quantidade}× ` : ""}
                          {e.tipo}
                          {e.conteudoStatus && (
                            <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {e.conteudoStatus}
                            </span>
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
            <section className="space-y-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <BarChart3 className="h-4 w-4" /> Métricas do perfil
              </h4>
              <div className="space-y-6">
                {redesComMetrics.map((r) => {
                  const rm = inf.profileMetrics!.porRede![r.plataforma]!;
                  return (
                    <div
                      key={r.plataforma}
                      className="space-y-4 rounded-xl border border-border bg-card p-4"
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
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="h-4 w-4" /> Métricas das entregas
              </h4>
              <div className="space-y-3">
                {entregasComMetrics.map((e) => (
                  <div key={e.id} className="rounded-xl border border-border bg-card p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
            <p className="text-sm text-muted-foreground">Nenhuma métrica cadastrada ainda.</p>
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
      <div className="min-h-screen bg-background">
        <TopBar ws={ws} />
        <div className="flex min-h-screen items-center justify-center p-6 pt-14">
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (status === "notfound" || !data) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar ws={ws} />
        <div className="flex min-h-screen items-center justify-center p-6 pt-14">
          <div className="max-w-sm text-center">
            <h1 className="text-lg font-semibold text-foreground">Link não encontrado</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
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
    <div className="min-h-screen bg-background">
      <TopBar ws={ws} />
      <div className="mx-auto max-w-2xl space-y-8 px-4 pb-10 pt-24">
        <header>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {data.clienteNome || "Campanha"}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            {data.campanhaNome || "Influenciadores"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Acompanhe e aprove cada etapa — seleção, roteiro e conteúdo — clicando no influenciador.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-y border-border py-5 sm:grid-cols-4">
          {data.planejado > 0 && <Kpi label="Planejado" value={data.planejado.toString()} />}
          <Kpi label="Influenciadores" value={total.toString()} />
          <Kpi
            label="Aguardando você"
            value={aguardando.toString()}
            tone={aguardando > 0 ? "warning" : "default"}
          />
          <Kpi label="Aprovados" value={aprovados.toString()} tone="success" />
          <Kpi label="Postados" value={postados.toString()} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.influencers.map((inf) => {
            const pending = pendingReason(inf);
            return (
              <div
                key={inf.id}
                role="button"
                tabIndex={0}
                onClick={() => setViewingId(inf.id)}
                onKeyDown={(e) => e.key === "Enter" && setViewingId(inf.id)}
                className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center transition-colors hover:bg-muted/40"
              >
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
                  {inf.foto ? (
                    <img src={inf.foto} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
                  )}
                </div>
                <p className="text-lg font-semibold text-foreground">{inf.nome}</p>
                {inf.nicho && (
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {inf.nicho}
                  </span>
                )}
                {inf.entregas.length > 0 && (
                  <p className="text-xs text-muted-foreground">{entregasSummary(inf.entregas)}</p>
                )}
                {pending ? (
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    {pending}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {inf.status}
                  </span>
                )}
              </div>
            );
          })}
        </div>
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
