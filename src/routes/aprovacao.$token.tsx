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
import { getApprovalByToken, respondApproval } from "@/lib/approval.functions";
import { formatSeguidores } from "@/lib/format";

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

export const Route = createFileRoute("/aprovacao/$token")({
  ssr: false,
  component: AprovacaoPublicPage,
  head: () => ({
    meta: [
      { title: "Aprovação de influenciadores · Hype" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Rede = { id?: string; plataforma: string; handle: string; seguidores?: string };
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
type ApprovalEntrega = {
  id: string;
  tipo: string;
  dataPostagem?: string;
  roteiro?: string;
  roteiroNome?: string;
  metrics?: PostMetrics;
};
type ApprovalInfluencer = {
  id: string;
  nome: string;
  foto?: string;
  redes: Rede[];
  entregas: ApprovalEntrega[];
  profileMetrics?: Record<string, RedeMetrics>;
};
type ApprovalResponse = { status: "aprovado" | "reprovado"; motivo?: string; respondedAt: string };
type ApprovalData = {
  campanha_nome: string | null;
  cliente_nome: string | null;
  influencers: ApprovalInfluencer[];
  responses: Record<string, ApprovalResponse>;
  total_planejado: number | null;
  mode: "approve" | "view";
};

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

/** Gráfico de barra (horizontal) ou pizza pra uma lista `{ name, valor }%`. */
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

/** Perfil completo do influenciador — aberto ao clicar no card, tanto no
 * modo "view" quanto "approve". Mostra redes sociais, as métricas do
 * perfil (por rede) e as métricas de cada entrega já publicada, quando
 * disponíveis — nada disso é editável aqui, é só leitura. */
function InfluencerProfileDialog({
  inf,
  onClose,
}: {
  inf: ApprovalInfluencer;
  onClose: () => void;
}) {
  const entregasComMetrics = inf.entregas.filter((e) => hasEntregaMetrics(e.metrics));
  const redesComMetrics = inf.redes.filter((r) => hasRedeMetrics(inf.profileMetrics?.[r.id ?? ""]));
  const semNadaAlem = entregasComMetrics.length === 0 && redesComMetrics.length === 0;

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
              <h3 className="text-lg font-semibold text-foreground">{inf.nome}</h3>
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
          {redesComMetrics.length > 0 && (
            <section className="space-y-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <BarChart3 className="h-4 w-4" /> Métricas do perfil
              </h4>
              <div className="space-y-6">
                {redesComMetrics.map((r) => {
                  const rm = inf.profileMetrics![r.id ?? ""]!;
                  return (
                    <div
                      key={r.id}
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

          {semNadaAlem && (
            <p className="text-sm text-muted-foreground">Nenhuma métrica cadastrada ainda.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AprovacaoPublicPage() {
  const { token } = Route.useParams();
  const getByTokenFn = useServerFn(getApprovalByToken);
  const respondFn = useServerFn(respondApproval);
  const [data, setData] = useState<ApprovalData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewingProfile, setViewingProfile] = useState<ApprovalInfluencer | null>(null);

  useEffect(() => {
    let cancelled = false;
    getByTokenFn({ data: { token } })
      .then((row) => {
        if (cancelled) return;
        const approvalData = row as ApprovalData;
        setData(approvalData);
        setStatus("ready");
        document.title =
          approvalData.mode === "view"
            ? "Visualização de influenciadores · Hype"
            : "Aprovação de influenciadores · Hype";
      })
      .catch(() => {
        if (!cancelled) setStatus("notfound");
      });
    return () => {
      cancelled = true;
    };
  }, [token, getByTokenFn]);

  const approve = async (influencerId: string) => {
    setBusyId(influencerId);
    try {
      const { responses } = await respondFn({
        data: { token, influencerId, status: "aprovado" },
      });
      setData((d) => (d ? { ...d, responses: responses as Record<string, ApprovalResponse> } : d));
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = async (influencerId: string) => {
    if (!motivo.trim()) return;
    setBusyId(influencerId);
    try {
      const { responses } = await respondFn({
        data: { token, influencerId, status: "reprovado", motivo: motivo.trim() },
      });
      setData((d) => (d ? { ...d, responses: responses as Record<string, ApprovalResponse> } : d));
      setRejecting(null);
      setMotivo("");
    } finally {
      setBusyId(null);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (status === "notfound" || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-foreground">Link não encontrado</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Esse link de aprovação não existe mais ou é inválido.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <header>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {data.cliente_nome || "Aprovação de influenciadores"}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            {data.campanha_nome || "Selecione os influenciadores"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.mode === "view"
              ? "Influenciadores selecionados para esta campanha."
              : "Aprove ou reprove cada influenciador abaixo. Reprovações precisam de um motivo."}
          </p>
        </header>

        {data.mode === "view" && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-y border-border py-5 sm:grid-cols-5">
            <Kpi label="Influenciadores" value={data.influencers.length.toString()} />
          </div>
        )}

        {data.mode === "approve" &&
          (() => {
            const total = data.influencers.length;
            const aprovados = data.influencers.filter(
              (i) => data.responses[i.id]?.status === "aprovado",
            ).length;
            const reprovados = data.influencers.filter(
              (i) => data.responses[i.id]?.status === "reprovado",
            ).length;
            const aguardando = total - aprovados - reprovados;
            return (
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-y border-border py-5 sm:grid-cols-5">
                {typeof data.total_planejado === "number" && (
                  <Kpi label="Planejado" value={data.total_planejado.toString()} />
                )}
                <Kpi label="Influenciadores" value={total.toString()} />
                <Kpi label="Aprovados" value={aprovados.toString()} tone="success" />
                <Kpi label="Aguardando" value={aguardando.toString()} tone="warning" />
                <Kpi label="Reprovados" value={reprovados.toString()} tone="danger" />
              </div>
            );
          })()}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.influencers.map((inf) => {
            const resp = data.responses[inf.id];
            const isRejectingThis = rejecting === inf.id;
            const redes = (
              <div className={`flex flex-wrap gap-1.5 ${data.mode === "view" ? "mt-2" : "mt-1"}`}>
                {inf.redes.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Sem redes cadastradas</span>
                ) : (
                  inf.redes.map((r, i) => {
                    const url = profileUrl(r.plataforma, r.handle);
                    const content = (
                      <>
                        <PlatformIcon
                          plataforma={r.plataforma}
                          className={data.mode === "view" ? "h-3.5 w-3.5" : "h-3 w-3"}
                        />
                        {r.handle || r.plataforma}
                        {r.seguidores ? ` · ${formatSeguidores(r.seguidores)} seg.` : ""}
                      </>
                    );
                    const className =
                      (data.mode === "view"
                        ? "inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground"
                        : "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground") +
                      (url ? " hover:bg-muted-foreground/20" : "");
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
            );

            if (data.mode === "view") {
              return (
                <div
                  key={inf.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewingProfile(inf)}
                  onKeyDown={(e) => e.key === "Enter" && setViewingProfile(inf)}
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
                  <div onClick={(e) => e.stopPropagation()}>{redes}</div>
                </div>
              );
            }

            return (
              <div
                key={inf.id}
                className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewingProfile(inf)}
                  onKeyDown={(e) => e.key === "Enter" && setViewingProfile(inf)}
                  className="flex cursor-pointer items-center gap-3 text-left"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
                    {inf.foto ? (
                      <img src={inf.foto} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-foreground">{inf.nome}</p>
                    <div onClick={(e) => e.stopPropagation()}>{redes}</div>
                  </div>
                </div>

                {inf.entregas.length > 0 && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <Users className="h-3 w-3" /> Entregas ({inf.entregas.length})
                    </p>
                    <ul className="space-y-1.5">
                      {inf.entregas.map((e) => (
                        <li
                          key={e.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
                        >
                          <span className="font-medium text-foreground">{e.tipo}</span>
                          <div className="flex items-center gap-2">
                            {e.dataPostagem && (
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <CalendarDays className="h-3 w-3" /> {fmtDate(e.dataPostagem)}
                              </span>
                            )}
                            {e.roteiro && (
                              <a
                                href={e.roteiro}
                                download={e.roteiroNome}
                                className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2"
                              >
                                <FileText className="h-3 w-3" /> Roteiro
                              </a>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {resp ? (
                  <div
                    className={`rounded-md px-3 py-2 text-xs font-medium ${
                      resp.status === "aprovado"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                    }`}
                  >
                    {resp.status === "aprovado" ? "Aprovado" : "Reprovado"}
                    {resp.motivo && <p className="mt-1 font-normal">{resp.motivo}</p>}
                  </div>
                ) : isRejectingThis ? (
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
                          setRejecting(null);
                          setMotivo("");
                        }}
                        className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void confirmReject(inf.id)}
                        disabled={!motivo.trim() || busyId === inf.id}
                        className="flex-1 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Confirmar reprovação
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void approve(inf.id)}
                      disabled={busyId === inf.id}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejecting(inf.id);
                        setMotivo("");
                      }}
                      disabled={busyId === inf.id}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reprovar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {viewingProfile && (
        <InfluencerProfileDialog inf={viewingProfile} onClose={() => setViewingProfile(null)} />
      )}
    </div>
  );
}
