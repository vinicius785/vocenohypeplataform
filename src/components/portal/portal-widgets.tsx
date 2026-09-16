import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  Facebook,
  FileText,
  History,
  Instagram,
  Linkedin,
  ImageIcon,
  PlayCircle,
  Sparkles,
  Twitter,
  Upload,
  X,
  XCircle,
  Youtube,
} from "lucide-react";
import { ENTREGA_STAGE_TONE, type EntregaStage } from "@/lib/campanha-status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { submitRelatorioNps } from "@/lib/cliente-link.functions";
import { formatSeguidores } from "@/lib/format";
import { t, type PortalLang } from "@/lib/portal-i18n";
import { mesLabel } from "@/lib/relatorio-mensal";
import { SURFACE } from "@/lib/design-tokens";
import type { PublicEntrega, PublicInfluencer, PublicRelatorioMensal } from "@/lib/portal-types";

/**
 * Componentes/helpers só-do-portal — movidos verbatim do antigo
 * `routes/portal.$token.tsx` (rota única de 2610 linhas) na Etapa 2 do
 * redesenho (shell/navegação). Nenhuma mudança visual/comportamental aqui;
 * o conteúdo/redesenho real destas peças é de etapas futuras (5, 6, 10...).
 */

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

const PLATFORM_URL_BUILDERS: Record<string, (handle: string) => string> = {
  Instagram: (h) => `https://instagram.com/${h}`,
  YouTube: (h) => `https://youtube.com/${h.startsWith("@") ? h : `@${h}`}`,
  Facebook: (h) => `https://facebook.com/${h}`,
  LinkedIn: (h) => `https://linkedin.com/in/${h}`,
  X: (h) => `https://x.com/${h}`,
};

