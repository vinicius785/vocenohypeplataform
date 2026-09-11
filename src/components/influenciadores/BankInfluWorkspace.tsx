import { useState } from "react";
import {
  MoreVertical,
  Pencil,
  FileBadge2,
  Users,
  History,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Radar,
  ShieldCheck,
  MapPin,
  ChevronDown,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useConfirm } from "@/hooks/use-confirm";
import { formatSeguidores } from "@/lib/format";
import { INFLU_STATUS_LABEL } from "@/lib/campanha-status";
import {
  PlatformIcon,
  computeReliability,
  pagamentoResumo,
  type Influ,
  type ReliabilityStats,
} from "@/components/influenciadores/InfluencerBoard";
import { type BankInflu } from "@/lib/banco-influs-store";

export type HistoryItem = {
  clienteId: string;
  clienteEmpresa: string;
  campanhaId: string;
  campanhaNome: string;
  campDataInicio?: string;
  campPrazo?: string;
  status: string;
  influ: Influ;
};

function totalSeguidores(redes: BankInflu["redes"]): number {
  return redes.reduce((sum, r) => sum + (Number(r.seguidores?.replace(/\D/g, "")) || 0), 0);
}

function redeUrl(plataforma: string, handle: string): string | null {
  const raw = handle.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const h = raw.replace(/^@/, "");
  if (!h) return null;
  switch (plataforma) {
    case "Instagram":
      return `https://instagram.com/${h}`;
    case "TikTok":
      return `https://tiktok.com/@${h}`;
    case "YouTube":
      return h.startsWith("channel/") || h.startsWith("@")
        ? `https://youtube.com/${h}`
        : `https://youtube.com/@${h}`;
    case "X":
      return `https://x.com/${h}`;
    case "LinkedIn":
      return h.includes("/") ? `https://linkedin.com/${h}` : `https://linkedin.com/in/${h}`;
    case "Facebook":
      return `https://facebook.com/${h}`;
    default:
      return null;
  }
}

function reliabilityLabel(r: ReliabilityStats): {
  text: string;
  tone: "success" | "warning" | "danger" | "neutral";
} {
  if (r.total === 0) return { text: "Sem histórico", tone: "neutral" };
  if (r.total < 3) return { text: "Amostra insuficiente", tone: "neutral" };
  if (r.score >= 80) return { text: `${r.score}% confiável`, tone: "success" };
  if (r.score >= 50) return { text: `${r.score}% confiável`, tone: "warning" };
  return { text: `${r.score}% confiável`, tone: "danger" };
}

const TONE_BADGE: Record<string, string> = {
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
  neutral: "bg-muted text-muted-foreground",
};

