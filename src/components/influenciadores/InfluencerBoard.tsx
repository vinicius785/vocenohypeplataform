import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { barWidth } from "@/lib/audience-distribution";
import { ensureCampaignCycleId } from "@/lib/campaign-cycles";
import {
  AlertTriangle,
  ArrowLeft,
  AtSign,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Coins,
  Columns3,
  Download,
  ExternalLink,
  Facebook,
  FileText,
  Instagram,
  Linkedin,
  LayoutList,
  Loader2,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
  Twitter,
  Upload,
  User,
  Users,
  XCircle,
  Youtube,
  X,
  Music2,
  Eye,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DateField } from "@/components/ui/date-field";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { loadBank, saveBank, type BankInflu } from "@/lib/banco-influs-store";
import { findExistingBankInfluMatch } from "@/lib/bank-influ-match";
import { useConfirm } from "@/hooks/use-confirm";
import { entregaAjusteView } from "@/lib/entrega-ajustes";
import {
  ARQUIVO_CATEGORIA_LABEL,
  ENTREGA_FASE_COLUNA_ENTRY_STAGE,
  ENTREGA_FASE_COLUNA_LABEL,
  PRAZO_LABEL,
  agruparAnexos,
  entregaFaseColuna,
  entregaFocus,
  entregaStepper,
  entregaUnidadesLabel,
  legendaCanal,
  publicacaoAtrasoDias,
  removerVersao,
  substituirArquivo,
  versaoDoAnexo,
  type ArquivoTile,
  type EntregaFaseColuna,
  type PrazoCampo,
} from "@/lib/entrega-detail";
import { entregaLog, historicoEventos, historicoInfluEventos } from "@/lib/entrega-historico";
import {
  EntregaArquivos,
  EntregaEditorInline,
  EntregaHeader,
  EntregaHistorico,
  EntregaMenu,
  EntregaProximaAcao,
  EntregaStepper,
} from "./EntregaV2";
import { linkifyText } from "@/lib/linkify";
import {
  formatSeguidores,
  formatCompactSeguidores,
  formatCompactNumber,
  formatPercentBR,
} from "@/lib/format";
import { useMyAccess, hasPermission } from "@/lib/permissions";
import { IconButton } from "@/components/ui/icon-button";
import {
  PLATAFORMAS,
  platformDef,
  normalizeSocialInput,
  isDuplicateProfile,
  groupByPlatform,
  ensurePrimary,
  resolveProfileUrl,
  sanitizeHandleForDisplay,
} from "@/lib/social-profiles";
import type { CustomQuestionType } from "@/lib/inscricao-page";
import { HeaderContact } from "./InfluencerContact";
import { EntregasRows, SelectionFeedback } from "./InfluencerPanels";
import { RecursosMenu } from "./InfluencerResources";
import {
  availableResources,
  RESOURCE_LABEL,
  type ResourceItem,
  type ResourceKey,
} from "@/lib/influencer-resources";
import {
  clientFeedbacks,
  entregaNome,
  nextBestAction,
  type NextAction,
} from "@/lib/influencer-next-action";
import { CockpitTitle, KeyStats, QuietButton } from "./InfluencerCockpit";
import { BriefingEMateriais, ContextoTexto, Modulo } from "./ContextoCampanha";
import { AudienceInsights } from "@/components/shared/AudienceInsights";
import {
  FileLine,
  FinanceActivity,
  FinancePendencies,
  FinanceSection,
  FinanceSummary,
  StateDot,
  type PendencyItem,
  type SummaryCell,
} from "./InfluencerFinanceiro";
import {
  bankFields,
  contratoInfo,
  formatBRLValue,
  hasBankData,
  openFileUrl,
  paymentState,
  remuneracaoSummary,
  contractAttachedAt,
  formatIsoDate,
  paymentTone,
} from "@/lib/influencer-finance";
import { useInfluencerPaymentExecution } from "@/lib/financeiro-entries";
import { useNavigate } from "@tanstack/react-router";
import { describeInscricaoSnapshot } from "@/lib/inscricao-snapshot";

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

import {
  ALL_INFLUENCER_FIELDS,
  APROVACAO_LABEL,
  APROVACAO_TONE,
  BankInfo,
  ChecklistItem,
  DemographicEntry,
  ENTREGA_ACTION_LOG,
  type ActivityMeta,
  Entrega,
  EntregaAnexo,
  EntregaAnexoCategoria,
  INFLU_STATUS_DOT,
  INFLU_STATUS_PLURAL,
  Influ,
  InfluActivity,
  InfluAttachment,
  InfluencerFieldKey,
  NICHOS,
  PAG_TIPOS_ENTREGA,
  PagTipoEntrega,
  PagamentoConfigEntrega,
  PagamentoEntrega,
  PostMetrics,
  ProfileMetrics,
  Rede,
  RedeMetrics,
  addAnexoComVersao,
  addAnexosComVersao,
  addEntregaUnidade,
  approvalSlaOverdueDays,
  fmtBRL,
  fmtDate,
  formatPhoneBR,
  getCurrentAuthor,
  legacyAnexoCategoria,
  logInfluActivity,
  normalizePagamento,
  pagamentoResumo,
  producaoResumo,
  removeEntregaUnidade,
  splitEntregaExistente,
  todayISO,
  totalAceito,
} from "@/lib/influencer-model";
export * from "@/lib/influencer-model";
import {
  INFLU_STATUSES,
  INFLU_KANBAN_ORDER,
  INFLU_STATUS_LABEL,
  INFLU_STATUS_TONE,
  INFLU_STATUS_BORDER,
  ENTREGA_STAGE_TONE,
  entregaFaseConceitual,
  nextActionForInflu,
  NEXT_ACTOR_LABEL,
  canTransitionInflu,
  canReopenInfluApproval,
  isInfluencerEligibleForDeliveries,
  type InfluStatus,
  type NextActor,
} from "@/lib/campanha-status";
import { toast } from "sonner";
import {
  deriveEntregaNextStep,
  applyEntregaAction,
  type EntregaEngineActionKind,
} from "@/lib/entrega-engine";
import { NativeSelect } from "@/components/ui/native-select";
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

/* ------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------ */

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
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {f.label}
          </span>
          <FormattedNumberInput
            mode="integer"
            value={m[f.key]}
            onValueChange={(n) => onChange({ ...m, [f.key]: n })}
            className="h-7 w-full rounded border border-border bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      ))}
    </div>
  );
}

/** Editor de UMA distribuição (gênero, faixa etária, país, cidade): linhas "rótulo + %" com uma
 * barra fina viva logo abaixo de cada uma — a mesma linguagem de barras horizontais da leitura
 * (`AudienceInsights`), sem donut e sem gráfico à parte. */