export function profileUrl(plataforma: string, handle: string): string | undefined {
  const clean = handle.trim().replace(/^@/, "");
  if (!clean) return undefined;
  if (/^https?:\/\//i.test(handle.trim())) return handle.trim();
  const build = PLATFORM_URL_BUILDERS[plataforma];
  return build ? build(clean) : undefined;
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("pt-BR");
}

/** Pra timestamps completos (ISO com hora), diferente de `fmtDate` acima
 * que só entende datas soltas "YYYY-MM-DD". */
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Mesmo critério usado na galeria de conteúdos da VI — decide se um anexo
 * pode ser mostrado como thumbnail de imagem ou precisa de um ícone
 * genérico (vídeo, pdf, etc). */
export function isImageUrl(nome?: string): boolean {
  return !!nome && /\.(png|jpe?g|gif|webp|svg)$/i.test(nome);
}

/** Vídeo de conteúdo (Reels/TikTok/etc) — antes o cliente só via um ícone
 * genérico + link pra abrir/baixar em outra aba, sem conseguir assistir
 * direto no portal antes de aprovar. */
export function isVideoUrl(nome?: string): boolean {
  return !!nome && /\.(mp4|mov|webm|m4v)$/i.test(nome);
}

/** Resumo compacto das entregas agrupadas por tipo, ex: "3× Reels · 2× Stories". */
export function entregasSummary(entregas: PublicEntrega[]): string {
  const byTipo = new Map<string, number>();
  for (const e of entregas) byTipo.set(e.tipo, (byTipo.get(e.tipo) ?? 0) + (e.quantidade || 1));
  return Array.from(byTipo.entries())
    .map(([tipo, qtd]) => `${qtd}× ${tipo}`)
    .join(" · ");
}

/** Um influenciador "precisa de você agora" se a seleção está aguardando
 * decisão, ou alguma entrega está aguardando aprovação de roteiro/conteúdo. */
export function pendingReason(inf: PublicInfluencer, lang: PortalLang): string | null {
  if (inf.status === "ENVIADO_AO_CLIENTE" && !inf.clienteReprovacao) return t(lang, "pendingInflu");
  const roteiro = inf.entregas.some((e) => e.stage === "ROTEIRO_APROVACAO");
  if (roteiro) return t(lang, "pendingRoteiro");
  const conteudo = inf.entregas.some((e) => e.stage === "CONTEUDO_APROVACAO");
  if (conteudo) return t(lang, "pendingConteudo");
  return null;
}

/** Mesma lógica do ícone de aprovação/reprovação sobre a foto usado
 * internamente (InfluCard, na VI). */
export function influApproval(inf: PublicInfluencer): "aprovado" | "reprovado" | null {
  if (inf.status === "RECUSADO") return "reprovado";
  if (inf.status === "ENVIADO_AO_CLIENTE") return inf.clienteReprovacao ? "reprovado" : null;
  return "aprovado";
}

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function KpiCard({
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

export function MetricStat({ label, value }: { label: string; value: string }) {
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

export function DemographicChart({
  title,
  entries,
  chartType = "bar",
}: {
  title: string;
  entries?: { id: string; label: string; percentual: number }[];
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

export function hasRedeMetrics(m?: {
  interacoes?: number;
  visualizacoes?: number;
  taxaInteracao?: number;
  taxaAtencaoInicial?: number;
  genero?: unknown[];
  faixaEtaria?: unknown[];
  paises?: unknown[];
  cidades?: unknown[];
}): boolean {
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

export function hasEntregaMetrics(m?: PublicEntrega["metrics"]): boolean {
  return Boolean(m && Object.values(m).some((v) => v));
}

/** Chip de anexo (roteiro/conteúdo) — reaproveitado nos cards de entrega e
 * no card de briefing, no lugar de um link solto sublinhado. */
export function AnexoChip({
  nome,
  url,
  onRemove,
}: {
  nome?: string;
  url: string;
  onRemove?: () => void;
}) {
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

/** Anexo de uma entrega em revisão — vídeo toca inline (player nativo),
 * pra dar pra assistir e decidir sem precisar baixar o arquivo antes.
 * Qualquer outro tipo cai no chip de link de sempre. */
export function EntregaAnexoPreview({ nome, url }: { nome?: string; url: string }) {
  if (isVideoUrl(nome)) {
    return (
      <video
        controls
        preload="metadata"
        className="max-h-72 w-full rounded-lg border border-border bg-black"
      >
        <source src={url} />
      </video>
    );
  }
  return <AnexoChip nome={nome} url={url} />;
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
export function ReprovacaoBanner({
  v,
  lang,
  nome,
}: {
  v: { motivo: string; respondedAt: string };
  lang: PortalLang;
  nome: string;
}) {
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
export function ApproveRejectBar({
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
export function StatusBadge({
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

/** Um relatório mensal (PDF) — abre inline sem precisar baixar (o cliente
 * vê o PDF direto no navegador via `<iframe>`), com download opcional, e
 * pede o NPS assim que o cliente já viu o relatório (some depois de
 * respondido). */
export function RelatorioMensalCard({
  relatorio,
  campanhaId,
  token,
  viewing,
  onToggleView,
  onAnswered,
}: {
  relatorio: PublicRelatorioMensal;
  campanhaId: string;
  token: string;
  viewing: boolean;
  onToggleView: () => void;
  onAnswered: (nps: NonNullable<PublicRelatorioMensal["nps"]>) => void;
}) {
  const submitNpsFn = useServerFn(submitRelatorioNps);
  const [score, setScore] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submitNps = async () => {
    if (score === null || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await submitNpsFn({
        data: { token, campanhaId, relatorioId: relatorio.id, score, comentario },
      });
      onAnswered({
        score,
        comentario: comentario.trim() || undefined,
        respondedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{mesLabel(relatorio.mes)}</p>
          <p className="text-[11px] text-muted-foreground">
            Enviado em {fmtDate(relatorio.uploadedAt.slice(0, 10))}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {relatorio.url && (
            <button
              type="button"
              onClick={onToggleView}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              {viewing ? "Ocultar" : "Visualizar"}
            </button>
          )}
          {relatorio.url && (
            <a
              href={relatorio.url}
              download={relatorio.nome}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" /> Baixar
            </a>
          )}
        </div>
      </div>

      {viewing && relatorio.url && (
        <iframe
          src={relatorio.url}
          title={relatorio.nome}
          className="mt-3 h-[70vh] w-full rounded-lg border border-border"
        />
      )}

      {viewing &&
        (relatorio.nps ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Obrigado pela avaliação! Você deu nota {relatorio.nps.score}/10.
          </p>
        ) : (
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-foreground">
              De 0 a 10, o quanto você recomendaria esta campanha a um colega?
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Array.from({ length: 11 }, (_, n) => n).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScore(n)}
                  className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-medium transition-colors ${
                    score === n
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Comentário (opcional)"
              rows={2}
              maxLength={2000}
              className="mt-2 w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
            {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
            <button
              type="button"
              onClick={() => void submitNps()}
              disabled={score === null || submitting}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              Enviar avaliação
            </button>
          </div>
        ))}
    </div>
  );
}

/** Card de galeria — usado na lista de influenciadores de uma campanha
 * (foto grande em destaque, em vez da lista de linhas). */
export function InfluencerGalleryCard({
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
      {/* Rede principal — primeira cadastrada (sem inventar critério de
       * "maior audiência": `seguidores` é texto livre, sem parser numérico
       * confiável no projeto pra comparar entre redes). */}
      {inf.redes[0] && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <PlatformIcon plataforma={inf.redes[0].plataforma} className="h-3 w-3" />
          {inf.redes[0].seguidores
            ? formatSeguidores(inf.redes[0].seguidores)
            : inf.redes[0].handle}
        </span>
      )}
      {inf.entregas.length > 0 && (
        <p className="truncate text-xs text-muted-foreground">{entregasSummary(inf.entregas)}</p>
      )}
      <StatusBadge inf={inf} lang={lang} className="px-2 py-0 text-[10px]" />
    </button>
  );
}

/** Painel de detalhe — substitui a lista dentro da mesma área principal
 * (breadcrumb no lugar do antigo botão "Voltar" grande, Etapa 5). Notas
 * internas do influenciador (`comments`/`activity`/`checklist` do `Influ`
 * interno) NUNCA chegam aqui — `toPublicInfluencer` (cliente-link.functions.ts)
 * já não projeta esses campos, então este componente nem tem acesso a
 * eles; briefing/observações abaixo são as duas únicas categorias de nota
 * hoje com suporte real pro cliente (uma 3ª categoria, "comentários da
 * agência visíveis ao cliente", foi adiada por falta de suporte de
 * backend — ver plano da Etapa 5). */
export function InfluencerDetail({
  inf,
  lang,
  mes,
  campanhaNome,
  onBack,
  onRespondInflu,
  onRespondEntrega,
  onSaveBriefing,
  onSaveObservacoes,
  onSaveBriefingAnexo,
}: {
  inf: PublicInfluencer;
  lang: PortalLang;
  /** Mês (`"YYYY-MM"`) desse influenciador — só passado quando a campanha é
   * recorrente, pra deixar claro de qual ciclo ele é (a mesma campanha
   * acumula vários meses ao longo do tempo). */
  mes?: string;
  /** Nome da campanha, pro segundo nível da breadcrumb — o primeiro nível
   * (link real de volta) é responsabilidade do `onBack`. */
  campanhaNome: string;
  onBack: () => void;
  onRespondInflu: (status: "aprovado" | "reprovado", motivo?: string) => Promise<void>;
  onRespondEntrega: (
    entregaId: string,
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
  // `scope` é só pra distinguir, na UI, qual das duas barras (roteiro ou
  // conteúdo) está ocupada — o servidor já deriva sozinho qual ciclo está
  // em jogo a partir do `stage` atual da entrega, nunca confia nisso vindo
  // do cliente.
  const runEntrega = async (
    entregaId: string,
    scope: "roteiro" | "conteudo",
    status: "aprovado" | "reprovado",
  ) => {
    const key = `${scope}:${entregaId}`;
    setBusyKey(key);
    try {
      await onRespondEntrega(entregaId, status, status === "reprovado" ? motivo.trim() : undefined);
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
  // da galeria da campanha na VI (anexo categoria "Conteúdo final", com
  // o link "url" como alternativa quando não há anexo).
  const galeriaItems: { entrega: PublicEntrega; nome?: string; url: string }[] = inf.entregas
    .filter((e) => e.status === "publicado")
    .flatMap((e) => {
      const publicados = (e.anexos ?? []).filter((a) => a.categoria === "Conteúdo final");
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
      {/* Breadcrumb no lugar do antigo botão "Voltar" grande (Etapa 5) —
       * os 2 primeiros níveis voltam pra campanha (mesmo `onBack` de
       * sempre, só que acionado por um link de texto em vez de um botão
       * grande), o último é a página atual (não clicável). */}
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button" onClick={onBack} className="hover:text-foreground">
                {campanhaNome}
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button" onClick={onBack} className="hover:text-foreground">
                {t(lang, "influenciadoresHeader")}
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate">{inf.nome}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* HERO — foto/nome em destaque, com aprovar/reprovar direto no cabeçalho
          quando pendente, mesmo efeito de elevação sutil usado nos cards da
          plataforma interna (hover -translate-y + shadow). Fundo neutro
          (`SURFACE.raised`) no lugar do antigo gradiente decorativo sem
          função (Etapa 5). */}
      <div className={`overflow-hidden rounded-2xl ${SURFACE.raised} shadow-sm`}>
        <div className="h-16 bg-muted/40 sm:h-20" />
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
                {mes && <Badge variant="secondary">{mesLabel(mes)}</Badge>}
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
                  const roteiroPendente = e.stage === "ROTEIRO_APROVACAO";
                  const conteudoPendente = e.stage === "CONTEUDO_APROVACAO";
                  const publicado = e.status === "publicado";
                  const pendente = roteiroPendente || conteudoPendente;
                  const roteiroAnexos = (e.anexos ?? []).filter((a) => a.categoria === "Roteiro");
                  const conteudoAnexos = (e.anexos ?? []).filter(
                    (a) => a.categoria === "Conteúdo final",
                  );
                  const barTone = publicado
                    ? "bg-emerald-500"
                    : pendente
                      ? "bg-amber-500"
                      : "bg-border";
                  const pillTone =
                    ENTREGA_STAGE_TONE[e.stage as EntregaStage] ?? "bg-muted text-muted-foreground";
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
                              <div className="space-y-2">
                                {roteiroAnexos.map((a) => (
                                  <EntregaAnexoPreview key={a.id} nome={a.nome} url={a.url} />
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
                              <div className="space-y-2">
                                {conteudoAnexos.map((a) => (
                                  <EntregaAnexoPreview key={a.id} nome={a.nome} url={a.url} />
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

                        {e.historico && e.historico.length > 0 && (
                          <Collapsible className="mt-3 border-t border-border pt-3">
                            <CollapsibleTrigger className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
                              {t(lang, "entregaHistorico")} ({e.historico.length})
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-1.5 space-y-1">
                              {e.historico.map((h, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between gap-3 text-xs"
                                >
                                  <span className="text-foreground">
                                    {t(lang, h.key as Parameters<typeof t>[1])}
                                  </span>
                                  <span className="shrink-0 text-muted-foreground">
                                    {fmtDateTime(h.at)}
                                  </span>
                                </div>
                              ))}
                            </CollapsibleContent>
                          </Collapsible>
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