function ReliabilitySection({ reliability }: { reliability: ReliabilityStats }) {
  if (reliability.total === 0) {
    return (
      <section className="rounded-xl border border-border p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Confiabilidade
        </h2>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Confiabilidade ainda não calculada — este influenciador ainda não tem entregas registradas
          em nenhuma campanha.
        </p>
      </section>
    );
  }
  if (reliability.total < 3) {
    return (
      <section className="rounded-xl border border-border p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Confiabilidade
        </h2>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Amostra insuficiente · {reliability.total}{" "}
          {reliability.total === 1 ? "entrega analisada" : "entregas analisadas"} até agora.
          Calculamos a confiabilidade a partir de 3 entregas ou mais.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Confiabilidade
        </h2>
        <span className="text-lg font-semibold text-foreground">{reliability.score}%</span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {reliability.score}% de confiabilidade · {reliability.total} entregas analisadas nos últimos
        12 meses (ou todo o histórico, se ainda não havia amostra recente suficiente): prazo
        cumprido, etapas intermediárias (roteiro/gravação) em dia e reprovações abertas do cliente.
      </p>
      <div
        role="progressbar"
        aria-label={`Confiabilidade: ${reliability.score}%, com base em ${reliability.total} entregas`}
        aria-valuenow={reliability.score}
        aria-valuemin={0}
        aria-valuemax={100}
        title="Cálculo: prazo cumprido, etapas intermediárias em dia e reprovações abertas nos últimos 12 meses (ou todo o histórico, se a amostra recente for pequena)."
        className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        {reliability.onTime > 0 && (
          <div
            style={{ width: `${(reliability.onTime / reliability.total) * 100}%` }}
            className="bg-success"
          />
        )}
        {reliability.late > 0 && (
          <div
            style={{ width: `${(reliability.late / reliability.total) * 100}%` }}
            className="bg-warning"
          />
        )}
        {reliability.overdue > 0 && (
          <div
            style={{ width: `${(reliability.overdue / reliability.total) * 100}%` }}
            className="bg-danger"
          />
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success" />
          {reliability.onTime} no prazo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-warning" />
          {reliability.late} atrasada{reliability.late === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-danger" />
          {reliability.overdue} vencida{reliability.overdue === 1 ? "" : "s"}
        </span>
      </div>
      {(reliability.etapasAtrasadas > 0 || reliability.reprovacoesAbertas > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {reliability.etapasAtrasadas > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning-soft-foreground">
              {reliability.etapasAtrasadas} etapa
              {reliability.etapasAtrasadas === 1 ? "" : "s"} intermediária
              {reliability.etapasAtrasadas === 1 ? "" : "s"} atrasada
              {reliability.etapasAtrasadas === 1 ? "" : "s"}
            </span>
          )}
          {reliability.reprovacoesAbertas > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger-soft-foreground"
              title="Reprovações ainda não resolvidas (o time reenvia e o cliente aprova de novo pra limpar)"
            >
              {reliability.reprovacoesAbertas} reprovaç
              {reliability.reprovacoesAbertas === 1 ? "ão" : "ões"} aberta
              {reliability.reprovacoesAbertas === 1 ? "" : "s"} agora
            </span>
          )}
        </div>
      )}
    </section>
  );
}

export function BankInfluWorkspace({
  influ,
  history,
  onClose,
  onEdit,
  onRemove,
  onMediaKit,
}: {
  influ: BankInflu | null;
  history: HistoryItem[];
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => Promise<void> | void;
  onMediaKit: () => void;
}) {
  const [view, setView] = useState<"perfil" | "participacao">("perfil");
  const [openParticipacao, setOpenParticipacao] = useState<HistoryItem | null>(null);
  const [perfilExpanded, setPerfilExpanded] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  if (!influ) return null;

  const reliability = computeReliability(history.map((h) => h.influ));
  const seguidores = totalSeguidores(influ.redes);
  const redePrincipal =
    influ.redes.find((r) => r.id === influ.redePrincipalId) ?? influ.redes[0] ?? null;

  const metrics = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0 };
  let publicadas = 0;
  const porCampanha: { name: string; views: number }[] = [];
  for (const h of history) {
    let campViews = 0;
    for (const e of h.influ.entregas) {
      if (e.status !== "publicado") continue;
      publicadas += 1;
      const m = e.metrics ?? {};
      metrics.views += m.views ?? 0;
      metrics.likes += m.likes ?? 0;
      metrics.comments += m.comments ?? 0;
      metrics.shares += m.shares ?? 0;
      metrics.saves += m.saves ?? 0;
      metrics.reach += m.reach ?? 0;
      campViews += m.views ?? 0;
    }
    if (campViews > 0) porCampanha.push({ name: h.campanhaNome, views: campViews });
  }
  const metricCards = [
    { key: "views", label: "Views", value: metrics.views, icon: Eye },
    { key: "reach", label: "Alcance", value: metrics.reach, icon: Radar },
    { key: "likes", label: "Curtidas", value: metrics.likes, icon: Heart },
    { key: "comments", label: "Comentários", value: metrics.comments, icon: MessageCircle },
    { key: "shares", label: "Compart.", value: metrics.shares, icon: Share2 },
    { key: "saves", label: "Salvos", value: metrics.saves, icon: Bookmark },
  ];

  const openParticipacaoView = (h: HistoryItem) => {
    setOpenParticipacao(h);
    setView("participacao");
  };
  const backToProfile = () => {
    setView("perfil");
    setOpenParticipacao(null);
  };

  const enderecoResumo = influ.endereco?.cidade
    ? `${influ.endereco.cidade}${influ.endereco.estado ? `/${influ.endereco.estado}` : ""}`
    : null;

  return (
    <>
      <Sheet open={!!influ} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:w-[90vw] sm:max-w-[820px]"
          onEscapeKeyDown={(e) => {
            if (view !== "perfil") {
              e.preventDefault();
              backToProfile();
            }
          }}
        >
          <SheetTitle className="sr-only">
            {view === "perfil"
              ? `Perfil de ${influ.nome}`
              : `Participação em ${openParticipacao?.campanhaNome}`}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Workspace do banco de influenciadores.
          </SheetDescription>

          {view === "participacao" && openParticipacao ? (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-3">
                <button
                  type="button"
                  onClick={backToProfile}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar ao perfil global
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <h2 className="text-base font-semibold text-foreground">
                  {openParticipacao.campanhaNome}
                </h2>
                <p className="text-xs text-muted-foreground">{openParticipacao.clienteEmpresa}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                    {INFLU_STATUS_LABEL[openParticipacao.influ.status] ?? openParticipacao.status}
                  </span>
                  {openParticipacao.campPrazo && (
                    <span className="text-muted-foreground">
                      Prazo: {openParticipacao.campPrazo}
                    </span>
                  )}
                  {openParticipacao.influ.pagamento && (
                    <span className="text-muted-foreground">
                      Valor: {pagamentoResumo(openParticipacao.influ.pagamento)}
                    </span>
                  )}
                </div>

                <h3 className="mt-6 text-sm font-semibold text-foreground">Entregas</h3>
                {openParticipacao.influ.entregas.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Nenhuma entrega registrada nesta participação.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                    {openParticipacao.influ.entregas.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            {e.titulo || e.tipo}
                          </p>
                          {e.dataPostagem && (
                            <p className="text-muted-foreground">Postagem: {e.dataPostagem}</p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                          {e.status === "publicado"
                            ? "Publicado"
                            : e.status === "combinado"
                              ? "Combinado"
                              : "Orçado"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-6 text-[11px] text-muted-foreground">
                  Esta é uma visão de leitura desta participação. Pra editar entregas, roteiro,
                  aprovações ou pagamento, abra a campanha em Campanhas.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border">
                  {influ.foto ? (
                    <img
                      src={influ.foto}
                      alt=""
                      className="h-full w-full object-cover object-center"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-base font-semibold text-muted-foreground">
                      {influ.nome.charAt(0).toUpperCase() || "?"}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-foreground">{influ.nome}</h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {influ.nicho && <span>{influ.nicho}</span>}
                    {influ.tier && <span>· {influ.tier}</span>}
                    {redePrincipal && (
                      <span className="inline-flex items-center gap-1">
                        · <PlatformIcon plataforma={redePrincipal.plataforma} className="h-3 w-3" />
                        {redePrincipal.handle || redePrincipal.plataforma}
                      </span>
                    )}
                    {seguidores > 0 && (
                      <span>· {formatSeguidores(String(seguidores))} seguidores</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onMediaKit}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
                  >
                    <FileBadge2 className="h-3.5 w-3.5" /> Media kit
                  </button>
                  <button
                    type="button"
                    onClick={onEdit}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Mais opções"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={async () => {
                          if (
                            !(await confirm(
                              `Remover "${influ.nome}" do banco de influenciadores? O histórico de campanhas continua acessível pelas próprias campanhas.`,
                            ))
                          )
                            return;
                          await onRemove();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="space-y-6">
                  <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <ResumoTile
                      icon={Users}
                      label="Seguidores"
                      value={
                        seguidores > 0 ? formatSeguidores(String(seguidores)) : "Não informado"
                      }
                    />
                    <ResumoTile icon={History} label="Campanhas" value={String(history.length)} />
                    <ResumoTile icon={Eye} label="Publicações" value={String(publicadas)} />
                    <ResumoTile
                      icon={ShieldCheck}
                      label="Confiabilidade"
                      value={reliabilityLabel(reliability).text}
                    />
                  </section>

                  <ReliabilitySection reliability={reliability} />

                  <section>
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Eye className="h-3.5 w-3.5" /> Desempenho
                    </h2>
                    {publicadas === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Ainda não há publicações com métricas cadastradas para este influenciador.
                      </p>
                    ) : (
                      <>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {publicadas} publicaç{publicadas === 1 ? "ão" : "ões"} consideradas, em
                          todas as campanhas e redes cadastradas.
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                          {metricCards.map((m) => (
                            <div
                              key={m.key}
                              className="rounded-lg border border-border p-3 text-center"
                            >
                              <m.icon className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
                              <div className="mt-1 text-base font-semibold text-foreground">
                                {m.value > 0 ? m.value.toLocaleString("pt-BR") : "—"}
                              </div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {m.label}
                              </div>
                            </div>
                          ))}
                        </div>
                        {porCampanha.length > 1 && (
                          <div className="mt-4 h-[140px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={porCampanha}
                                layout="vertical"
                                margin={{ left: 0, right: 28 }}
                              >
                                <CartesianGrid horizontal={false} strokeOpacity={0.15} />
                                <XAxis type="number" hide />
                                <YAxis
                                  type="category"
                                  dataKey="name"
                                  width={110}
                                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <Bar
                                  dataKey="views"
                                  fill="var(--brand)"
                                  radius={3}
                                  barSize={14}
                                  isAnimationActive={false}
                                >
                                  <LabelList
                                    dataKey="views"
                                    position="right"
                                    formatter={(v: number) => v.toLocaleString("pt-BR")}
                                    style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                                  />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </>
                    )}
                  </section>

                  <section>
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <History className="h-3.5 w-3.5" /> Histórico de campanhas
                    </h2>
                    {history.length === 0 ? (
                      <div className="mt-2 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                        Nenhuma campanha registrada ainda.
                      </div>
                    ) : (
                      <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                        {history.map((h, idx) => {
                          const partReliability = computeReliability([h.influ]);
                          const entregasCount = h.influ.entregas.length;
                          const publicadasCount = h.influ.entregas.filter(
                            (e) => e.status === "publicado",
                          ).length;
                          return (
                            <li key={`${h.campanhaId}-${idx}`}>
                              <button
                                type="button"
                                onClick={() => openParticipacaoView(h)}
                                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs hover:bg-muted/40"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium text-foreground">
                                    {h.campanhaNome}
                                  </p>
                                  <p className="truncate text-muted-foreground">
                                    {h.clienteEmpresa}
                                    {h.campPrazo ? ` · prazo ${h.campPrazo}` : ""}
                                  </p>
                                </div>
                                <div className="hidden shrink-0 text-muted-foreground sm:block">
                                  {entregasCount} entrega{entregasCount === 1 ? "" : "s"} ·{" "}
                                  {publicadasCount} publicada{publicadasCount === 1 ? "" : "s"}
                                </div>
                                {h.influ.pagamento && (
                                  <span className="hidden shrink-0 text-muted-foreground md:block">
                                    {pagamentoResumo(h.influ.pagamento)}
                                  </span>
                                )}
                                {partReliability.total > 0 && (
                                  <span
                                    className={`hidden shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium lg:block ${TONE_BADGE[reliabilityLabel(partReliability).tone]}`}
                                  >
                                    {partReliability.score}%
                                  </span>
                                )}
                                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                                  {INFLU_STATUS_LABEL[h.influ.status] ?? h.status}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  <Collapsible open={perfilExpanded} onOpenChange={setPerfilExpanded}>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-left"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">Perfil e contatos</p>
                          <p className="text-xs text-muted-foreground">
                            {redePrincipal
                              ? `${redePrincipal.plataforma} · ${redePrincipal.handle || "sem handle"}`
                              : "Sem rede principal"}
                            {influ.nicho ? ` · ${influ.nicho}` : ""}
                            {enderecoResumo ? ` · ${enderecoResumo}` : ""}
                          </p>
                        </div>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${perfilExpanded ? "rotate-180" : ""}`}
                        />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3 space-y-4 px-1">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <Field label="Nome" value={influ.nome} />
                        <Field label="Nicho" value={influ.nicho} />
                        <Field label="Tier" value={influ.tier} />
                        <Field label="Telefone" value={influ.telefone} />
                        <Field label="E-mail" value={influ.email} className="col-span-2" />
                      </div>

                      <div>
                        <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          <MapPin className="h-3 w-3" /> Endereço
                        </p>
                        {(() => {
                          const e = influ.endereco;
                          const hasAny =
                            e &&
                            (e.rua ||
                              e.numero ||
                              e.bairro ||
                              e.cep ||
                              e.cidade ||
                              e.estado ||
                              e.pais);
                          if (!hasAny) {
                            return (
                              <p className="text-xs text-muted-foreground">
                                Nenhum endereço cadastrado.
                              </p>
                            );
                          }
                          const linha1 = [e!.rua, e!.numero].filter(Boolean).join(", ");
                          const linha2 = [e!.bairro, e!.complemento].filter(Boolean).join(" · ");
                          const linha3 = [
                            [e!.cidade, e!.estado].filter(Boolean).join(" / "),
                            e!.cep,
                          ]
                            .filter(Boolean)
                            .join(" · ");
                          return (
                            <div className="space-y-0.5 text-xs text-foreground">
                              {linha1 && <div>{linha1}</div>}
                              {linha2 && <div className="text-muted-foreground">{linha2}</div>}
                              {linha3 && <div className="text-muted-foreground">{linha3}</div>}
                            </div>
                          );
                        })()}
                      </div>

                      <div>
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                          Redes sociais
                        </p>
                        {influ.redes.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sem redes cadastradas.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {influ.redes.map((r) => {
                              const url = r.handle ? redeUrl(r.plataforma, r.handle) : null;
                              return (
                                <div
                                  key={r.id}
                                  className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
                                >
                                  <span className="inline-flex min-w-0 items-center gap-1.5">
                                    <PlatformIcon
                                      plataforma={r.plataforma}
                                      className="h-3.5 w-3.5 shrink-0"
                                    />
                                    <span className="truncate">
                                      {r.plataforma}
                                      {r.handle ? ` · ${r.handle}` : ""}
                                    </span>
                                    {r.id === influ.redePrincipalId && (
                                      <span className="shrink-0 rounded-full bg-brand-subtle px-1.5 py-0.5 text-[10px] font-medium text-brand">
                                        Principal
                                      </span>
                                    )}
                                  </span>
                                  <span className="shrink-0 text-muted-foreground">
                                    {r.seguidores ? formatSeguidores(r.seguidores) : "—"}
                                    {url && (
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-2 text-brand hover:underline"
                                      >
                                        abrir
                                      </a>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {influ.observacoes && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            Observações
                          </p>
                          <p className="text-xs text-foreground">{influ.observacoes}</p>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>

                  <p className="text-[11px] text-muted-foreground">
                    Dados bancários e documentos ficam registrados por campanha (aba de pagamento de
                    cada participação), não neste perfil global — evita duplicar contrato ou chave
                    PIX específicos de um combinado com informação genérica do influenciador.
                  </p>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </>
  );
}

function ResumoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1 truncate text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Field({ label, value, className }: { label: string; value?: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-foreground">{value || "Não informado"}</p>
    </div>
  );
}