function DemographicEntriesEditor({
  title,
  placeholder,
  entries,
  onChange,
  scale = "share",
  level = "section",
}: {
  title: string;
  placeholder: string;
  entries: DemographicEntry[];
  onChange: (entries: DemographicEntry[]) => void;
  scale?: "share" | "relative";
  level?: "section" | "sub";
}) {
  const max = Math.max(0, ...entries.map((e) => e.percentual || 0));
  return (
    <div className="min-w-0 space-y-2">
      <p
        className={
          level === "sub"
            ? "text-xs font-medium text-foreground"
            : "text-[11px] font-semibold uppercase tracking-wide text-text-secondary"
        }
      >
        {title}
      </p>
      {entries.map((entry) => (
        <div key={entry.id} className="space-y-1">
          <div className="flex items-center gap-2">
            <input
              value={entry.label}
              onChange={(e) =>
                onChange(
                  entries.map((x) => (x.id === entry.id ? { ...x, label: e.target.value } : x)),
                )
              }
              placeholder={placeholder}
              aria-label={`${title}: nome`}
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
                aria-label={`${title}: percentual`}
                className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-right text-xs outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <RemoveBtn onClick={() => onChange(entries.filter((x) => x.id !== entry.id))} />
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className="h-full rounded-full bg-foreground/50"
              style={{ width: `${barWidth(entry.percentual, max, scale)}%` }}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...entries, { id: crypto.randomUUID(), label: "", percentual: 0 }])
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> Adicionar
      </button>
    </div>
  );
}

/** Métricas de uma única rede (sub-editor usado por `ProfileMetricsEditor` uma vez por rede
 * selecionada), em duas partes que nunca se misturam: MÉTRICAS (números do perfil) e AUDIÊNCIA
 * (gênero → faixa etária → localização), sem cards dentro de cards. */
function RedeMetricsFields({
  plataforma,
  seguidores,
  onChangeSeguidores,
  value,
  onChange,
}: {
  plataforma?: string;
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
    { key: "taxaAtencaoInicial", label: "Atenção inicial", suffix: "%" },
  ];
  const fieldLabel = "block text-[11px] font-semibold uppercase tracking-wide text-text-secondary";
  const fieldInput =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";
  const followersText = formatSeguidores(seguidores);

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-label="Métricas">
        <FieldLabel title="Métricas" hint="Números do perfil nesta rede." />
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className={fieldLabel}>Seguidores</span>
            <input
              value={followersText}
              onChange={(e) => onChangeSeguidores(e.target.value.replace(/\D/g, ""))}
              placeholder="0"
              inputMode="numeric"
              className={fieldInput}
            />
          </label>
          {SCALAR_FIELDS.map((f) => (
            <label key={f.key} className="space-y-1">
              <span className={fieldLabel}>{f.label}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  value={(m[f.key] as number | undefined) ?? ""}
                  onChange={(e) =>
                    set({ [f.key]: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                  className={fieldInput}
                />
                {f.suffix && <span className="text-xs text-muted-foreground">{f.suffix}</span>}
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-5 border-t border-border pt-5" aria-label="Audiência">
        <div>
          <FieldLabel
            title="Audiência"
            hint="Distribuição percentual do público real dessa rede."
          />
          {(plataforma || followersText) && (
            <p className="mt-1 text-sm text-foreground">
              {[plataforma, followersText && `${followersText} seguidores`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <DemographicEntriesEditor
          title="Gênero"
          placeholder="Ex: Feminino"
          entries={m.genero ?? []}
          onChange={(genero) => set({ genero })}
        />
        <DemographicEntriesEditor
          title="Faixa etária"
          placeholder="Ex: 25–34"
          entries={m.faixaEtaria ?? []}
          onChange={(faixaEtaria) => set({ faixaEtaria })}
        />
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            Localização
          </p>
          <div className="grid gap-5 @md:grid-cols-2">
            <DemographicEntriesEditor
              title="Principais países"
              placeholder="Ex: Brasil"
              entries={m.paises ?? []}
              onChange={(paises) => set({ paises })}
              scale="relative"
              level="sub"
            />
            <DemographicEntriesEditor
              title="Principais cidades"
              placeholder="Ex: São Paulo"
              entries={m.cidades ?? []}
              onChange={(cidades) => set({ cidades })}
              scale="relative"
              level="sub"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

/** Resumo compacto (só leitura) de uma rede — número compacto pt-BR
 * ("878,8 mil seguidores"), nunca substitui o valor editável abaixo (esse
 * continua no formato bruto/agrupado, pra não perder precisão ao editar). */
function RedeMetricsCompactSummary({
  seguidores,
  metrics,
}: {
  seguidores?: string;
  metrics?: RedeMetrics;
}) {
  const parts: string[] = [];
  const seg = formatCompactSeguidores(seguidores);
  if (seg) parts.push(`${seg} seguidores`);
  if (metrics?.interacoes != null)
    parts.push(`${formatCompactNumber(metrics.interacoes)} interações`);
  if (metrics?.visualizacoes != null)
    parts.push(`${formatCompactNumber(metrics.visualizacoes)} visualizações`);
  if (metrics?.taxaInteracao != null)
    parts.push(`${formatPercentBR(metrics.taxaInteracao)} de taxa de interação`);
  if (parts.length === 0) return null;
  return <p className="text-xs text-muted-foreground">{parts.join(" · ")}</p>;
}

/** Métricas do perfil — uma rede social só (o caso comum) mostra o card
 * direto, sem seletor nenhum; com mais de uma rede cadastrada, um seletor
 * compacto de pills troca qual rede está em foco, em vez de empilhar todas
 * as métricas de todas as redes ao mesmo tempo (ficava comprido demais e
 * confuso sobre a qual rede cada bloco pertencia). */
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (redes.length === 0) {
    return (
      <EmptyHint text="Adicione redes sociais acima antes de preencher as métricas — cada rede tem suas próprias métricas." />
    );
  }

  const activeRede = redes.find((r) => r.id === selectedId) ?? redes[0];

  return (
    <div className="space-y-4">
      {redes.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Rede social">
          {redes.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={activeRede.id === r.id}
              onClick={() => setSelectedId(r.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                activeRede.id === r.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              <PlatformIcon plataforma={r.plataforma} className="h-3.5 w-3.5" />
              {r.handle ? `@${r.handle}` : r.plataforma}
            </button>
          ))}
        </div>
      )}
      <div className="@container space-y-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <PlatformIcon plataforma={activeRede.plataforma} className="h-3.5 w-3.5" />
            {activeRede.handle ? `@${activeRede.handle}` : activeRede.plataforma}
          </p>
          <RedeMetricsCompactSummary
            seguidores={activeRede.seguidores}
            metrics={porRede[activeRede.id]}
          />
        </div>
        <RedeMetricsFields
          plataforma={activeRede.plataforma}
          seguidores={activeRede.seguidores}
          onChangeSeguidores={(seguidores) =>
            onChangeRedes(redes.map((x) => (x.id === activeRede.id ? { ...x, seguidores } : x)))
          }
          value={porRede[activeRede.id]}
          onChange={(m) => onChange({ ...value, porRede: { ...porRede, [activeRede.id]: m } })}
        />
      </div>
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

/** Dados de NPS por influenciador (link/status), só passados por Campanhas
 * (`CampanhasSection.tsx`) — ausente em Projetos, onde o recurso fica
 * totalmente invisível, sem tocar nesse fluxo. */
export type InfluNpsBoardProp = {
  linksByInfluId: Record<string, { token: string; respondido: boolean; score: number | null }>;
  onCopyLink: (influId: string) => void;
};

export function InfluencerBoard({
  influs,
  onChange,
  exportName,
  allowedFields,
  headerExtra,
  defaultCicloMes,
  campanhaId,
  nps,
  hideTitle = false,
}: {
  influs: Influ[];
  onChange: (next: Influ[]) => void;
  exportName: string;
  allowedFields?: InfluencerFieldKey[];
  /** NPS por influenciador aprovado (link de resposta + status) — só
   * presente quando o board é renderizado dentro de uma campanha. */
  nps?: InfluNpsBoardProp;
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
  /** Campanha dona do board. Com `defaultCicloMes`, é usada para gravar o vínculo REAL da
   * participação ao mês (`campaign_cycle_id`) quando um influenciador é adicionado. O mês nunca é
   * escolhido no detalhe do influenciador: ele é o mês que está selecionado na campanha no
   * momento em que o influenciador entra. */
  campanhaId?: string;
  /** Quando o board vive numa seção que já tem título (página do Projeto). */
  hideTitle?: boolean;
}) {
  const fields = allowedFields ?? ALL_INFLUENCER_FIELDS;
  const access = useMyAccess();
  // Dados bancários (PIX/conta) exigem a permissão dedicada
  // "influenciadores:bancario", separada da geral "influenciadores" — todo
  // render site que hoje já checa `has("bancario")` fica automaticamente
  // gated de verdade, sem precisar tocar em cada um.
  const has = (k: InfluencerFieldKey) =>
    fields.includes(k) && (k !== "bancario" || hasPermission(access, "influenciadores:bancario"));
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
  const changeStatus = (influId: string, status: InfluStatus) => {
    const current = latestInflusRef.current.find((x) => x.id === influId);
    if (current && current.status === "APROVADO" && status !== "APROVADO") {
      const reopen = canReopenInfluApproval(
        current.status,
        current.entregas.map((e) => e.stage),
      );
      if (!reopen.ok) {
        toast.error(reopen.motivo);
        return;
      }
    }
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
  };

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
      /** Vários arquivos de uma vez (ex: Story de N unidades) — todos
       * entram como IRMÃOS na mesma versão, nunca um substituindo o outro. */
      anexos?: { categoria: EntregaAnexoCategoria; nome: string; url: string }[];
    },
  ) => {
    const next = latestInflusRef.current.map((x) => {
      if (x.id !== influId) return x;
      const entrega = x.entregas.find((e) => e.id === entregaId);
      if (!entrega) return x;
      const anexos = opts?.anexos
        ? addAnexosComVersao(entrega.anexos ?? [], opts.anexos[0].categoria, opts.anexos)
        : opts?.anexo
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
      const material: EntregaAnexoCategoria | null = action.endsWith("roteiro")
        ? "Roteiro"
        : action.endsWith("conteudo")
          ? "Conteúdo final"
          : null;
      const versao = material
        ? (anexos ?? []).reduce(
            (m, a) => (a.categoria === material ? Math.max(m, a.versao ?? 1) : m),
            0,
          )
        : 0;
      return pushActivity(
        {
          ...x,
          entregas: x.entregas.map((e) => (e.id === entregaId ? { ...e, anexos, ...patch } : e)),
        },
        `${ENTREGA_ACTION_LOG[action]} — "${label}"`,
        entregaId,
        undefined,
        material ? { material, ...(versao > 0 ? { versao } : {}) } : undefined,
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
  // Grava o ciclo real (`campaign_cycle_id`) das participações recém-adicionadas, em segundo plano:
  // o `cicloMes` já foi carimbado na criação, então a tela não espera por isso.
  const stampCycle = (ids: string[]) => {
    if (!campanhaId || !defaultCicloMes) return;
    void ensureCampaignCycleId(campanhaId, defaultCicloMes).then((cycleId) => {
      if (!cycleId) return;
      applyInflusChange(
        latestInflusRef.current.map((x) =>
          ids.includes(x.id) && !x.campaignCycleId ? { ...x, campaignCycleId: cycleId } : x,
        ),
      );
    });
  };

  const create = (i: Influ) => {
    const now = new Date().toISOString();
    const withStamps = { ...i, createdAt: now, updatedAt: now, cicloMes: defaultCicloMes };
    applyInflusChange([...latestInflusRef.current, withStamps]);
    stampCycle([withStamps.id]);
    addToBankIfMissing(withStamps);
  };

  // Um influenciador criado direto de dentro de uma campanha só ficava
  // salvo em `campanha_influenciadores` — nunca chegava no Banco de
  // Influenciadores geral, então "sumia" pra quem esperava achá-lo lá
  // (só o caminho inverso existia, `BankPickerDialog` abaixo). Dedupe por
  // nome — mesmo critério já usado por `alreadyAdded` no picker — evita
  // duplicar quando o nome já existe no banco (edição depois só acontece
  // no banco em si, não fica ressincronizando a cada mudança aqui).
  const addToBankIfMissing = (i: Influ) => {
    const key = i.nome.trim().toLowerCase();
    if (!key) return;
    const bank = loadBank();
    if (bank.some((b) => b.nome.trim().toLowerCase() === key)) return;
    saveBank([
      ...bank,
      { id: crypto.randomUUID(), nome: i.nome, foto: i.foto, nicho: i.nicho, redes: i.redes },
    ]);
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
    const current = latestInflusRef.current.find((x) => x.id === influId);
    if (current && current.status === "APROVADO" && status !== "APROVADO") {
      const reopen = canReopenInfluApproval(
        current.status,
        current.entregas.map((e) => e.stage),
      );
      if (!reopen.ok) {
        toast.error(reopen.motivo);
        return;
      }
    }
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

  // Resumo por status no cabeçalho — só contagem dos 5 status que já
  // existem (`INFLU_STATUSES`), na ordem do funil, omitindo os zerados.
  const statusSummary = INFLU_STATUSES.map((status) => ({
    status,
    count: influs.filter((i) => i.status === status).length,
  })).filter((x) => x.count > 0);

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
          {!hideTitle && (
            <p
              role="heading"
              aria-level={2}
              className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Influenciadores
            </p>
          )}
          <p className={`${hideTitle ? "" : "mt-1 "}text-sm text-muted-foreground`}>
            {influs.length} {influs.length === 1 ? "adicionado" : "adicionados"}
          </p>
          {statusSummary.length > 0 && (
            <ul
              aria-label="Influenciadores por status"
              className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
            >
              {statusSummary.map(({ status, count }) => (
                <li key={status} className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${INFLU_STATUS_DOT[status]}`}
                  />
                  <span className="font-medium tabular-nums text-foreground">{count}</span>
                  {count === 1
                    ? INFLU_STATUS_LABEL[status].toLowerCase()
                    : INFLU_STATUS_PLURAL[status]}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar influenciador..."
              aria-label="Buscar influenciador"
              className="h-8 w-full rounded-md border border-border bg-background pl-8 sm:w-44 pr-2.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
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
                <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                      <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold">
                        {reprovadosCount}
                      </span>
                      {hideReprovados && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  </>
                )}
                <div className="my-1 border-t border-border" />
                <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                        nps={nps}
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
        // Grade responsiva (rodada corretiva forte) — substitui o carrossel
        // horizontal com scroll-snap, que cortava o último card na lateral.
        // Nunca scroll horizontal aqui; os cards quebram pra próxima linha.
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredInflus.map((i) => (
            <InfluCard
              key={i.id}
              influ={i}
              has={has}
              onView={() => setViewing(i)}
              onStatus={(status) => changeStatus(i.id, status)}
              onRemove={() => void removeInflu(i.id)}
              nps={nps}
            />
          ))}
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
        <InfluencerWorkspaceSheet
          influ={viewing}
          has={has}
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
          nps={nps}
          campanhaId={campanhaId}
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
        currentInflus={influs}
        onAdd={(picked) => {
          const now = new Date().toISOString();
          const added: Influ[] = picked.map(
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
          );
          applyInflusChange([...latestInflusRef.current, ...added]);
          stampCycle(added.map((x) => x.id));
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
  nps,
}: {
  influ: Influ;
  has: (k: InfluencerFieldKey) => boolean;
  onView: () => void;
  onStatus: (s: InfluStatus) => void;
  onRemove: () => void;
  nps?: InfluNpsBoardProp;
  /** Quando o board vive numa seção que já tem título (página do Projeto). */
  hideTitle?: boolean;
}) {
  const npsLink = nps?.linksByInfluId[influ.id];
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
  const overdueDays = approvalSlaOverdueDays(influ);
  const elegivel = isInfluencerEligibleForDeliveries(influ.status);
  const producao = has("entregas") && elegivel ? producaoResumo(influ.entregas) : null;
  // Próxima data de postagem já cadastrada numa entrega ainda não
  // publicada — só exibe o dado existente (`dataPostagem`), sem regra nova
  // de atraso.
  const proximaPostagem =
    has("entregas") && elegivel
      ? influ.entregas
          .filter((e) => e.stage !== "PUBLICADA" && e.dataPostagem)
          .map((e) => e.dataPostagem!)
          .sort()[0]
      : undefined;
  const motivoRecusa = approval?.status === "reprovado" ? approval.motivo : undefined;
  const budget = firstCurrencyResposta(influ.inscricaoRespostas);

  return (
    // Card denso (refatoração da Home da campanha): identidade + status +
    // UMA linha de dados operacionais (conteúdo, valor, próxima postagem),
    // sem empilhar 3 faixas com bordas. O card inteiro é clicável via
    // <article role="button">; cada ação interna para a propagação.
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
      aria-label={`Ver detalhes de ${influ.nome || "influenciador"}`}
      className="flex w-full cursor-pointer flex-col rounded-xl border border-border/60 bg-background transition-colors hover:border-foreground/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="flex items-start gap-3 p-3 pb-2">
        <div className="relative h-10 w-10 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
            {influ.foto ? (
              <img src={influ.foto} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {influ.nome || "Sem nome"}
          </p>
          <div className="flex min-w-0 items-center gap-x-1.5 text-xs text-muted-foreground">
            {has("redes") &&
              (() => {
                const resolved = ensurePrimary(influ.redes);
                const principal = resolved.find((r) => r.isPrimary) ?? resolved[0];
                const extra = resolved.length - 1;
                if (!principal) return <span className="truncate">Sem rede cadastrada</span>;
                const label = sanitizeHandleForDisplay(principal.plataforma, principal.handle);
                return (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <span className="shrink-0">{platformIcon(principal.plataforma)}</span>
                    <span className="truncate">@{label || principal.plataforma}</span>
                    {extra > 0 && (
                      <span className="shrink-0 text-[11px] font-medium">+{extra}</span>
                    )}
                  </span>
                );
              })()}
            {influ.nicho && has("redes") && <span aria-hidden>·</span>}
            {influ.nicho && <span className="truncate">{influ.nicho}</span>}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={stop}
              onKeyDown={stop}
              aria-label={`Mais ações para ${influ.nome || "influenciador"}`}
              className="relative z-10 -m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={stop}>
            <DropdownMenuItem onSelect={onView}>Ver detalhes</DropdownMenuItem>
            {npsLink && (
              <DropdownMenuItem onSelect={() => nps?.onCopyLink(influ.id)}>
                Copiar link NPS
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={onRemove}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {has("status") && (
        <div
          className="flex flex-wrap items-center gap-1.5 px-3 pb-2"
          onClick={stop}
          onKeyDown={stop}
        >
          <InfluStatusPill value={influ.status} onChange={onStatus} />
          <NextActionBadge actor={nextActionForInflu(influ.status)} />
          {npsLink && (
            <span className="text-[11px] text-muted-foreground">
              NPS · {npsLink.respondido ? `Respondido · ${npsLink.score}` : "Link disponível"}
            </span>
          )}
          {budget ? (
            <span
              className="ml-auto text-[11px] font-medium text-foreground"
              title="Valor informado na inscrição"
            >
              {formatBRL(budget)}
            </span>
          ) : null}
        </div>
      )}

      {(overdueDays || motivoRecusa) && (
        <div className="space-y-1 px-3 pb-2">
          {overdueDays ? (
            <p className="flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 shrink-0" /> Aguardando aprovação há {overdueDays}{" "}
              dias
            </p>
          ) : null}
          {motivoRecusa ? (
            <p
              className="line-clamp-2 text-[11px] text-red-700 dark:text-red-400"
              title={motivoRecusa}
            >
              <span className="font-medium">Motivo da recusa:</span> {motivoRecusa}
            </p>
          ) : null}
        </div>
      )}

      {(producao ||
        (has("entregas") && !elegivel) ||
        has("pagamentos") ||
        (has("contrato") && influ.contrato)) && (
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          {producao && producao.total > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="font-medium tabular-nums text-foreground/80">
                Conteúdo {producao.publicadas}/{producao.total}
              </span>
              publicados
              <span
                className="h-1 w-10 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={`${producao.publicadas} de ${producao.total} conteúdos publicados`}
                aria-valuenow={producao.publicadas}
                aria-valuemin={0}
                aria-valuemax={producao.total}
              >
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${Math.round((producao.publicadas / producao.total) * 100)}%` }}
                />
              </span>
            </span>
          )}
          {producao && producao.total === 0 && <span>Sem entregas cadastradas</span>}
          {has("entregas") && !elegivel && <span>Não elegível para entregas</span>}
          {proximaPostagem && (
            <span>
              Próxima postagem ·{" "}
              <span className="font-medium text-foreground/80">{fmtDate(proximaPostagem)}</span>
            </span>
          )}
          {has("pagamentos") && (
            <span className="ml-auto">
              Valor{" "}
              <span className="font-medium text-foreground/80">
                {totalPago > 0 ? fmtBRL(totalPago) : "—"}
              </span>
            </span>
          )}
          {has("contrato") && influ.contrato && (
            <a
              href={influ.contrato}
              download
              onClick={stop}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Contrato
            </a>
          )}
        </div>
      )}
    </article>
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
  const [adding, setAdding] = useState(false);
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
    <section aria-label="Checklist" className="space-y-1.5">
      <CockpitTitle>
        Checklist
        {checklist.length > 0 && (
          <span className="ml-1.5 font-normal normal-case tracking-normal">
            · {doneCount}/{checklist.length}
          </span>
        )}
      </CockpitTitle>

      {checklist.length === 0 && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="-mx-2 block w-[calc(100%+1rem)] cursor-pointer rounded-md px-2 py-1 text-left text-sm text-text-secondary transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Nenhum item no checklist.
        </button>
      )}
      {checklist.length > 0 && (
        <ul className="space-y-1">
          {checklist.map((item) => (
            <li key={item.id} className="group flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.done}
                aria-label={item.done ? "Desmarcar item" : "Marcar item como feito"}
                onChange={() =>
                  onChange(checklist.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)))
                }
                className="h-4 w-4 shrink-0 cursor-pointer accent-foreground"
              />
              <input
                value={item.text}
                aria-label="Texto do item"
                onChange={(e) =>
                  onChange(
                    checklist.map((c) => (c.id === item.id ? { ...c, text: e.target.value } : c)),
                  )
                }
                className={`min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-sm outline-none transition-colors hover:bg-muted/50 focus:bg-muted/50 ${
                  item.done ? "text-text-secondary line-through" : "text-foreground"
                }`}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Mais ações do item"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => onChange(checklist.filter((c) => c.id !== item.id))}
                    className="text-destructive focus:text-destructive"
                  >
                    Remover item
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex items-center gap-3">
          <input
            autoFocus
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
              if (e.key === "Escape") {
                setNewText("");
                setAdding(false);
              }
            }}
            placeholder="Novo item... (Enter adiciona)"
            aria-label="Novo item do checklist"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {checklist.length > 0 && (
            <QuietButton onClick={() => void applyToAll()}>Aplicar a todos</QuietButton>
          )}
          <QuietButton
            onClick={() => {
              addItem();
              setAdding(false);
            }}
          >
            Concluir
          </QuietButton>
        </div>
      ) : (
        checklist.length > 0 && (
          <QuietButton onClick={() => setAdding(true)}>+ Adicionar item</QuietButton>
        )
      )}
      {confirmDialog}
    </section>
  );
}

/** Pill do status individual de uma entrega — dropdown customizado (não um
 * `<NativeSelect>` nativo, que renderia como uma caixa cinza do navegador). */
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
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold shadow-sm ${INFLU_STATUS_TONE[value]}`}
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
    // Azul só quando a bola está com o time (é a nossa ação); cliente e
    // influenciador são só contexto, em neutro.
    hype: "bg-brand-subtle text-text-brand",
    cliente: "bg-muted text-muted-foreground",
    influenciador: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone[actor]}`}
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
  anexos?: { categoria: EntregaAnexoCategoria; nome: string; url: string }[];
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
  const { confirm, confirmDialog } = useConfirm();

  const removeEntrega = async (e: Entrega): Promise<boolean> => {
    const label = e.titulo ? `${e.tipo} · ${e.titulo}` : e.tipo || "esta entrega";
    if (!(await confirm(`Remover "${label}"? Isso apaga o histórico e os anexos dela.`))) {
      return false;
    }
    onChange(entregas.filter((x) => x.id !== e.id));
    return true;
  };

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
    const anexos = opts?.anexos
      ? addAnexosComVersao(e.anexos ?? [], opts.anexos[0].categoria, opts.anexos)
      : opts?.anexo
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
            const aguardandoCliente = !step.action && step.responsavel === "cliente";
            const stage = e.stage ?? "ROTEIRO_PRODUCAO";
            const fase = entregaFaseConceitual(stage);
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
                  {!e.grupoId && (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      · {e.quantidade} {e.quantidade === 1 ? "unidade" : "unidades"}
                    </span>
                  )}
                </p>

                <div className="flex items-center gap-1.5 text-xs">
                  <span
                    className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${ENTREGA_STAGE_TONE[stage]}`}
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
                    <span className="text-text-secondary">—</span>
                  )}
                </div>

                <div className="text-[11px] text-muted-foreground">
                  {prazo ? `${prazo.label}: ${formatDataCurta(prazo.data)}` : ""}
                </div>

                <div onClick={(ev) => ev.stopPropagation()} className="justify-self-end">
                  <button
                    type="button"
                    onClick={() => void removeEntrega(e)}
                    aria-label="Remover entrega"
                    className="rounded p-1.5 text-text-secondary hover:bg-destructive/10 hover:text-destructive"
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
          onRemove={async () => {
            if (await removeEntrega(selected)) setSelectedId(null);
          }}
          onSplitUnidade={(delta) => {
            if (delta === 1) {
              onChange(addEntregaUnidade(entregas, selected));
              return;
            }
            const result = removeEntregaUnidade(entregas, selected);
            if (!result) return;
            if (result.blocked) toast.error(result.blocked);
            onChange(result.next);
          }}
          onSplitExistente={() => {
            const novos = splitEntregaExistente(selected);
            if (!novos) return;
            onChange([...entregas.filter((x) => x.id !== selected.id), ...novos]);
          }}
        />
      )}
      {confirmDialog}
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
            className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${APROVACAO_TONE[value.aprovacao]}`}
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

type InscricaoResposta = NonNullable<Influ["inscricaoRespostas"]>[number];

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/** Interpreta um valor de resposta "moeda" — aceita tanto `"3300"` quanto
 * `"3.300,00"` (formato brasileiro digitado no formulário público). */
function parseCurrencyValue(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Primeira resposta do tipo "moeda" — usada tanto no resumo do drawer
 * quanto no card do Kanban, pra "orçamento" nunca precisar de um campo
 * dedicado novo em `Influ` (o valor já vem de uma pergunta customizada). */
function firstCurrencyResposta(respostas?: InscricaoResposta[]): number | null {
  if (!respostas) return null;
  for (const r of respostas) {
    if (r.fieldType !== "moeda") continue;
    if (typeof r.value !== "string") continue;
    const n = parseCurrencyValue(r.value);
    if (n !== null) return n;
  }
  return null;
}

/** Ícone por rede — usado tanto no editor quanto nos cards de resumo/
 * Kanban, pra nunca depender só do nome da plataforma em texto. */
function platformIcon(plataforma: string) {
  const cls = "h-3.5 w-3.5 shrink-0 text-muted-foreground";
  switch (plataforma) {
    case "Instagram":
      return <Instagram className={cls} />;
    case "TikTok":
      return <Music2 className={cls} />;
    case "YouTube":
      return <Youtube className={cls} />;
    case "X":
      return <Twitter className={cls} />;
    case "LinkedIn":
      return <Linkedin className={cls} />;
    case "Facebook":
      return <Facebook className={cls} />;
    default:
      return <AtSign className={cls} />;
  }
}

/** Editor de redes sociais — mesmos toggles de plataforma + handle usados
 * na criação, reaproveitados aqui pra edição imediata de um influenciador
 * já existente. */
/**
 * Editor de redes sociais com suporte a MÚLTIPLOS perfis por plataforma
 * (ex.: 2 contas de Instagram) — agrupa por `plataforma`
 * (`groupByPlatform`), cada grupo tem "+ Adicionar outro {Rede}" em vez
 * de um botão que só liga/desliga uma entrada única. Bloqueia duplicata
 * exata na mesma plataforma (`isDuplicateProfile`) com erro inline no
 * item, sem apagar o texto digitado. "Principal" só aparece quando o
 * grupo tem 2+ perfis.
 */
function RedesEditor({ redes, onChange }: { redes: Rede[]; onChange: (next: Rede[]) => void }) {
  const [dupError, setDupError] = useState<string | null>(null);
  const groups = groupByPlatform(redes);
  const usedPlatforms = new Set(groups.map(([p]) => p));
  const availableToAdd = PLATAFORMAS.filter((p) => !usedPlatforms.has(p.key));

  const addPlatform = (plataforma: string) => {
    onChange([...redes, { id: crypto.randomUUID(), plataforma, handle: "" }]);
  };
  const addAnother = (plataforma: string) => {
    onChange([...redes, { id: crypto.randomUUID(), plataforma, handle: "" }]);
  };
  const updateHandle = (id: string, value: string) => {
    setDupError(null);
    onChange(redes.map((r) => (r.id === id ? { ...r, handle: value } : r)));
  };
  const commitHandle = (r: Rede) => {
    const { handle, profileUrl } = normalizeSocialInput(r.plataforma, r.handle);
    if (isDuplicateProfile(redes, r.plataforma, handle, r.id)) {
      setDupError(r.id);
      return;
    }
    onChange(redes.map((x) => (x.id === r.id ? { ...x, handle, profileUrl } : x)));
  };
  const remove = (id: string) => onChange(redes.filter((r) => r.id !== id));
  const setPrimary = (plataforma: string, id: string) =>
    onChange(
      redes.map((r) => (r.plataforma === plataforma ? { ...r, isPrimary: r.id === id } : r)),
    );

  return (
    <div className="space-y-3">
      {availableToAdd.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availableToAdd.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => addPlatform(p.key)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Plus className="h-3 w-3" />
              {p.label}
            </button>
          ))}
        </div>
      )}
      {groups.length === 0 ? (
        <EmptyHint text="Nenhuma rede selecionada." />
      ) : (
        <div className="space-y-4">
          {groups.map(([plataforma, items]) => {
            const def = platformDef(plataforma);
            const resolved = ensurePrimary(items);
            return (
              <div key={plataforma} className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground/80">{plataforma}</p>
                <div className="space-y-1.5">
                  {resolved.map((r) => (
                    <div key={r.id} className="space-y-1">
                      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                        {platformIcon(plataforma)}
                        {def?.usesHandle && (
                          <span className="text-sm text-muted-foreground">@</span>
                        )}
                        <input
                          value={r.handle}
                          onChange={(e) => updateHandle(r.id, e.target.value)}
                          onBlur={() => commitHandle(r)}
                          placeholder={def?.placeholder ?? "usuario"}
                          className="flex-1 bg-transparent text-sm outline-none"
                        />
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setPrimary(plataforma, r.id)}
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              r.isPrimary
                                ? "bg-brand-subtle text-text-brand"
                                : "text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {r.isPrimary ? "Principal" : "Definir como principal"}
                          </button>
                        )}
                        {resolveProfileUrl(r) && (
                          <IconButton
                            label="Abrir perfil"
                            onClick={() =>
                              window.open(resolveProfileUrl(r)!, "_blank", "noopener,noreferrer")
                            }
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </IconButton>
                        )}
                        <IconButton label="Remover perfil" onClick={() => remove(r.id)}>
                          <X className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                      {dupError === r.id && (
                        <p className="px-1 text-[11px] text-destructive">
                          Já existe um perfil igual nesta plataforma.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => addAnother(plataforma)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                  Adicionar outro {plataforma}
                </button>
              </div>
            );
          })}
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

/** Conteúdo puro do detalhe de uma entrega (V2) — sem casca de `Sheet`/`Dialog` própria, para ser
 * renderizado tanto dentro de um `Sheet` isolado (`EntregaDetailSheet`, formulário de criação) quanto
 * embutido no MESMO workspace lateral do influenciador (sem empilhar um segundo overlay).
 *
 * Aqui mora só a LÓGICA (upload, motor de ações, confirmação, persistência via `onChange`); o que
 * mostrar vem de `lib/entrega-detail.ts` / `lib/entrega-historico.ts` e o desenho de `EntregaV2.tsx`.
 * Cinco blocos: cabeçalho → progresso → próxima ação → arquivos → histórico (o feedback do cliente é
 * um evento do histórico, não uma seção). `onChange` aceita um texto de log opcional, gravado na
 * Atividade no MESMO patch (nunca em dois patches separados, para um não sobrescrever o outro). */
function EntregaDetailBody({
  influNome,
  influFoto,
  influRede,
  entrega,
  influActivity,
  onBack,
  onClose,
  onChange,
  onRunAction,
  onSetStage,
  onRemove,
  onSplitUnidade,
  onSplitExistente,
}: {
  influNome?: string;
  influFoto?: string;
  /** Rede principal do influenciador — vira "@handle · Instagram" no cabeçalho e define o limite da legenda. */
  influRede?: { plataforma: string; handle?: string };
  entrega: Entrega;
  influActivity: InfluActivity[];
  /** Presente no workspace do influenciador: mostra a seta "Voltar ao influenciador". */
  onBack?: () => void;
  /** Fecha o painel (o cabeçalho desenha o próprio X). */
  onClose?: () => void;
  onChange: (patch: Partial<Entrega>, log?: string, meta?: ActivityMeta) => void;
  onRunAction: (action: EntregaEngineActionKind, opts?: EntregaActionOpts) => void;
  onSetStage: (coluna: EntregaFaseColuna) => void;
  onRemove: () => void;
  /** Divide esta entrega em unidades independentes (+1) ou remove a
   * última unidade do grupo (-1) — cada unidade aprovada separadamente
   * pelo cliente, em vez de um `quantidade` só aprovado em bloco. */
  onSplitUnidade: (delta: 1 | -1) => void;
  /** Divide uma entrega que JÁ TEM vários arquivos irmãos enviados (ex:
   * "3 Storys" com 3 anexos) em N entregas independentes, uma por
   * arquivo — ver `splitEntregaExistente`. */
  onSplitExistente: () => void;
}) {
  const stage = entrega.stage ?? "ROTEIRO_PRODUCAO";
  const publicada = stage === "PUBLICADA";
  const nome = entregaNome(entrega);
  const focus = entregaFocus(entrega);
  const stepper = entregaStepper(entrega);
  const atrasoDias = publicacaoAtrasoDias(entrega, todayISO());
  const eventos = historicoEventos(influActivity, entrega);
  const ajuste = entregaAjusteView(entrega);

  // Os uploads são assíncronos: quando terminam, o painel já pode ter mudado. Tudo que grava depois
  // de um `await` parte da entrega e do `onChange` MAIS RECENTES, não dos capturados no clique.
  const entregaRef = useRef(entrega);
  entregaRef.current = entrega;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const fileRef = useRef<HTMLInputElement>(null);
  const arquivosInputRef = useRef<HTMLInputElement>(null);
  const substituirInputRef = useRef<HTMLInputElement>(null);
  const pendingCategoria = useRef<EntregaAnexoCategoria>("Roteiro");
  const pendingSubstituir = useRef<EntregaAnexo | null>(null);
  const historicoRef = useRef<HTMLElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [enviandoCategoria, setEnviandoCategoria] = useState<EntregaAnexoCategoria | null>(null);
  const [arquivosError, setArquivosError] = useState("");
  const [editando, setEditando] = useState(false);
  const [editandoPrazos, setEditandoPrazos] = useState(false);
  const [publicacaoAberta, setPublicacaoAberta] = useState(false);
  const [verTodoHistorico, setVerTodoHistorico] = useState(false);
  const [feedbackAberto, setFeedbackAberto] = useState<string | null>(null);
  const { confirm: confirmAction, confirmDialog: entregaConfirmDialog } = useConfirm();

  const revelarFeedback = (id: string) => {
    setFeedbackAberto(id);
    window.setTimeout(() => {
      historicoRef.current
        ?.querySelector(`[data-evento-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  };

  // Ação principal — o motor já disse qual é a única válida agora (`focus.primary`). "Adicionar
  // roteiro"/"conteúdo final" abrem o seletor antes de chamar o motor; o resto chama direto.
  const handlePrimary = () => {
    const p = focus.primary;
    if (!p) return;
    switch (p.kind) {
      case "upload":
        fileRef.current?.click();
        return;
      case "nova_versao":
        pickArquivo(p.categoria);
        return;
      case "publicacao":
        setPublicacaoAberta(true);
        return;
      case "post":
        window.open(p.url, "_blank", "noopener,noreferrer");
        return;
      case "ajuste": {
        if (p.step === "reconhecer") {
          // "Ver feedback" é o reconhecimento dos ajustes no motor; o texto abre no histórico.
          const pendente = eventos.find((e) => e.kind === "feedback" && e.pendente);
          onRunAction(p.action);
          if (pendente) revelarFeedback(pendente.id);
          return;
        }
        onRunAction(p.action);
        return;
      }
      case "engine":
        onRunAction(p.action);
        return;
    }
  };

  // Alternativa discreta: reenviar SEM arquivo novo — sempre com confirmação.
  const handleSecondary = async () => {
    const s = focus.secondary;
    if (!s) return;
    const etapa = ajuste?.etapa === "conteudo" ? "conteúdo final" : "roteiro";
    const yes = await confirmAction(
      `Você ainda não adicionou uma nova versão do ${etapa} desde o feedback do cliente. Reenviar para aprovação mesmo assim?`,
      { title: "Reenviar sem arquivo novo?", confirmLabel: "Reenviar mesmo assim" },
    );
    if (yes) onRunAction(s.action);
  };

  // Aceita vários arquivos de uma vez (ex: Story de 3 unidades = 3 arquivos) — sobe todos e anexa
  // numa ÚNICA chamada de `onRunAction` (`opts.anexos`, plural), pra virarem IRMÃOS na mesma versão
  // em vez de 3 versões sequenciais um "substituindo" o outro.
  const handleFilesForAction = async (files: File[]) => {
    const p = focus.primary;
    if (p?.kind !== "upload" || files.length === 0) return;
    setUploading(true);
    setUploadError("");
    try {
      // Cada arquivo sobe de forma independente — um falhar (ex: excedeu o limite de tamanho) não
      // derruba os outros do mesmo lote.
      const anexos: { categoria: EntregaAnexoCategoria; nome: string; url: string }[] = [];
      const falhas: string[] = [];
      for (const file of files) {
        try {
          const url = await uploadEntregaAnexo(file);
          anexos.push({ categoria: p.categoria, nome: file.name, url });
        } catch (err) {
          falhas.push(`${file.name}: ${err instanceof Error ? err.message : "falha desconhecida"}`);
        }
      }
      if (anexos.length > 0) onRunAction(p.action, { anexos });
      if (falhas.length > 0) {
        setUploadError(
          falhas.length === files.length
            ? `Falha ao subir. ${falhas[0]}`
            : `${anexos.length} de ${files.length} arquivo(s) subiram. Falha: ${falhas.join("; ")}`,
        );
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha ao subir o arquivo.");
    } finally {
      setUploading(false);
    }
  };

  // Quadrado vazio, "+ Adicionar" e "Adicionar nova versão": arquivos da mesma seleção são IRMÃOS
  // (mesma versão); cada nova seleção vira a versão seguinte e a anterior continua em "Ver versões".
  const pickArquivo = (c: EntregaAnexoCategoria) => {
    pendingCategoria.current = c;
    arquivosInputRef.current?.click();
  };
  const handleArquivosFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const categoria = pendingCategoria.current;
    setArquivosError("");
    setEnviandoCategoria(categoria);
    const novos: { nome: string; url: string }[] = [];
    const falhas: string[] = [];
    for (const file of files) {
      try {
        novos.push({ nome: file.name, url: await uploadEntregaAnexo(file) });
      } catch (err) {
        falhas.push(`${file.name}: ${err instanceof Error ? err.message : "falha desconhecida"}`);
      }
    }
    if (novos.length > 0) {
      const atual = entregaRef.current;
      const anexos = addAnexosComVersao(atual.anexos ?? [], categoria, novos);
      const versao = anexos[anexos.length - 1]?.versao ?? 1;
      onChangeRef.current(
        { anexos },
        entregaLog.arquivosAdicionados(
          categoria,
          novos.map((n) => n.nome),
          versao,
          entregaNome(atual),
        ),
        { material: categoria, versao },
      );
    }
    if (falhas.length > 0) {
      setArquivosError(
        falhas.length === files.length
          ? `Falha ao subir. ${falhas[0]}`
          : `${novos.length} de ${files.length} arquivo(s) subiram. Falha: ${falhas.join("; ")}`,
      );
    }
    setEnviandoCategoria(null);
  };

  // "Substituir arquivo": troca NO LUGAR (mesma versão) — escolhe o arquivo primeiro, confirma e só
  // então sobe. Para guardar o histórico, o caminho é "Adicionar nova versão".
  const pickSubstituir = (tile: ArquivoTile) => {
    const alvo = tile.atual[0];
    if (!alvo) return;
    pendingSubstituir.current = alvo;
    substituirInputRef.current?.click();
  };
  const handleSubstituirFile = async (file: File) => {
    const alvo = pendingSubstituir.current;
    pendingSubstituir.current = null;
    if (!alvo) return;
    const categoria = legacyAnexoCategoria(alvo.categoria);
    const versao = versaoDoAnexo(alvo);
    const yes = await confirmAction(
      `Trocar "${alvo.nome}" por "${file.name}"? Continua sendo a V${versao}: o arquivo antigo deixa de aparecer aqui e nenhuma versão nova é criada.`,
      { title: "Substituir arquivo?", confirmLabel: "Substituir" },
    );
    if (!yes) return;
    setArquivosError("");
    setEnviandoCategoria(categoria);
    try {
      const url = await uploadEntregaAnexo(file);
      const atual = entregaRef.current;
      if (!(atual.anexos ?? []).some((a) => a.id === alvo.id)) return;
      onChangeRef.current(
        { anexos: substituirArquivo(atual.anexos ?? [], alvo.id, { nome: file.name, url }) },
        entregaLog.arquivoSubstituido(categoria, versao, alvo.nome, file.name, entregaNome(atual)),
        { material: categoria, versao },
      );
    } catch (err) {
      setArquivosError(
        `Falha ao subir. ${file.name}: ${err instanceof Error ? err.message : "falha desconhecida"}`,
      );
    } finally {
      setEnviandoCategoria(null);
    }
  };

  // "Remover" do quadrado = remove a versão ATUAL (a anterior passa a ser a atual).
  const removerVersaoAtual = async (tile: ArquivoTile) => {
    if (tile.tipo !== "arquivo" || tile.versaoAtual == null) return;
    const categoria = tile.key as EntregaAnexoCategoria;
    const versao = tile.versaoAtual;
    const anterior = agruparAnexos(entrega.anexos).find((g) => g.categoria === categoria)
      ?.anteriores[0]?.versao;
    const rotulo = ARQUIVO_CATEGORIA_LABEL[categoria];
    const yes = await confirmAction(
      anterior != null
        ? `Remover a V${versao} de ${rotulo}? A V${anterior} volta a ser a versão atual.`
        : `Remover a V${versao} de ${rotulo}? Não há versão anterior — o material fica vazio.`,
      { title: `Remover a V${versao}?`, confirmLabel: "Remover", destructive: true },
    );
    if (!yes) return;
    const atual = entregaRef.current;
    onChangeRef.current(
      { anexos: removerVersao(atual.anexos ?? [], categoria, versao) },
      entregaLog.versaoRemovida(categoria, versao, entregaNome(atual)),
    );
  };
  const removerArquivo = async (a: EntregaAnexo) => {
    const yes = await confirmAction(`Remover "${a.nome}"?`, {
      title: "Remover arquivo?",
      confirmLabel: "Remover",
      destructive: true,
    });
    if (!yes) return;
    const atual = entregaRef.current;
    onChangeRef.current(
      { anexos: (atual.anexos ?? []).filter((x) => x.id !== a.id) },
      entregaLog.arquivoRemovido(a.nome, entregaNome(atual)),
    );
  };

  // Legenda: texto interno da entrega, editado no popover do quadrado.
  const salvarLegenda = async (texto: string | null) => {
    onChange({ legenda: texto ?? undefined }, entregaLog.legenda(!!texto, nome));
    return true;
  };
  const copiarLegenda = () =>
    void navigator.clipboard.writeText(entrega.legenda ?? "").then(
      () => toast.success("Legenda copiada."),
      () => toast.error("Não foi possível copiar."),
    );
  const removerLegenda = async () => {
    const yes = await confirmAction("Remover a legenda desta entrega?", {
      title: "Remover legenda?",
      confirmLabel: "Remover",
      destructive: true,
    });
    if (yes) onChange({ legenda: undefined }, entregaLog.legenda(false, nome));
  };

  const alterarPrazo = (campo: PrazoCampo, valor: string | undefined) =>
    onChange({ [campo]: valor }, entregaLog.prazo(PRAZO_LABEL[campo], valor, nome));

  const salvarPublicacao = (url: string, metrics: PostMetrics | undefined) => {
    if (url === (entrega.url ?? "") && JSON.stringify(metrics) === JSON.stringify(entrega.metrics))
      return;
    onChange({ url, metrics }, entregaLog.publicacao(nome));
  };

  // Abre o arquivo que o cliente está analisando (a versão mais recente da categoria).
  const abrirEmAnalise = () => {
    const grupo = agruparAnexos(entrega.anexos).find((g) => g.categoria === focus.openCategoria);
    const url = grupo?.atual.anexos[0]?.url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const contexto = influRede
    ? [influRede.handle ? `@${influRede.handle}` : null, influRede.plataforma]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (fileRef.current) fileRef.current.value = "";
          if (files.length > 0) void handleFilesForAction(files);
        }}
      />
      <input
        ref={arquivosInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (arquivosInputRef.current) arquivosInputRef.current.value = "";
          if (files.length > 0) void handleArquivosFiles(files);
        }}
      />
      <input
        ref={substituirInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (substituirInputRef.current) substituirInputRef.current.value = "";
          if (file) void handleSubstituirFile(file);
        }}
      />

      <EntregaHeader
        titulo={nome}
        unidades={entregaUnidadesLabel(entrega)}
        grupo={!!entrega.grupoId}
        influNome={influNome}
        influFoto={influFoto}
        influContexto={contexto}
        onBack={onBack}
        onClose={onClose}
        editing={editando}
        onToggleEdit={() => setEditando((v) => !v)}
        editor={
          <EntregaEditorInline
            tipo={entrega.tipo}
            titulo={entrega.titulo}
            quantidade={entrega.quantidade}
            grupo={!!entrega.grupoId}
            onChange={(patch) => onChange(patch)}
          />
        }
        menu={
          <EntregaMenu
            colunaAtual={entregaFaseColuna(stage)}
            grupo={!!entrega.grupoId}
            publicada={publicada}
            podeSepararArquivos={!entrega.grupoId && !!splitEntregaExistente(entrega)}
            onEditar={() => setEditando(true)}
            onEditarPublicacao={() => setPublicacaoAberta(true)}
            onMover={onSetStage}
            onSplitUnidade={onSplitUnidade}
            onSplitExistente={onSplitExistente}
            onRemover={onRemove}
          />
        }
      />

      <div className="space-y-5 px-4 py-4 sm:px-5">
        <EntregaStepper
          steps={stepper.steps}
          tone={stepper.tone}
          atrasoDias={atrasoDias}
          datas={{
            dataRecebimentoRoteiro: entrega.dataRecebimentoRoteiro,
            dataRecebimentoConteudo: entrega.dataRecebimentoConteudo,
            dataPostagem: entrega.dataPostagem,
          }}
          editing={editandoPrazos}
          onToggleEdit={() => setEditandoPrazos((v) => !v)}
          onChangeData={alterarPrazo}
        />

        <EntregaProximaAcao
          focus={focus}
          busy={uploading}
          error={uploadError}
          onPrimary={handlePrimary}
          onSecondary={() => void handleSecondary()}
          onOpenArquivo={focus.openCategoria ? abrirEmAnalise : undefined}
        />

        <EntregaArquivos
          anexos={entrega.anexos}
          legenda={entrega.legenda}
          canal={legendaCanal(influRede?.plataforma)}
          ajusteCategoria={ajuste && ajuste.phase !== "reenviado" ? ajuste.categoria : undefined}
          enviando={enviandoCategoria}
          error={arquivosError}
          onPick={pickArquivo}
          onNovaVersao={pickArquivo}
          onSubstituir={pickSubstituir}
          onRemoverVersao={(tile) => void removerVersaoAtual(tile)}
          onRemoverArquivo={(a) => void removerArquivo(a)}
          onSalvarLegenda={salvarLegenda}
          onCopiarLegenda={copiarLegenda}
          onRemoverLegenda={() => void removerLegenda()}
        />

        <EntregaHistorico
          eventos={eventos}
          showAll={verTodoHistorico}
          onToggleAll={() => setVerTodoHistorico((v) => !v)}
          feedbackAberto={feedbackAberto}
          onToggleFeedback={(id) => setFeedbackAberto((atual) => (atual === id ? null : id))}
          sectionRef={historicoRef}
        />
      </div>

      <PublicacaoDialog
        open={publicacaoAberta}
        onOpenChange={setPublicacaoAberta}
        url={entrega.url}
        metrics={entrega.metrics}
        onSave={salvarPublicacao}
      />
      {entregaConfirmDialog}
    </>
  );
}

/** Link do post e métricas: um modal pequeno, com rascunho e UM "Salvar" (uma só linha no histórico). */
function PublicacaoDialog({
  open,
  onOpenChange,
  url,
  metrics,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url?: string;
  metrics?: PostMetrics;
  onSave: (url: string, metrics: PostMetrics | undefined) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <PublicacaoForm
          url={url}
          metrics={metrics}
          onCancel={() => onOpenChange(false)}
          onSave={(u, m) => {
            onSave(u, m);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function PublicacaoForm({
  url,
  metrics,
  onCancel,
  onSave,
}: {
  url?: string;
  metrics?: PostMetrics;
  onCancel: () => void;
  onSave: (url: string, metrics: PostMetrics | undefined) => void;
}) {
  const [draftUrl, setDraftUrl] = useState(url ?? "");
  const [draftMetrics, setDraftMetrics] = useState<PostMetrics | undefined>(metrics);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draftUrl.trim(), draftMetrics);
      }}
      className="space-y-4"
    >
      <div className="space-y-1">
        <DialogTitle className="text-base font-semibold">Link do post e métricas</DialogTitle>
        <DialogDescription className="text-sm text-text-secondary">
          Aparecem na entrega publicada.
        </DialogDescription>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-text-secondary">Link do post</span>
        <input
          autoFocus
          value={draftUrl}
          onChange={(e) => setDraftUrl(e.target.value)}
          placeholder="https://www.instagram.com/reel/…"
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
      </label>
      <div className="space-y-1">
        <span className="text-xs font-medium text-text-secondary">Métricas</span>
        <MetricsEditor value={draftMetrics} onChange={setDraftMetrics} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm">
          Salvar
        </Button>
      </div>
    </form>
  );
}

/** Casca `Sheet` fina em volta de `EntregaDetailBody` — usada só pelo
 * formulário de criação de influenciador (`InfluenciadorDialog`, via
 * `EntregasEditor` sem `onOpenEntrega`), que ainda não tem um workspace
 * próprio pra embutir o detalhe. O workspace do influenciador já salvo
 * (`InfluencerWorkspaceSheet`) usa `EntregaDetailBody` direto, sem esta
 * casca, pra nunca empilhar um segundo overlay. */
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
  onSplitUnidade,
  onSplitExistente,
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
  onSplitUnidade: (delta: 1 | -1) => void;
  onSplitExistente: () => void;
}) {
  const label = entrega.titulo ? `${entrega.tipo} · ${entrega.titulo}` : entrega.tipo;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideClose
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <SheetTitle className="sr-only">Entrega · {label}</SheetTitle>
        <SheetDescription className="sr-only">
          Progresso, próxima ação, arquivos e histórico desta entrega.
        </SheetDescription>
        <div className="flex-1 overflow-y-auto">
          <EntregaDetailBody
            influNome={influNome}
            influFoto={influFoto}
            entrega={entrega}
            influActivity={influActivity}
            onClose={() => onOpenChange(false)}
            onChange={onChange}
            onRunAction={onRunAction}
            onSetStage={onSetStage}
            onRemove={onRemove}
            onSplitUnidade={onSplitUnidade}
            onSplitExistente={onSplitExistente}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ============================================================
 * Workspace lateral do influenciador (rodada de reestruturação) —
 * substitui o antigo modal centralizado com abas horizontais por um
 * painel lateral largo, com navegação vertical contínua e seções
 * secundárias recolhíveis. Entrega e Atividade trocam o CONTEÚDO do
 * mesmo painel (nunca empilham um segundo overlay por cima).
 * ============================================================ */

type InfluWorkspaceView = "detail" | "entrega" | "activity" | "recurso";

function InfluencerWorkspaceSheet({
  influ,
  has,
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
  nps,
  campanhaId,
}: {
  campanhaId?: string;
  influ: Influ;
  has: (k: InfluencerFieldKey) => boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  onSetStatus: (status: InfluStatus) => void;
  nps?: InfluNpsBoardProp;
  onRunEntregaAction: (
    entregaId: string,
    action: EntregaEngineActionKind,
    opts?: {
      url?: string;
      anexo?: { categoria: EntregaAnexoCategoria; nome: string; url: string };
      anexos?: { categoria: EntregaAnexoCategoria; nome: string; url: string }[];
    },
  ) => void;
  onSetEntregaStage: (entregaId: string, coluna: EntregaFaseColuna) => void;
  onSetChecklist: (checklist: ChecklistItem[]) => void;
  onApplyChecklistToAll: (checklist: ChecklistItem[]) => void;
  onComment: (text: string) => void;
  onPatch: (patch: Partial<Influ>) => void;
  onSendToClient: () => void;
}) {
  const [view, setView] = useState<InfluWorkspaceView>("detail");
  const [selectedEntregaId, setSelectedEntregaId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef(0);
  const [resource, setResource] = useState<ResourceKey | null>(null);
  const [commentText, setCommentText] = useState("");
  const [activityFilter, setActivityFilter] = useState<"tudo" | "comentarios" | "historico">(
    "tudo",
  );
  const { confirm, confirmDialog } = useConfirm();

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

  const fotoRef = useRef<HTMLInputElement>(null);
  const initials = (influ.nome || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const bank = influ.bank ?? {};
  const resources = availableResources(influ, {
    has,
    hasNpsLink: !!nps?.linksByInfluId[influ.id],
  });
  const activityCount = (influ.activity?.length ?? 0) + (influ.comments?.length ?? 0);
  const selectedEntrega = influ.entregas.find((e) => e.id === selectedEntregaId) ?? null;

  const goToScrollTop = (top: number) => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = top;
    });
  };

  const openEntrega = (id: string) => {
    savedScrollRef.current = scrollRef.current?.scrollTop ?? 0;
    setSelectedEntregaId(id);
    setView("entrega");
    goToScrollTop(0);
  };
  const backToDetail = () => {
    setView("detail");
    setSelectedEntregaId(null);
    goToScrollTop(savedScrollRef.current);
  };
  const openActivity = () => {
    savedScrollRef.current = scrollRef.current?.scrollTop ?? 0;
    setView("activity");
    goToScrollTop(0);
  };
  const closeActivity = () => {
    setView("detail");
    goToScrollTop(savedScrollRef.current);
  };
  // Recursos: segundo nível dentro do MESMO Sheet (como Entrega e Atividade). Trocar de um recurso
  // para outro não sobrescreve a posição de rolagem do detalhe, que volta ao fechar.
  const openResource = (key: ResourceKey) => {
    if (view === "detail") savedScrollRef.current = scrollRef.current?.scrollTop ?? 0;
    setResource(key);
    setView("recurso");
    goToScrollTop(0);
  };
  const closeResource = () => {
    setView("detail");
    setResource(null);
    goToScrollTop(savedScrollRef.current);
  };

  const removeEntrega = async (e: Entrega): Promise<boolean> => {
    const label = e.titulo ? `${e.tipo} · ${e.titulo}` : e.tipo || "esta entrega";
    if (!(await confirm(`Remover "${label}"? Isso apaga o histórico e os anexos dela.`))) {
      return false;
    }
    onPatch({ entregas: influ.entregas.filter((x) => x.id !== e.id) });
    return true;
  };

  const addEntrega = () => {
    const id = crypto.randomUUID();
    onPatch({
      entregas: [
        ...influ.entregas,
        { id, tipo: "Reels", quantidade: 1, status: "combinado", stage: "ROTEIRO_PRODUCAO" },
      ],
    });
    openEntrega(id);
  };

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideClose={view === "entrega"}
        className="flex w-full flex-col gap-0 overflow-hidden p-0 focus:outline-none sm:w-[820px] sm:max-w-[85vw]"
        onEscapeKeyDown={(e) => {
          // Esc fecha primeiro Atividade/Entrega (o que estiver aberto),
          // só depois o workspace inteiro.
          if (view !== "detail") {
            e.preventDefault();
            if (view === "entrega") backToDetail();
            else if (view === "recurso") closeResource();
            else closeActivity();
          }
        }}
      >
        <SheetTitle className="sr-only">
          {view === "entrega" && selectedEntrega
            ? `Entrega · ${selectedEntrega.tipo}`
            : view === "activity"
              ? `Atividade de ${influ.nome}`
              : view === "recurso" && resource
                ? `${RESOURCE_LABEL[resource]} de ${influ.nome}`
                : `Workspace de ${influ.nome || "influenciador"}`}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Painel operacional do influenciador dentro da campanha.
        </SheetDescription>

        {view === "detail" && (
          <WorkspaceDetailHeader
            influ={influ}
            has={has}
            editingHeader={editingHeader}
            draft={draft}
            setDraft={setDraft}
            startEditing={startEditing}
            saveHeader={saveHeader}
            setEditingHeader={setEditingHeader}
            onSetStatus={onSetStatus}
            onPatch={onPatch}
            fotoRef={fotoRef}
            initials={initials}
            activityCount={activityCount}
            onOpenActivity={openActivity}
            onRemove={onRemove}
            resources={resources}
            onOpenResource={openResource}
          />
        )}
        {view === "recurso" && resource && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border py-3 pl-4 pr-12">
            <button
              type="button"
              onClick={closeResource}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="sm:hidden">Voltar</span>
              <span className="hidden sm:inline">Voltar ao influenciador</span>
            </button>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {RESOURCE_LABEL[resource]}
            </p>
            <RecursosMenu items={resources} current={resource} onSelect={openResource} />
          </div>
        )}
        {view === "activity" && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
            <button
              type="button"
              onClick={closeActivity}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar aos detalhes
            </button>
            <p className="text-sm font-semibold text-foreground">Atividade</p>
            <span className="w-[120px]" />
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {view === "detail" && (
            <WorkspaceDetailBody
              influ={influ}
              has={has}
              onOpenEntrega={openEntrega}
              onAddEntrega={addEntrega}
              onRemoveEntrega={removeEntrega}
              onRunEntregaAction={onRunEntregaAction}
              onSendToClient={onSendToClient}
              onSetStatus={onSetStatus}
            />
          )}
          {view === "recurso" && resource && (
            <WorkspaceResourceBody
              resource={resource}
              influ={influ}
              has={has}
              bank={bank}
              campanhaId={campanhaId}
              nps={nps}
              onPatch={onPatch}
              onSetChecklist={onSetChecklist}
              onApplyChecklistToAll={onApplyChecklistToAll}
            />
          )}
          {view === "entrega" && selectedEntrega && (
            <div>
              <EntregaDetailBody
                influNome={influ.nome}
                influFoto={influ.foto}
                influRede={
                  influ.redes[0]
                    ? { plataforma: influ.redes[0].plataforma, handle: influ.redes[0].handle }
                    : undefined
                }
                entrega={selectedEntrega}
                influActivity={influ.activity ?? []}
                onBack={backToDetail}
                onClose={() => onOpenChange(false)}
                onChange={(patch, log, meta) =>
                  onPatch({
                    entregas: influ.entregas.map((x) =>
                      x.id === selectedEntrega.id ? { ...x, ...patch } : x,
                    ),
                    ...(log
                      ? {
                          activity: logInfluActivity(
                            influ,
                            log,
                            selectedEntrega.id,
                            undefined,
                            meta,
                          ).activity,
                        }
                      : {}),
                  })
                }
                onRunAction={(action, opts) => onRunEntregaAction(selectedEntrega.id, action, opts)}
                onSetStage={(coluna) => onSetEntregaStage(selectedEntrega.id, coluna)}
                onRemove={async () => {
                  if (await removeEntrega(selectedEntrega)) backToDetail();
                }}
                onSplitUnidade={(delta) => {
                  if (delta === 1) {
                    onPatch({ entregas: addEntregaUnidade(influ.entregas, selectedEntrega) });
                    return;
                  }
                  const result = removeEntregaUnidade(influ.entregas, selectedEntrega);
                  if (!result) return;
                  if (result.blocked) toast.error(result.blocked);
                  onPatch({ entregas: result.next });
                }}
                onSplitExistente={() => {
                  const novos = splitEntregaExistente(selectedEntrega);
                  if (!novos) return;
                  onPatch({
                    entregas: [
                      ...influ.entregas.filter((x) => x.id !== selectedEntrega.id),
                      ...novos,
                    ],
                  });
                }}
              />
            </div>
          )}
          {view === "activity" && (
            <WorkspaceActivityBody
              influ={influ}
              filter={activityFilter}
              onFilterChange={setActivityFilter}
              commentText={commentText}
              setCommentText={setCommentText}
              onComment={onComment}
            />
          )}
        </div>
      </SheetContent>
      {confirmDialog}
    </Sheet>
  );
}

/** Cabeçalho = identidade + status + contato: avatar, nome com o pill de status (que também é o
 * lugar de alterar o status), "@handle · rede · seguidores" e o contato. À direita só duas
 * entradas: Atividade (histórico) e Recursos (camada de consulta). O X de fechar é do
 * `SheetContent` (absolute, top-4 right-4): `sm:pr-7` reserva o espaço dele no desktop e, no
 * celular, o bloco de identidade reserva `pr-8` e as entradas descem para uma linha própria. */
function WorkspaceDetailHeader({
  influ,
  has,
  editingHeader,
  draft,
  setDraft,
  startEditing,
  saveHeader,
  setEditingHeader,
  onSetStatus,
  onPatch,
  fotoRef,
  initials,
  activityCount,
  onOpenActivity,
  onRemove,
  resources,
  onOpenResource,
}: {
  influ: Influ;
  has: (k: InfluencerFieldKey) => boolean;
  editingHeader: boolean;
  draft: { nome: string; nicho: string; telefone: string; email: string };
  setDraft: React.Dispatch<
    React.SetStateAction<{ nome: string; nicho: string; telefone: string; email: string }>
  >;
  startEditing: () => void;
  saveHeader: () => void;
  setEditingHeader: (v: boolean) => void;
  onSetStatus: (status: InfluStatus) => void;
  onPatch: (patch: Partial<Influ>) => void;
  fotoRef: React.RefObject<HTMLInputElement | null>;
  initials: string;
  activityCount: number;
  onOpenActivity: () => void;
  onRemove: () => void;
  resources: ResourceItem[];
  onOpenResource: (key: ResourceKey) => void;
}) {
  return (
    <div className="shrink-0 border-b border-border bg-background px-5 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 pr-8 sm:pr-0">
          <button
            type="button"
            onClick={() => fotoRef.current?.click()}
            aria-label="Trocar foto"
            className="group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted shadow-sm sm:h-16 sm:w-16"
          >
            {influ.foto ? (
              <img src={influ.foto} alt="" className="h-full w-full object-cover object-center" />
            ) : initials ? (
              <span className="text-sm font-semibold text-muted-foreground">{initials}</span>
            ) : (
              <User className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-foreground/60 text-background opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-4 w-4" />
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

          <div className="min-w-0 flex-1">
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
                  <NativeSelect
                    value={draft.nicho}
                    onChange={(e) => setDraft((d) => ({ ...d, nicho: e.target.value }))}
                  >
                    <option value="">Selecione um nicho</option>
                    {NICHOS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </NativeSelect>
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
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  {/* Ação destrutiva no contexto da edição do cadastro (o menu "⋯" deixou de existir). */}
                  <button
                    type="button"
                    onClick={onRemove}
                    className="inline-flex items-center gap-1 self-start whitespace-nowrap text-xs font-medium text-destructive underline-offset-2 hover:underline"
                  >
                    <Trash2 className="h-3 w-3" /> Remover da campanha
                  </button>
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
              </div>
            ) : (
              <>
                <div className="group/name flex items-center gap-x-1.5">
                  <p className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground">
                    {influ.nome || "Sem nome"}
                  </p>
                  <button
                    type="button"
                    onClick={startEditing}
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/name:opacity-100 [@media(hover:none)]:opacity-60"
                    aria-label="Editar nome, nicho e contato"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
                {/* Status logo abaixo do nome (é também o lugar de alterá-lo), junto de @handle · rede · seguidores. */}
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  {has("status") && <InfluStatusPill value={influ.status} onChange={onSetStatus} />}
                  {has("redes") && influ.redes[0] && (
                    <p className="min-w-0 text-xs text-muted-foreground">
                      <PlatformIcon
                        plataforma={influ.redes[0].plataforma}
                        className="mr-1 inline h-3 w-3 align-[-1px]"
                      />
                      {influ.redes[0].handle
                        ? `@${influ.redes[0].handle} · ${influ.redes[0].plataforma}`
                        : influ.redes[0].plataforma}
                      {influ.redes[0].seguidores
                        ? ` · ${formatCompactSeguidores(influ.redes[0].seguidores)} seguidores`
                        : ""}
                    </p>
                  )}
                </div>
                <HeaderContact telefone={influ.telefone} email={influ.email} onAdd={startEditing} />
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:pr-7">
          <button
            type="button"
            onClick={onOpenActivity}
            aria-label={`Atividade${activityCount > 0 ? ` (${activityCount})` : ""}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Atividade
            {activityCount > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">
                {activityCount}
              </span>
            )}
          </button>
          <RecursosMenu items={resources} onSelect={onOpenResource} />
        </div>
      </div>
    </div>
  );
}

/** Renderiza UMA resposta conforme o `fieldType` (pedido: "não usar o
 * mesmo componente para todos os tipos") — nunca mostra campo vazio,
 * nunca concatena pergunta+resposta no mesmo parágrafo, nunca mostra
 * JSON/array cru. Respostas antigas sem `fieldType` caem no fallback de
 * texto simples (compatibilidade, sem quebrar nada já salvo). */
function AnswerField({ r }: { r: InscricaoResposta }) {
  const isEmpty =
    r.value === undefined ||
    r.value === null ||
    r.value === "" ||
    (Array.isArray(r.value) && r.value.length === 0);
  if (isEmpty) return null;

  const longForm = r.fieldType === "texto_longo";
  const wrapperClass = longForm ? "col-span-full space-y-1" : "space-y-1";

  let body: ReactNode;
  switch (r.fieldType) {
    case "moeda": {
      const n = typeof r.value === "string" ? parseCurrencyValue(r.value) : null;
      body = (
        <p className="text-sm font-medium text-foreground">{n !== null ? formatBRL(n) : r.value}</p>
      );
      break;
    }
    case "data": {
      const d = typeof r.value === "string" ? new Date(r.value) : null;
      const valid = d && !Number.isNaN(d.getTime());
      body = (
        <p className="text-sm text-foreground">
          {valid ? d!.toLocaleDateString("pt-BR") : String(r.value)}
        </p>
      );
      break;
    }
    case "sim_nao":
      body = (
        <p className="text-sm text-foreground">
          {r.value === "true" || r.value === "sim" || r.value === "Sim" ? "Sim" : "Não"}
        </p>
      );
      break;
    case "selecao_unica":
      body = (
        <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
          {Array.isArray(r.value) ? r.value[0] : r.value}
        </span>
      );
      break;
    case "selecao_multipla":
      body = (
        <div className="flex flex-wrap gap-1.5">
          {(Array.isArray(r.value) ? r.value : [r.value]).map((v) => (
            <span
              key={v}
              className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground"
            >
              {v}
            </span>
          ))}
        </div>
      );
      break;
    case "link": {
      const href = Array.isArray(r.value) ? r.value[0] : r.value;
      let domain = href;
      try {
        domain = new URL(/^https?:\/\//i.test(href) ? href : `https://${href}`).hostname;
      } catch {
        /* mantém o texto original se não for uma URL válida */
      }
      body = (
        <a
          href={/^https?:\/\//i.test(href) ? href : `https://${href}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-foreground underline underline-offset-2"
        >
          {domain}
        </a>
      );
      break;
    }
    case "numero":
      body = (
        <p className="text-sm text-foreground">
          {Array.isArray(r.value) ? r.value.join(", ") : r.value}
        </p>
      );
      break;
    case "texto_longo":
      body = (
        <p className="whitespace-pre-line text-sm text-foreground">
          {Array.isArray(r.value) ? r.value.join("\n") : r.value}
        </p>
      );
      break;
    default:
      body = (
        <p className="text-sm text-foreground">
          {Array.isArray(r.value) ? r.value.join(", ") : r.value}
        </p>
      );
  }

  return (
    <div className={wrapperClass}>
      <dt className="text-xs font-medium text-muted-foreground">{r.label}</dt>
      <dd>{body}</dd>
    </div>
  );
}

/** Resumo compacto no topo da candidatura (pedido, seção 6) — só mostra
 * os campos que existem de verdade, nunca inventa/preenche placeholder. */
function InscricaoResumo({ influ }: { influ: Influ }) {
  const budget = firstCurrencyResposta(influ.inscricaoRespostas);
  const disponibilidade = influ.inscricaoRespostas?.find((r) =>
    /disponibilidade/i.test(r.label),
  )?.value;
  const cidade = influ.inscricaoRespostas?.find((r) =>
    /cidade|região|regiao/i.test(r.label),
  )?.value;
  const principais = ensurePrimary(influ.redes).slice(0, 2);
  const items: { label: string; value: ReactNode }[] = [];
  if (budget !== null) items.push({ label: "Orçamento", value: formatBRL(budget) });
  if (disponibilidade)
    items.push({
      label: "Disponibilidade",
      value: Array.isArray(disponibilidade) ? disponibilidade.join(", ") : disponibilidade,
    });
  if (cidade)
    items.push({
      label: "Cidade/região",
      value: Array.isArray(cidade) ? cidade.join(", ") : cidade,
    });
  if (principais.length > 0)
    items.push({
      label: "Redes",
      value: (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {principais.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1">
              {platformIcon(r.plataforma)}@{sanitizeHandleForDisplay(r.plataforma, r.handle)}
            </span>
          ))}
        </span>
      ),
    });
  items.push({
    label: "Mídia kit",
    value: influ.midiaKit && influ.midiaKit.length > 0 ? "Sim" : "Não enviado",
  });

  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="space-y-0.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {it.label}
          </p>
          <div className="text-sm text-foreground">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

/** "Ver inscrição original": o que o influenciador enviou, em linguagem humana (contato, redes,
 * respostas, mensagem). O JSON bruto fica só numa camada técnica recolhida, para diagnóstico. */
function InscricaoOriginalDialog({
  snapshot,
  submittedAt,
  onClose,
}: {
  snapshot: Record<string, unknown>;
  submittedAt?: string;
  onClose: () => void;
}) {
  const view = describeInscricaoSnapshot(snapshot);
  const [raw, setRaw] = useState(false);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Inscrição original</DialogTitle>
        <DialogDescription>
          Exatamente como foi enviado
          {submittedAt && `, em ${new Date(submittedAt).toLocaleString("pt-BR")}`}. Alterações
          feitas depois no perfil não mudam este registro.
        </DialogDescription>
        <div className="space-y-4">
          {view.contato.length > 0 && (
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {view.contato.map((c) => (
                <div key={c.label} className="space-y-0.5">
                  <dt className="text-xs font-medium text-muted-foreground">{c.label}</dt>
                  <dd className="break-words text-sm text-foreground">{c.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {view.redes.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Redes sociais</p>
              <ul className="space-y-1">
                {view.redes.map((r, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-sm text-foreground">
                    {platformIcon(r.plataforma)}@{sanitizeHandleForDisplay(r.plataforma, r.handle)}
                    {r.seguidores && (
                      <span className="text-xs text-muted-foreground">· {r.seguidores}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {view.respostas.length > 0 && (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {view.respostas.map((r) => (
                <AnswerField key={r.questionId} r={r as InscricaoResposta} />
              ))}
            </dl>
          )}
          {view.mensagem && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Mensagem do candidato</p>
              <p className="whitespace-pre-line text-sm text-foreground">{view.mensagem}</p>
            </div>
          )}
          <div className="border-t border-border/60 pt-2">
            <button
              type="button"
              onClick={() => setRaw((v) => !v)}
              aria-expanded={raw}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {raw ? "Ocultar dados técnicos" : "Dados técnicos"}
            </button>
            {raw && (
              <pre className="mt-2 max-h-[30vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs text-foreground">
                {JSON.stringify(snapshot, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Recursos → Inscrição original ("Dados da inscrição", pedido, seção 3) — só existe quando a
 * candidatura veio da Página de Inscrição pública. Nunca mistura com
 * "Observações internas": tudo aqui é o que o influenciador enviou, não
 * o que o time escreveu depois. */
function InscricaoDadosSection({ influ }: { influ: Influ }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const respostas = influ.inscricaoRespostas ?? [];
  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {influ.inscricaoMeta?.submittedAt && (
            <span>
              Enviado em{" "}
              {new Date(influ.inscricaoMeta.submittedAt).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          <span>· Origem: Página de inscrição</span>
          <span>· Status: {INFLU_STATUS_LABEL[influ.status]}</span>
          {influ.inscricaoSnapshot && (
            <button
              type="button"
              onClick={() => setShowOriginal(true)}
              className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
            >
              Ver inscrição original
            </button>
          )}
        </div>

        <InscricaoResumo influ={influ} />

        {respostas.length > 0 && (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {respostas.map((r) => (
              <AnswerField key={r.questionId} r={r} />
            ))}
          </dl>
        )}
        {respostas.length === 0 && (
          <EmptyHint text="Nenhuma resposta personalizada nesta inscrição." />
        )}

        {influ.inscricaoMensagem && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Mensagem do candidato</p>
            <p className="whitespace-pre-line text-sm text-foreground">{influ.inscricaoMensagem}</p>
          </div>
        )}

        {influ.duplicateReviewFlags && influ.duplicateReviewFlags.length > 0 && (
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              {influ.duplicateReviewFlags.map((f, i) => (
                <p key={i}>{f.reason}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {showOriginal && influ.inscricaoSnapshot && (
        <InscricaoOriginalDialog
          snapshot={influ.inscricaoSnapshot}
          submittedAt={influ.inscricaoMeta?.submittedAt}
          onClose={() => setShowOriginal(false)}
        />
      )}
    </>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIconFor(extension: string) {
  const cls = "h-5 w-5 text-muted-foreground";
  if (extension === "pdf") return <FileText className={cls} />;
  if (["jpg", "jpeg", "png", "webp"].includes(extension)) return <ImageIcon className={cls} />;
  return <Paperclip className={cls} />;
}

/** Card de arquivo do mídia kit (pedido, seção 8) — Visualizar/Baixar
 * sempre pedem uma URL nova sob demanda (`getInfluAttachmentUrl`), nunca
 * confiam numa URL salva antes (essa é a causa raiz do "PDF quebrado"). */
function MidiaKitCard({
  campanhaInfluId,
  attachment,
}: {
  campanhaInfluId: string;
  attachment: InfluAttachment;
}) {
  const [preview, setPreview] = useState<{
    loading: boolean;
    url?: string;
    mimeType?: string;
    error?: boolean;
  } | null>(null);

  const openPreview = async () => {
    setPreview({ loading: true });
    try {
      const { getInfluAttachmentUrl } = await import("@/lib/inscricao-campanha.functions");
      const res = await getInfluAttachmentUrl({
        data: { campanhaInfluId, attachmentId: attachment.id },
      });
      if (!res.ok) {
        setPreview({ loading: false, error: true });
        return;
      }
      setPreview({ loading: false, url: res.url, mimeType: res.mimeType });
    } catch {
      setPreview({ loading: false, error: true });
    }
  };

  const download = async () => {
    const { getInfluAttachmentUrl } = await import("@/lib/inscricao-campanha.functions");
    const res = await getInfluAttachmentUrl({
      data: { campanhaInfluId, attachmentId: attachment.id, download: true },
    });
    if (!res.ok) return;
    window.open(res.url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
        {fileIconFor(attachment.extension)}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{attachment.name}</p>
          <p className="text-xs text-muted-foreground">
            {attachment.extension.toUpperCase()} · {formatFileSize(attachment.sizeBytes)} · Enviado
            na inscrição
          </p>
        </div>
        <button
          type="button"
          onClick={openPreview}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <Eye className="h-3.5 w-3.5" /> Visualizar
        </button>
        <button
          type="button"
          onClick={() => void download()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" /> Baixar
        </button>
      </div>

      {preview && (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="max-h-[85vh] w-[min(900px,calc(100vw-48px))] max-w-none">
            <DialogTitle>{attachment.name}</DialogTitle>
            <DialogDescription>
              {attachment.extension.toUpperCase()} · {formatFileSize(attachment.sizeBytes)}
            </DialogDescription>
            <div className="mt-2 h-[70vh] w-full overflow-hidden rounded-md border border-border bg-muted">
              {preview.loading && (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!preview.loading && preview.error && (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Arquivo indisponível.</p>
                  <button
                    type="button"
                    onClick={() => void download()}
                    className="text-sm font-medium text-foreground underline underline-offset-2"
                  >
                    Baixar arquivo
                  </button>
                </div>
              )}
              {!preview.loading &&
                !preview.error &&
                preview.url &&
                (preview.mimeType === "application/pdf" ? (
                  <iframe src={preview.url} title={attachment.name} className="h-full w-full" />
                ) : (
                  <img
                    src={preview.url}
                    alt={attachment.name}
                    className="h-full w-full object-contain"
                  />
                ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** PRÓXIMA AÇÃO — a peça central do painel. Mostra UMA só ação (a "next best action" calculada em
 * `lib/influencer-next-action.ts` a partir do estado real: status, entregas, ciclo de ajustes e
 * financeiro). As demais pendências aparecem só como um número discreto. */
function NextActionPanel({
  action,
  onOpenEntrega,
  onRunEntregaAction,
  onSendToClient,
  onSetStatus,
  onAddEntrega,
}: {
  action: NextAction;
  onOpenEntrega: (id: string) => void;
  onRunEntregaAction: (
    entregaId: string,
    action: EntregaEngineActionKind,
    opts?: {
      anexo?: { categoria: EntregaAnexoCategoria; nome: string; url: string };
      anexos?: { categoria: EntregaAnexoCategoria; nome: string; url: string }[];
    },
  ) => void;
  onSendToClient: () => void;
  onSetStatus: (status: InfluStatus) => void;
  onAddEntrega: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const needsFile =
    action.kind === "entrega" &&
    (action.action === "anexar_roteiro" || action.action === "anexar_conteudo");

  // Aceita vários arquivos de uma vez (ex: Story de 3 unidades) — sobe todos e anexa numa ÚNICA
  // chamada (`opts.anexos`), pra virarem IRMÃOS na mesma versão em vez de 3 versões sequenciais.
  const handleFiles = async (files: File[]) => {
    if (action.kind !== "entrega" || !needsFile || files.length === 0) return;
    setUploading(true);
    setUploadError("");
    try {
      const categoria: EntregaAnexoCategoria =
        action.action === "anexar_roteiro" ? "Roteiro" : "Conteúdo final";
      // Cada arquivo sobe de forma independente — um falhar não derruba os outros do lote.
      const anexos: { categoria: EntregaAnexoCategoria; nome: string; url: string }[] = [];
      const falhas: string[] = [];
      for (const file of files) {
        try {
          const url = await uploadEntregaAnexo(file);
          anexos.push({ categoria, nome: file.name, url });
        } catch (err) {
          falhas.push(`${file.name}: ${err instanceof Error ? err.message : "falha desconhecida"}`);
        }
      }
      if (anexos.length > 0) onRunEntregaAction(action.entregaId, action.action, { anexos });
      if (falhas.length > 0) {
        setUploadError(
          falhas.length === files.length
            ? `Falha ao subir. ${falhas[0]}`
            : `${anexos.length} de ${files.length} arquivo(s) subiram. Falha: ${falhas.join("; ")}`,
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const run = () => {
    switch (action.kind) {
      case "avancar_status":
        return onSetStatus(action.to);
      case "enviar_cliente":
        return onSendToClient();
      case "adicionar_entrega":
        return onAddEntrega();
      case "entrega":
        if (needsFile) return fileRef.current?.click();
        return onRunEntregaAction(action.entregaId, action.action);
      case "aguardando":
        if (action.entregaId) onOpenEntrega(action.entregaId);
    }
  };

  const label =
    action.kind === "nenhuma" || (action.kind === "aguardando" && !action.entregaId)
      ? null
      : (action.label ?? null);
  const primaryIsAction = action.kind !== "aguardando";

  return (
    <section
      aria-label="Próxima ação"
      className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (fileRef.current) fileRef.current.value = "";
          if (files.length > 0) void handleFiles(files);
        }}
      />
      <CockpitTitle>Próxima ação</CockpitTitle>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate text-base font-semibold leading-tight text-foreground">
            {action.area}
            {action.kind === "entrega" && (
              <span className="font-normal text-text-secondary"> · {action.entregaNome}</span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-text-secondary">{action.hint}</p>
        </div>
        {label && (
          <div className="flex shrink-0 items-center gap-3">
            {action.kind === "entrega" && action.others > 0 && (
              <span className="text-xs text-text-secondary">+{action.others} pendentes</span>
            )}
            <button
              type="button"
              onClick={run}
              disabled={uploading}
              className={
                primaryIsAction
                  ? "inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-sm hover:opacity-90 disabled:opacity-60"
                  : "inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted"
              }
            >
              {uploading ? "Enviando..." : label}
            </button>
          </div>
        )}
      </div>
      {action.kind === "entrega" && (
        <div className="mt-1.5">
          <QuietButton onClick={() => onOpenEntrega(action.entregaId)}>Ver entrega →</QuietButton>
        </div>
      )}
      {uploadError && <p className="mt-1.5 text-xs text-destructive">{uploadError}</p>}
    </section>
  );
}

/** Recursos → Perfil e audiência: rede, indicadores, audiência completa (gênero, faixa etária,
 * países, cidades) e edição inline (redes e métricas). Mesmos dados e editores de sempre. */
function PerfilAudienciaView({
  influ,
  has,
  onPatch,
}: {
  influ: Influ;
  has: (k: InfluencerFieldKey) => boolean;
  onPatch: (patch: Partial<Influ>) => void;
}) {
  const redes = ensurePrimary(influ.redes);
  const [selId, setSelId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const rede = redes.find((r) => r.id === selId) ?? redes[0];
  const m = rede ? influ.profileMetrics?.porRede?.[rede.id] : undefined;
  const dash = <span className="text-text-secondary">—</span>;
  return (
    <section aria-label="Perfil e audiência" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {rede ? (
            <p className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
              <PlatformIcon plataforma={rede.plataforma} className="h-4 w-4 shrink-0" />
              <span className="truncate">{rede.handle ? `@${rede.handle}` : rede.plataforma}</span>
              {rede.handle && (
                <span className="font-normal text-text-secondary">· {rede.plataforma}</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-text-secondary">Nenhuma rede cadastrada</p>
          )}
          {redes.length > 1 && (
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Rede social">
              {redes.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={rede?.id === r.id}
                  onClick={() => setSelId(r.id)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    rede?.id === r.id
                      ? "bg-muted text-foreground"
                      : "text-text-secondary hover:text-foreground"
                  }`}
                >
                  {r.plataforma}
                </button>
              ))}
            </div>
          )}
        </div>
        <QuietButton onClick={() => setEditing((v) => !v)}>
          {editing ? "Concluir" : redes.length === 0 ? "Adicionar rede" : "Editar"}
        </QuietButton>
      </div>

      {!rede && influ.nicho && <KeyStats items={[{ label: "Nicho", value: influ.nicho }]} />}

      {rede && (
        <>
          <KeyStats
            items={[
              ...(influ.nicho ? [{ label: "Nicho", value: influ.nicho }] : []),
              { label: "Seguidores", value: formatCompactSeguidores(rede.seguidores) || dash },
              {
                label: "Interação",
                value: m?.taxaInteracao != null ? formatPercentBR(m.taxaInteracao) : dash,
              },
              {
                label: "Views",
                value: m?.visualizacoes != null ? formatCompactNumber(m.visualizacoes) : dash,
              },
              {
                label: "Atenção inicial",
                value: m?.taxaAtencaoInicial != null ? formatPercentBR(m.taxaAtencaoInicial) : dash,
              },
              ...(m?.interacoes != null
                ? [{ label: "Interações", value: formatCompactNumber(m.interacoes) }]
                : []),
            ]}
          />
          <AudienceInsights data={m ?? {}} />
        </>
      )}

      {editing && (
        <div className="space-y-5 border-t border-border/60 pt-5">
          {has("redes") && (
            <div>
              <FieldLabel title="Redes sociais" />
              <div className="mt-2">
                <RedesEditor redes={influ.redes} onChange={(r) => onPatch({ redes: r })} />
              </div>
            </div>
          )}
          {has("metricas") && (
            <div>
              <FieldLabel title="Métricas do perfil" hint="Por rede social." />
              <div className="mt-2">
                <ProfileMetricsEditor
                  redes={influ.redes}
                  onChangeRedes={(r) => onPatch({ redes: r })}
                  value={influ.profileMetrics}
                  onChange={(profileMetrics) => onPatch({ profileMetrics })}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Recursos → Financeiro. Ordem: RESUMO (faixa horizontal) → PENDÊNCIAS (o que falta, com a ação ao
 * lado) → REMUNERAÇÃO | PAGAMENTO | DADOS BANCÁRIOS | CONTRATO (consulta; o formulário só abre ao
 * clicar em Definir/Editar/Cadastrar) → ATIVIDADE FINANCEIRA. Conceitos SEPARADOS, mesmos dados:
 * REMUNERAÇÃO (o combinado), PAGAMENTO (solicitação + execução no Financeiro), DADOS BANCÁRIOS
 * (`bank`) e CONTRATO. Regras puras em `lib/influencer-finance.ts`.
 *
 * "Aprovar pagamento" é a aprovação da solicitação, que lança a despesa no módulo Financeiro (só
 * `aceito` vira lançamento) — é o que "inicia" o pagamento. Registrar que foi PAGO continua sendo
 * feito no Financeiro (aqui só se lê o resultado). */
function FinanceiroContratoSection({
  influ,
  has,
  bank,
  campanhaId,
  onPatch,
}: {
  influ: Influ;
  has: (k: InfluencerFieldKey) => boolean;
  bank: BankInfo;
  campanhaId?: string;
  onPatch: (patch: Partial<Influ>) => void;
}) {
  const navigate = useNavigate();
  const access = useMyAccess();
  const canFinanceiro = hasPermission(access, "financeiro");
  const execution = useInfluencerPaymentExecution(campanhaId, influ.id);
  const today = todayISO();
  const pag = normalizePagamento(influ.pagamento);
  const state = paymentState(pag, execution, today);
  const rem = remuneracaoSummary(pag);
  const contrato = contratoInfo(influ.contrato, influ.contratoNome);
  const contratoEm = contractAttachedAt(influ.activity);
  const bankItems = bankFields(bank);
  const temBanco = hasBankData(bank);

  const [editing, setEditing] = useState<null | "rem" | "bank">(null);
  const [remDraft, setRemDraft] = useState<PagamentoEntrega | undefined>(influ.pagamento);
  const [bankDraft, setBankDraft] = useState<BankInfo>(bank);
  const [dueOpen, setDueOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const [showAllActivity, setShowAllActivity] = useState(false);
  const contratoRef = useRef<HTMLInputElement>(null);
  const remRef = useRef<HTMLDivElement>(null);
  const bankRef = useRef<HTMLDivElement>(null);

  /** Um único `onPatch` com a mudança E o evento financeiro (evita um sobrescrever o outro). */
  const commit = (patch: Partial<Influ>, text: string) =>
    onPatch({
      ...patch,
      activity: logInfluActivity(influ, text, undefined, "financeiro").activity,
    });
  const setPagamento = (next: PagamentoEntrega | undefined, text: string) =>
    commit({ pagamento: next }, text);

  // Abrir o formulário a partir de "Pendências" leva até o bloco (no celular ele fica mais abaixo).
  const reveal = (ref: React.RefObject<HTMLDivElement | null>) =>
    requestAnimationFrame(() =>
      ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  const startRem = () => {
    // Sem remuneração ainda: o rascunho já nasce "aberto" (o mesmo estado que o botão do editor
    // criaria), para o formulário aparecer de uma vez em vez de pedir um segundo clique.
    setRemDraft(influ.pagamento ?? { tipos: [], config: {}, aprovacao: "pendente" });
    setEditing("rem");
    reveal(remRef);
  };
  const startBank = () => {
    setBankDraft(bank);
    setEditing("bank");
    reveal(bankRef);
  };
  const saveRem = () => {
    const n = normalizePagamento(remDraft);
    if (!n || n.tipos.length === 0) {
      // Nenhuma modalidade escolhida: sem remuneração (só registra se havia uma antes).
      if (rem) commit({ pagamento: undefined }, "removeu a remuneração");
      setEditing(null);
      return;
    }
    const r = remuneracaoSummary(n);
    commit(
      { pagamento: remDraft },
      r?.total != null
        ? `definiu a remuneração em ${formatBRLValue(r.total)}`
        : "atualizou a remuneração",
    );
    setEditing(null);
  };
  const saveBank = () => {
    commit({ bank: bankDraft }, "atualizou os dados para pagamento");
    setEditing(null);
  };
  const uploadContrato = async (file: File) => {
    setBusy(true);
    setFileError("");
    try {
      const url = await uploadEntregaAnexo(file);
      commit(
        { contrato: url, contratoNome: file.name },
        influ.contrato ? "substituiu o contrato" : "anexou o contrato",
      );
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Falha ao subir o contrato.");
    } finally {
      setBusy(false);
    }
  };
  const goToFinanceiro = () =>
    void navigate({ to: "/time", search: { section: "financeiro" as const } });

  // Atividade FINANCEIRA (nunca a atividade geral do influenciador), mais recente primeiro.
  const activityItems = [...(influ.activity ?? []).filter((a) => a.area === "financeiro")]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((a) => ({
      id: a.id,
      day: new Date(a.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      text: `${a.author} ${a.action}`,
    }));
  if (state.key === "pago" && state.paidOn) {
    activityItems.unshift({
      id: "pago-financeiro",
      day: formatIsoDate(state.paidOn).slice(0, 5),
      text: "Pagamento registrado no Financeiro",
    });
  }

  const money = (n: number) => formatBRLValue(n);
  const showRemPag = has("pagamentos");
  const showBanco = has("bancario");
  const showContrato = has("contrato");
  const solid =
    "rounded-md bg-foreground px-2.5 py-1 text-xs font-semibold text-background hover:opacity-90";
  const outline =
    "rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted";
  const payDetail = [
    state.amount > 0 ? money(state.amount) : "",
    state.key === "pago"
      ? state.paidOn
        ? `pago em ${formatIsoDate(state.paidOn)}`
        : ""
      : state.due
        ? `vence ${formatIsoDate(state.due)}`
        : "",
  ]
    .filter(Boolean)
    .join(" · ");

  // ---- RESUMO ----
  const cells: SummaryCell[] = [];
  if (showRemPag) {
    cells.push({
      key: "rem",
      label: "Remuneração",
      value: rem ? (rem.total != null ? money(rem.total) : rem.tipoLabel) : "R$ —",
      caption: rem ? (rem.total != null ? rem.tipoLabel : undefined) : "Não definida",
      tone: rem ? "ok" : "pending",
      emphasis: true,
    });
    cells.push({
      key: "pag",
      label: "Pagamento",
      value: state.label,
      tone: paymentTone(state.key),
    });
  }
  if (showContrato) {
    cells.push({
      key: "contrato",
      label: "Contrato",
      value: contrato.present ? "OK" : "Pendente",
      tone: contrato.present ? "ok" : "pending",
    });
  }
  if (showBanco) {
    cells.push({
      key: "bank",
      label: "Dados bancários",
      value: temBanco ? "OK" : "Pendente",
      tone: temBanco ? "ok" : "pending",
    });
  }

  // ---- PENDÊNCIAS: só o que exige ação, com a ação ao lado ----
  const pending: PendencyItem[] = [];
  if (showRemPag && !rem) {
    pending.push({
      key: "rem",
      text: "Remuneração não definida",
      tone: "pending",
      actions: (
        <button type="button" onClick={startRem} className={outline}>
          Definir
        </button>
      ),
    });
  }
  if (showRemPag && rem && pag) {
    if (state.key === "pendente") {
      pending.push({
        key: "pag",
        text: "Pagamento aguardando aprovação",
        tone: "pending",
        actions: (
          <>
            <button
              type="button"
              onClick={() =>
                setPagamento(
                  { ...pag, aprovacao: "aceito", data: pag.data || todayISO() },
                  "aprovou a solicitação de pagamento",
                )
              }
              className={solid}
            >
              Aprovar pagamento
            </button>
            <QuietButton
              onClick={() =>
                setPagamento(
                  { ...pag, aprovacao: "recusado" },
                  "recusou a solicitação de pagamento",
                )
              }
            >
              Recusar
            </QuietButton>
          </>
        ),
      });
    } else if (state.key === "recusado") {
      pending.push({
        key: "pag",
        text: "Solicitação de pagamento recusada",
        tone: "alert",
        actions: (
          <QuietButton
            onClick={() =>
              setPagamento({ ...pag, aprovacao: "pendente" }, "reabriu a solicitação de pagamento")
            }
          >
            Reabrir solicitação
          </QuietButton>
        ),
      });
    } else if (state.key === "vencido") {
      pending.push({
        key: "pag",
        text: `Pagamento vencido${state.due ? ` em ${formatIsoDate(state.due)}` : ""}`,
        tone: "alert",
        actions: canFinanceiro ? (
          <button type="button" onClick={goToFinanceiro} className={solid}>
            Registrar pagamento →
          </button>
        ) : undefined,
      });
    } else if (state.key === "agendado" && canFinanceiro) {
      pending.push({
        key: "pag",
        text: `Pagamento aprovado${state.due ? ` · vence ${formatIsoDate(state.due)}` : ""} — falta registrar`,
        tone: "info",
        actions: (
          <button type="button" onClick={goToFinanceiro} className={solid}>
            Registrar pagamento →
          </button>
        ),
      });
    }
  }
  if (showBanco && !temBanco) {
    pending.push({
      key: "bank",
      text: "Dados bancários não cadastrados",
      tone: "pending",
      actions: (
        <button type="button" onClick={startBank} className={outline}>
          Cadastrar
        </button>
      ),
    });
  }
  if (showContrato && !contrato.present) {
    pending.push({
      key: "contrato",
      text: "Contrato não anexado",
      tone: "pending",
      actions: (
        <button type="button" onClick={() => contratoRef.current?.click()} className={outline}>
          {busy ? "Enviando..." : "Anexar"}
        </button>
      ),
    });
  }

  return (
    <section aria-label="Financeiro" className="max-w-2xl space-y-8">
      <input
        ref={contratoRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (contratoRef.current) contratoRef.current.value = "";
          if (f) void uploadContrato(f);
        }}
      />

      <FinanceSummary cells={cells} />
      <FinancePendencies items={pending} />

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">
        {showRemPag && (
          <div ref={remRef} className={editing === "rem" ? "md:col-span-2" : undefined}>
            <FinanceSection
              title="Remuneração"
              action={
                rem && editing !== "rem" ? (
                  <QuietButton onClick={startRem}>Editar</QuietButton>
                ) : undefined
              }
            >
              {editing === "rem" ? (
                <div className="space-y-3">
                  <PagamentoEditor value={remDraft} onChange={setRemDraft} parts="remuneracao" />
                  <div className="flex justify-end gap-3">
                    <QuietButton onClick={() => setEditing(null)}>Cancelar</QuietButton>
                    <button type="button" onClick={saveRem} className={solid}>
                      Salvar remuneração
                    </button>
                  </div>
                </div>
              ) : rem ? (
                <div className="space-y-1">
                  {rem.total != null && (
                    <p className="text-xl font-semibold tabular-nums text-foreground">
                      {money(rem.total)}
                    </p>
                  )}
                  {rem.lines.length > 1 || rem.total == null ? (
                    <ul className="space-y-0.5 text-sm">
                      {rem.lines.map((l, i) => (
                        <li key={i}>
                          <span className="text-text-secondary">{l.label} · </span>
                          <span className="text-foreground">{l.value}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-text-secondary">{rem.tipoLabel}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xl font-semibold text-text-secondary">R$ —</p>
                  <p className="text-sm text-text-secondary">Remuneração ainda não definida.</p>
                  <QuietButton onClick={startRem}>Definir remuneração</QuietButton>
                </div>
              )}
            </FinanceSection>
          </div>
        )}

        {showRemPag && (
          <FinanceSection title="Pagamento">
            {state.key === "nao_iniciado" || !pag ? (
              <div className="space-y-1">
                <p className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <StateDot tone="neutral" />
                  Não iniciado
                </p>
                <p className="text-sm text-text-secondary">
                  A remuneração precisa estar definida para iniciar o pagamento.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="space-y-0.5">
                  <p className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <StateDot tone={paymentTone(state.key)} />
                    {state.label}
                  </p>
                  {payDetail && <p className="text-sm text-text-secondary">{payDetail}</p>}
                </div>
                {state.key === "pendente" && (
                  <p className="text-xs text-text-secondary">
                    Aprovar inicia o pagamento: o valor é lançado como despesa no Financeiro.
                  </p>
                )}
                {(state.key === "agendado" || state.key === "vencido") && (
                  <p className="text-xs text-text-secondary">
                    Aprovado e lançado no Financeiro. O pagamento é confirmado lá.
                  </p>
                )}
                {state.key === "cancelado" && (
                  <p className="text-xs text-text-secondary">Lançamento cancelado no Financeiro.</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {state.key === "pendente" && (
                    <>
                      <QuietButton
                        onClick={() =>
                          setPagamento(
                            { ...pag, aprovacao: "aceito", data: pag.data || todayISO() },
                            "aprovou a solicitação de pagamento",
                          )
                        }
                      >
                        Aprovar pagamento
                      </QuietButton>
                      <QuietButton
                        onClick={() =>
                          setPagamento(
                            { ...pag, aprovacao: "recusado" },
                            "recusou a solicitação de pagamento",
                          )
                        }
                      >
                        Recusar
                      </QuietButton>
                    </>
                  )}
                  {state.key === "recusado" && (
                    <QuietButton
                      onClick={() =>
                        setPagamento(
                          { ...pag, aprovacao: "pendente" },
                          "reabriu a solicitação de pagamento",
                        )
                      }
                    >
                      Reabrir solicitação
                    </QuietButton>
                  )}
                  {(state.key === "agendado" || state.key === "vencido") && canFinanceiro && (
                    <QuietButton onClick={goToFinanceiro}>Registrar pagamento →</QuietButton>
                  )}
                  {state.key !== "recusado" && state.key !== "pago" && (
                    <>
                      {dueOpen ? (
                        <div className="w-44">
                          <DateField
                            value={pag.data ?? undefined}
                            onChange={(v) => {
                              setPagamento(
                                { ...pag, data: v },
                                v
                                  ? `definiu o vencimento em ${formatIsoDate(v)}`
                                  : "removeu o vencimento",
                              );
                              setDueOpen(false);
                            }}
                            className="text-xs"
                          />
                        </div>
                      ) : (
                        <QuietButton onClick={() => setDueOpen(true)}>
                          {pag.data ? "Alterar vencimento" : "Definir vencimento"}
                        </QuietButton>
                      )}
                      {pag.aprovacao === "aceito" && (
                        <QuietButton
                          onClick={() =>
                            setPagamento(
                              { ...pag, aprovacao: "pendente" },
                              "voltou a solicitação de pagamento para pendente",
                            )
                          }
                        >
                          Voltar para pendente
                        </QuietButton>
                      )}
                    </>
                  )}
                </div>
                {pag.comprovanteUrl ? (
                  <FileLine
                    name={pag.comprovanteNome || "Comprovante"}
                    hint="Comprovante de pagamento"
                    onOpen={() => openFileUrl(pag.comprovanteUrl!)}
                    onRemove={() =>
                      setPagamento(
                        { ...pag, comprovanteNome: undefined, comprovanteUrl: undefined },
                        "removeu o comprovante de pagamento",
                      )
                    }
                  />
                ) : (
                  pag.aprovacao === "aceito" && (
                    <BriefingAnexoUploadButton
                      quiet
                      onUpload={(nome, url) =>
                        setPagamento(
                          { ...pag, comprovanteNome: nome, comprovanteUrl: url },
                          "anexou o comprovante de pagamento",
                        )
                      }
                    />
                  )
                )}
              </div>
            )}
          </FinanceSection>
        )}

        {showBanco && (
          <div ref={bankRef} className={editing === "bank" ? "md:col-span-2" : undefined}>
            <FinanceSection
              title="Dados bancários"
              action={
                temBanco && editing !== "bank" ? (
                  <QuietButton onClick={startBank}>Editar</QuietButton>
                ) : undefined
              }
            >
              {editing === "bank" ? (
                <div className="space-y-3">
                  <BankFields value={bankDraft} onChange={setBankDraft} compact />
                  <div className="flex justify-end gap-3">
                    <QuietButton onClick={() => setEditing(null)}>Cancelar</QuietButton>
                    <button type="button" onClick={saveBank} className={solid}>
                      Salvar dados
                    </button>
                  </div>
                </div>
              ) : temBanco ? (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                  {bankItems.map((f) => (
                    <div key={f.label} className="contents">
                      <dt className="text-text-secondary">{f.label}</dt>
                      <dd className="min-w-0 break-all text-foreground">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-sm text-text-secondary">Nenhum dado cadastrado.</p>
                  <QuietButton onClick={startBank}>Cadastrar</QuietButton>
                </div>
              )}
            </FinanceSection>
          </div>
        )}

        {showContrato && (
          <FinanceSection title="Contrato">
            {contrato.present ? (
              <div className="space-y-1.5">
                <div>
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                    <span className="truncate">{contrato.name}</span>
                  </p>
                  {contratoEm && (
                    <p className="text-xs text-text-secondary">
                      Anexado em {new Date(contratoEm).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <QuietButton onClick={() => openFileUrl(influ.contrato!)}>Visualizar</QuietButton>
                  <QuietButton onClick={() => contratoRef.current?.click()}>
                    {busy ? "Enviando..." : "Substituir"}
                  </QuietButton>
                  <QuietButton
                    onClick={() =>
                      commit({ contrato: undefined, contratoNome: undefined }, "removeu o contrato")
                    }
                  >
                    Remover
                  </QuietButton>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-sm text-text-secondary">Nenhum contrato anexado.</p>
                <QuietButton onClick={() => contratoRef.current?.click()}>
                  {busy ? "Enviando..." : "Anexar contrato"}
                </QuietButton>
              </div>
            )}
            {fileError && <p className="text-xs text-destructive">{fileError}</p>}
          </FinanceSection>
        )}
      </div>

      <FinanceActivity
        items={activityItems}
        showAll={showAllActivity}
        onToggleAll={() => setShowAllActivity((v) => !v)}
      />
    </section>
  );
}

/** Corpo do detalhe — SÓ operação: próxima ação (quando houver) → entregas → feedback do cliente
 * (quando houver) → atividade recente. Perfil, financeiro, contexto, inscrição, NPS e outros dados
 * ficam em "Recursos" (`WorkspaceResourceBody`), a camada de consulta do influenciador. */
function WorkspaceDetailBody({
  influ,
  has,
  onOpenEntrega,
  onAddEntrega,
  onRemoveEntrega,
  onRunEntregaAction,
  onSendToClient,
  onSetStatus,
}: {
  influ: Influ;
  has: (k: InfluencerFieldKey) => boolean;
  onOpenEntrega: (id: string) => void;
  onAddEntrega: () => void;
  onRemoveEntrega: (e: Entrega) => Promise<boolean>;
  onSendToClient: () => void;
  onSetStatus: (status: InfluStatus) => void;
  onRunEntregaAction: (
    entregaId: string,
    action: EntregaEngineActionKind,
    opts?: {
      anexo?: { categoria: EntregaAnexoCategoria; nome: string; url: string };
      anexos?: { categoria: EntregaAnexoCategoria; nome: string; url: string }[];
    },
  ) => void;
}) {
  const action = nextBestAction(influ);
  const feedbacks = clientFeedbacks(influ);
  const [verTudo, setVerTudo] = useState(false);
  const [feedbackAberto, setFeedbackAberto] = useState<string | null>(null);

  return (
    <div className="space-y-8 px-5 py-4">
      {/* PRÓXIMA AÇÃO — só quando existe algo a fazer (ou a esperar). */}
      {action.kind !== "nenhuma" && (
        <NextActionPanel
          action={action}
          onOpenEntrega={onOpenEntrega}
          onRunEntregaAction={onRunEntregaAction}
          onSendToClient={onSendToClient}
          onSetStatus={onSetStatus}
          onAddEntrega={onAddEntrega}
        />
      )}

      {/* ENTREGAS — unidades operacionais, cada uma com o feedback do cliente embaixo. */}
      {has("entregas") && (
        <EntregasRows
          entregas={influ.entregas}
          feedbacks={feedbacks}
          onOpen={onOpenEntrega}
          onAdd={onAddEntrega}
          onRemove={(e) => void onRemoveEntrega(e)}
        />
      )}

      {/* FEEDBACK DO CLIENTE — mora dentro da entrega a que se refere; aqui só o que não é de
       * nenhuma entrega (seleção não aprovada). Sem feedback, nada é renderizado. */}
      <SelectionFeedback items={feedbacks} />

      {/* HISTÓRICO — o mesmo componente do detalhe da entrega; "Ver tudo" expande aqui mesmo. */}
      <EntregaHistorico
        eventos={historicoInfluEventos(influ.activity, influ.entregas)}
        showAll={verTudo}
        onToggleAll={() => setVerTudo((v) => !v)}
        feedbackAberto={feedbackAberto}
        onToggleFeedback={(id) => setFeedbackAberto((c) => (c === id ? null : id))}
        limit={5}
      />
    </div>
  );
}

/** Recursos → Contexto da campanha: por que o influenciador foi escolhido, briefing (com arquivo),
 * observações compartilhadas e checklist. Mesmos campos, mesma regra de visibilidade no Portal do
 * Cliente (motivo, briefing e observações aparecem lá). */
function ContextoCampanhaView({
  influ,
  onPatch,
  onSetChecklist,
  onApplyChecklistToAll,
}: {
  influ: Influ;
  onPatch: (patch: Partial<Influ>) => void;
  onSetChecklist: (checklist: ChecklistItem[]) => void;
  onApplyChecklistToAll: (checklist: ChecklistItem[]) => void;
}) {
  return (
    <div className="space-y-6">
      <Modulo
        prominent
        title="Por que escolhemos este influenciador?"
        subtitle="O motivo registrado aparece também para o cliente no portal."
      >
        <ContextoTexto
          key={influ.id}
          ariaLabel="Motivo da escolha"
          emphasis
          value={influ.justificativaTime ?? ""}
          emptyText="Ainda não registramos o motivo da escolha."
          emptyHint="Explique rapidamente por que este influenciador foi escolhido."
          placeholder="Ex.: Forte afinidade com o público da campanha, bom histórico de conteúdo e audiência concentrada na região..."
          onSave={(v) => onPatch({ justificativaTime: v || undefined })}
        />
      </Modulo>
      <Modulo
        title="Orientações da campanha"
        subtitle="Informações importantes para a execução deste trabalho."
      >
        <BriefingEMateriais
          key={`${influ.id}-briefing`}
          texto={influ.briefingPersonalizado ?? ""}
          arquivo={
            influ.briefingAnexoUrl
              ? { nome: influ.briefingAnexoNome ?? "", url: influ.briefingAnexoUrl }
              : undefined
          }
          onSaveTexto={(v) => onPatch({ briefingPersonalizado: v || undefined })}
          onRemoveArquivo={() =>
            onPatch({ briefingAnexoNome: undefined, briefingAnexoUrl: undefined })
          }
          renderUpload={(label) => (
            <BriefingAnexoUploadButton
              quiet
              label={label}
              onUpload={(nome, url) => onPatch({ briefingAnexoNome: nome, briefingAnexoUrl: url })}
            />
          )}
        />
      </Modulo>
      <Modulo title="Execução" subtitle="Informações práticas para conduzir este trabalho.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-0 md:divide-x md:divide-border/60">
          <div className="md:pr-5">
            <ContextoTexto
              key={`${influ.id}-obs`}
              label="Observações"
              ariaLabel="Observações"
              value={influ.observacoes ?? ""}
              emptyText="Nenhuma observação registrada."
              emptyHint="O cliente também pode escrever aqui pelo portal."
              placeholder="Ex.: prefere ser contatado por WhatsApp à tarde..."
              onSave={(v) => onPatch({ observacoes: v || undefined })}
            />
          </div>
          <div className="min-w-0 border-t border-border/60 pt-5 md:border-t-0 md:pt-0 md:pl-5">
            <ChecklistSection
              checklist={influ.checklist ?? []}
              onChange={onSetChecklist}
              onApplyToAll={onApplyChecklistToAll}
            />
          </div>
        </div>
      </Modulo>
    </div>
  );
}

/** Recursos → NPS: situação da pesquisa deste influenciador e o link de resposta (a ação que antes
 * vivia no menu "⋯"). */
function NpsView({ influ, nps }: { influ: Influ; nps?: InfluNpsBoardProp }) {
  const link = nps?.linksByInfluId[influ.id];
  if (!link || !nps) {
    return <p className="text-sm text-text-secondary">Sem pesquisa NPS para este influenciador.</p>;
  }
  return (
    <section aria-label="NPS" className="space-y-3">
      <p className="text-sm">
        <span className="font-semibold text-foreground">
          {link.respondido
            ? `Respondido${link.score != null ? ` · nota ${link.score}` : ""}`
            : "Aguardando resposta"}
        </span>
      </p>
      <p className="text-sm text-text-secondary">
        Link de resposta individual deste influenciador.
      </p>
      <button
        type="button"
        onClick={() => nps.onCopyLink(influ.id)}
        className="rounded-md bg-foreground px-2.5 py-1 text-xs font-semibold text-background hover:opacity-90"
      >
        Copiar link
      </button>
    </section>
  );
}

/** Corpo do nível "Recursos" — a camada de CONSULTA do influenciador. Cada recurso reaproveita o
 * componente que já existia (sem duplicar lógica); o que mudou é só o lugar onde aparece. */
function WorkspaceResourceBody({
  resource,
  influ,
  has,
  bank,
  campanhaId,
  nps,
  onPatch,
  onSetChecklist,
  onApplyChecklistToAll,
}: {
  resource: ResourceKey;
  influ: Influ;
  has: (k: InfluencerFieldKey) => boolean;
  bank: BankInfo;
  campanhaId?: string;
  nps?: InfluNpsBoardProp;
  onPatch: (patch: Partial<Influ>) => void;
  onSetChecklist: (checklist: ChecklistItem[]) => void;
  onApplyChecklistToAll: (checklist: ChecklistItem[]) => void;
}) {
  return (
    <div className="px-5 py-5">
      {resource === "perfil" && <PerfilAudienciaView influ={influ} has={has} onPatch={onPatch} />}
      {resource === "financeiro" && (
        <FinanceiroContratoSection
          influ={influ}
          has={has}
          bank={bank}
          campanhaId={campanhaId}
          onPatch={onPatch}
        />
      )}
      {resource === "contexto" && (
        <ContextoCampanhaView
          influ={influ}
          onPatch={onPatch}
          onSetChecklist={onSetChecklist}
          onApplyChecklistToAll={onApplyChecklistToAll}
        />
      )}
      {resource === "inscricao" && <InscricaoDadosSection influ={influ} />}
      {resource === "nps" && <NpsView influ={influ} nps={nps} />}
      {resource === "outros" && influ.midiaKit && influ.midiaKit.length > 0 && (
        <section aria-label="Mídia kit e arquivos" className="space-y-3">
          <CockpitTitle>Mídia kit e arquivos</CockpitTitle>
          {influ.midiaKit.map((a) => (
            <MidiaKitCard key={a.id} campanhaInfluId={influ.id} attachment={a} />
          ))}
        </section>
      )}
    </div>
  );
}

/** Atividade no modo "secundário" — mesmo workspace, troca de conteúdo em
 * vez de abrir um segundo overlay. Filtros preservados (Tudo/Comentários/
 * Histórico) e campo de comentário sticky no rodapé. */
function WorkspaceActivityBody({
  influ,
  filter,
  onFilterChange,
  commentText,
  setCommentText,
  onComment,
}: {
  influ: Influ;
  filter: "tudo" | "comentarios" | "historico";
  onFilterChange: (f: "tudo" | "comentarios" | "historico") => void;
  commentText: string;
  setCommentText: (v: string) => void;
  onComment: (text: string) => void;
}) {
  const items = [
    ...(influ.activity ?? []).map((a) => ({ kind: "activity" as const, item: a })),
    ...(influ.comments ?? []).map((c) => ({ kind: "comment" as const, item: c })),
  ]
    .filter((e) => {
      if (filter === "comentarios") return e.kind === "comment";
      if (filter === "historico") return e.kind === "activity";
      return true;
    })
    .sort((a, b) => new Date(a.item.createdAt).getTime() - new Date(b.item.createdAt).getTime());

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-4 py-2.5">
        {(
          [
            ["tudo", "Tudo"],
            ["comentarios", "Comentários"],
            ["historico", "Histórico"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onFilterChange(value)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === value
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {items.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Nenhuma atividade ou comentário ainda.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((e) => (
              <div key={e.item.id} className="flex min-w-0 items-start gap-2">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${e.item.color}`}
                >
                  {e.item.initials}
                </span>
                {e.kind === "activity" ? (
                  <div className="min-w-0 flex-1 break-words text-xs leading-relaxed [overflow-wrap:anywhere]">
                    <span className="font-medium text-foreground">{e.item.author}</span>{" "}
                    <span className="text-muted-foreground">{e.item.action}</span>
                    <div className="text-[11px] text-text-secondary">
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
                      <span className="text-[11px] text-text-secondary">
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
      <div className="shrink-0 border-t border-border bg-background p-3">
        <label htmlFor="influ-comment-input" className="sr-only">
          Novo comentário
        </label>
        <textarea
          id="influ-comment-input"
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
          className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none placeholder:text-text-secondary focus:border-primary"
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
      <DialogContent
        className="flex max-h-[92vh] max-w-2xl flex-col gap-0 overflow-hidden border-border bg-background p-0"
        mobileFullScreen
      >
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
              <NativeSelect
                value={nicho}
                onChange={(e) => setNicho(e.target.value)}
                className="w-full"
              >
                <option value="">Selecione um nicho</option>
                {NICHOS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
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

/** Botão "Anexar arquivo" pro briefing personalizado — sobe pro Storage
 * (bucket `entrega-anexos`, mesmo usado pelos anexos de entrega) em vez de
 * base64 embutido no jsonb, que falha silenciosamente em arquivos maiores. */
function BriefingAnexoUploadButton({
  onUpload,
  quiet = false,
  label = "Anexar arquivo",
}: {
  onUpload: (nome: string, url: string) => void;
  label?: string;
  /** Só texto (sem moldura tracejada), para contextos densos. */
  quiet?: boolean;
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
        className={
          quiet
            ? "inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            : "inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
        }
      >
        {!quiet && <Paperclip className="h-3 w-3" />} {uploading ? "Enviando..." : label}
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
      <p role="heading" aria-level={3} className="text-sm font-semibold text-foreground">
        {title}
      </p>
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
          <NativeSelect
            value={value.tipoConta ?? ""}
            onChange={(e) => set({ tipoConta: e.target.value as BankInfo["tipoConta"] })}
          >
            <option value="">—</option>
            <option value="corrente">Corrente</option>
            <option value="poupanca">Poupança</option>
          </NativeSelect>
        </div>
      </div>
      <div className="grid grid-cols-[140px_1fr] gap-2">
        <div>
          <label className={lbl}>Tipo PIX</label>
          <NativeSelect
            value={value.pixTipo ?? ""}
            onChange={(e) => set({ pixTipo: e.target.value as BankInfo["pixTipo"] })}
          >
            <option value="">—</option>
            <option value="cpf">CPF</option>
            <option value="cnpj">CNPJ</option>
            <option value="email">E-mail</option>
            <option value="telefone">Telefone</option>
            <option value="aleatoria">Aleatória</option>
          </NativeSelect>
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
  parts = "all",
}: {
  value?: PagamentoEntrega;
  onChange: (p: PagamentoEntrega | undefined) => void;
  /** "remuneracao" = só o combinado (modalidades e valores); "pagamento" = vencimento e comprovante. */
  parts?: "all" | "remuneracao" | "pagamento";
}) {
  const showRem = parts !== "pagamento";
  const showPag = parts !== "remuneracao";
  const norm = normalizePagamento(value);
  if (!norm) {
    return (
      <button
        type="button"
        onClick={() => onChange({ tipos: [], config: {}, aprovacao: "pendente" })}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      >
        <Coins className="h-3 w-3" /> Definir remuneração
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
      {showRem && (
        <>
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
              aria-label="Remover remuneração"
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
        </>
      )}

      {showPag && (
        <>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Vencimento</p>
            <DateField
              value={norm.data ?? undefined}
              onChange={(v) => update({ data: v })}
              className="text-xs"
            />
          </div>

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
        </>
      )}
    </div>
  );
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

// Precisa acompanhar o `file_size_limit` do bucket `entrega-anexos`
// (500MB, ver migration `20260930120000_raise_relatorios_entregas_bucket_limits_500mb.sql`)
// E o "Max file size" configurado no Storage do Supabase (Dashboard →
// Storage → Configuration) — esse teto GLOBAL do projeto vale
// independente do limite do bucket, então precisa estar em pelo menos
// 500MB também (ajuste manual no Dashboard, não dá pra mudar por SQL/
// migration). Checar no cliente evita esperar o upload inteiro (às vezes
// minutos, num vídeo grande) só pra descobrir no fim que o servidor ia
// recusar.
const ENTREGA_ANEXO_MAX_BYTES = 500 * 1024 * 1024;

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

/* ============================================================
 * Marketplace interno — adicionar influenciadores direto do Banco de
 * Influenciadores, sem recriar do zero a cada campanha.
 * ============================================================ */

function BankPickerDialog({
  open,
  onOpenChange,
  currentInflus,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentInflus: Influ[];
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

  // Identidade real (e-mail/telefone/rede normalizados — nome só como
  // sinal adicional), não mais só nome em minúsculas — ver
  // `findExistingBankInfluMatch` pro porquê (causa confirmada de
  // duplicatas: nomes de exibição divergentes pra mesma pessoa).
  const alreadyAddedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const b of bank) {
      if (findExistingBankInfluMatch(b, currentInflus)) ids.add(b.id);
    }
    return ids;
  }, [bank, currentInflus]);

  const nichos = useMemo(() => NICHOS.filter((n) => bank.some((b) => b.nicho === n)), [bank]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bank.filter((b) => {
      if (nicho && b.nicho !== nicho) return false;
      if (!q) return true;
      return (
        b.nome.toLowerCase().includes(q) || b.redes.some((r) => r.handle.toLowerCase().includes(q))
      );
    });
  }, [bank, query, nicho]);

  const toggle = (id: string) => {
    if (alreadyAddedIds.has(id)) return;
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden border-border bg-background p-0"
        mobileFullScreen
      >
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
          <NativeSelect value={nicho} onChange={(e) => setNicho(e.target.value)}>
            <option value="">Todos os nichos</option>
            {nichos.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <EmptyHint text="Nenhum influenciador disponível para adicionar." />
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((b) => {
                const active = selected.has(b.id);
                const alreadyInCampanha = alreadyAddedIds.has(b.id);
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      disabled={alreadyInCampanha}
                      onClick={() => toggle(b.id)}
                      className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                        alreadyInCampanha
                          ? "cursor-not-allowed border-border opacity-50"
                          : active
                            ? "border-foreground bg-muted"
                            : "border-border hover:bg-muted/50"
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
                      {alreadyInCampanha ? (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Já está nesta campanha
                        </span>
                      ) : (
                        active && <CheckCircle2 className="h-4 w-4 shrink-0 text-foreground" />
                      )}
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
        if (has("redes")) {
          const withPrimary = ensurePrimary(i.redes);
          row.push(
            withPrimary
              .map(
                (r) =>
                  `${r.plataforma}:${r.handle}${r.isPrimary && withPrimary.filter((x) => x.plataforma === r.plataforma).length > 1 ? " (Principal)" : ""}`,
              )
              .join(" | "),
          );
        }
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
            <NativeSelect
              value={format}
              onChange={(e) => setFormat(e.target.value as "csv" | "json" | "pdf")}
            >
              <option value="csv">CSV (Excel)</option>
              <option value="json">JSON</option>
              <option value="pdf">PDF</option>
            </NativeSelect>
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
