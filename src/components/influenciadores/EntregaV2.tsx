import { useState, type ReactNode, type Ref } from "react";
import {
  AlignLeft,
  ArrowLeft,
  Clapperboard,
  FileText,
  Loader2,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  User,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { EditorialCaption } from "@/components/marketing/editorial/EditorialCaption";
import { overdueLabel } from "@/components/tasks/task-ui";
import { useTeamMembers } from "@/components/tasks/task-people";
import { feedbackExcerpt } from "@/lib/entrega-ajustes";
import {
  ARQUIVO_CATEGORIA_LABEL,
  ENTREGA_FASE_COLUNAS,
  ENTREGA_FASE_COLUNA_LABEL,
  PRAZO_CAMPOS,
  agruparAnexos,
  arquivoTipo,
  formatDiaMes,
  tilesDaEntrega,
  type ArquivoGrupo,
  type ArquivoTile,
  type ArquivoTileKey,
  type EntregaFaseColuna,
  type EntregaFocus,
  type PrazoCampo,
  type StepperStep,
} from "@/lib/entrega-detail";
import { type HistoricoEvento } from "@/lib/entrega-historico";
import type { Entrega, EntregaAnexo, EntregaAnexoCategoria } from "@/lib/influencer-model";
import type { EntregaTone } from "@/lib/influencer-next-action";
import type { EditorialChannel } from "@/lib/marketing-editorial";
import { cn } from "@/lib/utils";
import { CockpitTitle, QuietButton } from "./InfluencerCockpit";
import { ENTREGA_TONE_DOT } from "./entrega-tone";

/**
 * Peças de apresentação do detalhe da ENTREGA (V2). Só layout: a máquina de estados, o motor de
 * ações, o ciclo de ajustes e a persistência continuam onde sempre estiveram (ver
 * `lib/entrega-detail.ts` e `lib/entrega-historico.ts` para o que mostrar e `EntregaDetailBody` no
 * board para o que fazer).
 *
 * Cinco blocos, nesta ordem: cabeçalho, progresso, próxima ação, arquivos e histórico. Cor só como
 * sinal de estado; o feedback do cliente vive DENTRO do histórico (não há seção própria).
 */

const abrirUrl = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

const ICONE_BOTAO =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/* ============================================================
 * Cabeçalho: [←] [foto] influenciador / entrega · unidades / @handle · rede   Editar ⋮ ×
 * ============================================================ */

export function EntregaHeader({
  titulo,
  unidades,
  grupo,
  influNome,
  influFoto,
  influContexto,
  onBack,
  onClose,
  editing,
  onToggleEdit,
  menu,
  editor,
}: {
  /** Nome da entrega ("Reels", "Reels · Verão"). */
  titulo: string;
  /** "1 unidade" — secundário, nunca o título. */
  unidades: string | null;
  /** Unidade independente de um grupo (aprovada separadamente das demais). */
  grupo: boolean;
  influNome?: string;
  influFoto?: string;
  /** "@handle · Instagram". */
  influContexto?: string;
  onBack?: () => void;
  /** Fechar o painel — o cabeçalho desenha o próprio X (o `SheetContent` sai com `hideClose`), para
   * ele nunca ficar escondido atrás do cabeçalho fixo nem competir com Editar / ⋮. */
  onClose?: () => void;
  editing: boolean;
  onToggleEdit: () => void;
  menu: ReactNode;
  editor?: ReactNode;
}) {
  const aviso = grupo ? "Unidade independente — aprovada separadamente das demais." : undefined;
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background px-4 py-2.5 sm:px-5">
      <div className="flex items-center gap-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar ao influenciador"
            title="Voltar ao influenciador"
            className={cn(ICONE_BOTAO, "-ml-1.5")}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        {influNome !== undefined && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
            {influFoto ? (
              <img src={influFoto} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {influNome ? (
            <>
              <h2 className="truncate text-base font-semibold leading-tight tracking-tight text-foreground">
                {influNome}
              </h2>
              <p className="truncate text-sm leading-tight text-foreground" title={aviso}>
                <span className="font-medium">{titulo || "Sem tipo"}</span>
                {unidades && <span className="text-text-secondary"> · {unidades}</span>}
              </p>
              {influContexto && (
                <p className="truncate text-xs leading-tight text-text-secondary">
                  {influContexto}
                </p>
              )}
            </>
          ) : (
            <h2
              className="truncate text-base font-semibold leading-tight tracking-tight text-foreground"
              title={aviso}
            >
              {titulo || "Sem tipo"}
              {unidades && <span className="font-normal text-text-secondary"> · {unidades}</span>}
            </h2>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleEdit}
            aria-expanded={editing}
            className="hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:inline-flex"
          >
            <Pencil className="h-3 w-3" />
            {editing ? "Concluir" : "Editar"}
          </button>
          {menu}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Fechar" className={ICONE_BOTAO}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {editing && editor && <div className="mt-2.5">{editor}</div>}
    </header>
  );
}

/** Edição rápida de tipo, título e quantidade — abre sob demanda, uma linha de campos. */
export function EntregaEditorInline({
  tipo,
  titulo,
  quantidade,
  grupo,
  onChange,
}: {
  tipo: string;
  titulo?: string;
  quantidade: number;
  grupo: boolean;
  onChange: (patch: Partial<Pick<Entrega, "tipo" | "titulo" | "quantidade">>) => void;
}) {
  const input =
    "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        list="entregas-tipos"
        value={tipo}
        onChange={(e) => onChange({ tipo: e.target.value })}
        placeholder="Tipo (Reels, Stories...)"
        aria-label="Tipo da entrega"
        className={cn(input, "min-w-[120px] flex-1 font-medium sm:w-40 sm:flex-none")}
      />
      <input
        value={titulo ?? ""}
        onChange={(e) => onChange({ titulo: e.target.value || undefined })}
        placeholder="Título (opcional)"
        aria-label="Título da entrega"
        className={cn(input, "min-w-[140px] flex-[2]")}
      />
      {!grupo && (
        <div className="flex shrink-0 items-center rounded-md border border-border bg-background">
          <button
            type="button"
            aria-label="Diminuir quantidade"
            onClick={() => onChange({ quantidade: Math.max(1, quantidade - 1) })}
            className="h-8 w-8 text-sm text-text-secondary hover:text-foreground"
          >
            −
          </button>
          <span className="w-7 text-center text-sm font-medium tabular-nums">{quantidade}</span>
          <button
            type="button"
            aria-label="Aumentar quantidade"
            onClick={() => onChange({ quantidade: quantidade + 1 })}
            className="h-8 w-8 text-sm text-text-secondary hover:text-foreground"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

/** Menu ⋮: só ações secundárias (a principal fica na superfície de "Próxima ação"). */
export function EntregaMenu({
  colunaAtual,
  grupo,
  publicada,
  podeSepararArquivos,
  onEditar,
  onEditarPublicacao,
  onMover,
  onSplitUnidade,
  onSplitExistente,
  onRemover,
}: {
  colunaAtual: EntregaFaseColuna;
  grupo: boolean;
  publicada: boolean;
  /** Há arquivos irmãos já enviados que podem virar uma unidade cada. */
  podeSepararArquivos: boolean;
  onEditar: () => void;
  onEditarPublicacao: () => void;
  onMover: (coluna: EntregaFaseColuna) => void;
  onSplitUnidade: (delta: 1 | -1) => void;
  onSplitExistente: () => void;
  onRemover: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Mais ações da entrega" className={ICONE_BOTAO}>
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem className="sm:hidden" onSelect={onEditar}>
          <Pencil className="h-3.5 w-3.5" /> Editar entrega
        </DropdownMenuItem>
        {publicada && (
          <DropdownMenuItem onSelect={onEditarPublicacao}>Link do post e métricas</DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Mover para</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {ENTREGA_FASE_COLUNAS.map((c) => (
              <DropdownMenuItem key={c} disabled={c === colunaAtual} onSelect={() => onMover(c)}>
                {ENTREGA_FASE_COLUNA_LABEL[c]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {grupo ? (
          <>
            <DropdownMenuItem onSelect={() => onSplitUnidade(1)}>
              Adicionar unidade
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSplitUnidade(-1)}>
              Remover última unidade
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={() => onSplitUnidade(1)}>
            Dividir em unidades
          </DropdownMenuItem>
        )}
        {podeSepararArquivos && (
          <DropdownMenuItem onSelect={onSplitExistente}>
            Separar arquivos enviados em unidades
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRemover} className="text-destructive focus:text-destructive">
          <Trash2 className="h-3.5 w-3.5" /> Remover entrega
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ============================================================
 * Progresso (fino) + prazos sob cada etapa
 * ============================================================ */

function StepDot({ step, tone }: { step: StepperStep; tone: EntregaTone }) {
  if (step.state === "upcoming") {
    return (
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full border border-border bg-background"
      />
    );
  }
  const color =
    step.state === "current"
      ? ENTREGA_TONE_DOT[tone]
      : step.key === "CONCLUIDO"
        ? "bg-emerald-500"
        : "bg-muted-foreground/60";
  return (
    <span
      aria-hidden
      className={cn(
        "shrink-0 rounded-full",
        color,
        step.state === "current" ? "h-3 w-3" : "h-2.5 w-2.5",
      )}
    />
  );
}

export function EntregaStepper({
  steps,
  tone,
  atrasoDias,
  datas,
  editing,
  onToggleEdit,
  onChangeData,
}: {
  steps: StepperStep[];
  tone: EntregaTone;
  /** Dias de atraso da publicação (ou `null`). */
  atrasoDias: number | null;
  datas: Record<PrazoCampo, string | undefined>;
  editing: boolean;
  onToggleEdit: () => void;
  onChangeData: (campo: PrazoCampo, valor: string | undefined) => void;
}) {
  return (
    <section aria-label="Progresso" className="space-y-1.5">
      <CockpitTitle
        action={
          <QuietButton onClick={onToggleEdit}>{editing ? "Concluir" : "Editar prazos"}</QuietButton>
        }
      >
        Progresso
      </CockpitTitle>
      <ol className="grid grid-cols-4">
        {steps.map((s, i) => {
          const atrasada = s.key === "PUBLICACAO" && atrasoDias != null;
          return (
            <li
              key={s.key}
              aria-current={s.state === "current" ? "step" : undefined}
              className="min-w-0 pr-2"
            >
              <div className="flex h-3 items-center">
                <StepDot step={s} tone={tone} />
                {i < steps.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      "mx-1.5 h-px flex-1",
                      s.state === "done" ? "bg-muted-foreground/50" : "bg-border",
                    )}
                  />
                )}
              </div>
              <p
                className={cn(
                  "mt-1 truncate text-xs",
                  s.state === "current"
                    ? "font-semibold text-foreground"
                    : "font-medium text-text-secondary",
                )}
              >
                {s.label}
              </p>
              <p
                className={cn(
                  "truncate text-[11px] tabular-nums",
                  atrasada ? "font-medium text-red-700 dark:text-red-400" : "text-text-secondary",
                )}
              >
                {s.date ? formatDiaMes(s.date) : "—"}
              </p>
              {atrasada && (
                <p className="truncate text-[11px] font-medium text-red-700 dark:text-red-400">
                  {overdueLabel(atrasoDias)}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {editing && (
        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
          {PRAZO_CAMPOS.map(([campo, label]) => (
            <label key={campo} className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[11px] font-medium text-text-secondary">{label}</span>
              <DateField
                value={datas[campo] ?? undefined}
                onChange={(v) => onChangeData(campo, v)}
                className="w-full min-w-0 text-xs"
              />
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================
 * Próxima ação — a única superfície destacada; uma ação principal
 * ============================================================ */

export function EntregaProximaAcao({
  focus,
  busy,
  error,
  onPrimary,
  onSecondary,
  onOpenArquivo,
}: {
  focus: EntregaFocus;
  busy: boolean;
  error?: string;
  onPrimary: () => void;
  onSecondary: () => void;
  /** Abre o arquivo que o cliente está analisando (estados de espera). */
  onOpenArquivo?: () => void;
}) {
  const p = focus.primary;
  const abrir = focus.openCategoria === "Conteúdo final" ? "conteúdo" : "roteiro";
  return (
    <section
      aria-label={focus.rotulo}
      className="rounded-lg border border-border bg-card px-3.5 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-52">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ENTREGA_TONE_DOT[focus.tone])}
            />
            <h3 className="text-[11px] font-semibold uppercase leading-4 tracking-wide text-text-secondary">
              {focus.rotulo}
            </h3>
          </div>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">{focus.title}</p>
          {focus.hint && (
            <p className="mt-0.5 text-xs leading-snug text-text-secondary">{focus.hint}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
          {focus.secondary && (
            <QuietButton onClick={onSecondary}>{focus.secondary.label}</QuietButton>
          )}
          {p?.kind === "post" ? (
            <Button asChild size="sm" variant="outline">
              <a href={p.url} target="_blank" rel="noreferrer">
                {p.label}
              </a>
            </Button>
          ) : p ? (
            <Button
              size="sm"
              variant={p.kind === "publicacao" ? "outline" : "default"}
              onClick={onPrimary}
              isLoading={busy}
            >
              {p.label}
            </Button>
          ) : (
            onOpenArquivo && <QuietButton onClick={onOpenArquivo}>Abrir {abrir} →</QuietButton>
          )}
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </section>
  );
}

/* ============================================================
 * Arquivos — pequenos quadrados lado a lado (Roteiro, Gravação, Conteúdo final, Legenda)
 * ============================================================ */

const TILE_ICON: Record<ArquivoTileKey, typeof FileText> = {
  Roteiro: FileText,
  Gravação: Video,
  "Conteúdo final": Clapperboard,
  Legenda: AlignLeft,
  Outro: Paperclip,
};

/** Ordem do menu "+ Adicionar" (todas as categorias, inclusive "Outros arquivos"). */
const ADICIONAR_ORDEM: EntregaAnexoCategoria[] = ["Roteiro", "Gravação", "Conteúdo final", "Outro"];

function TileGlyph({ tile, enviando }: { tile: ArquivoTile; enviando: boolean }) {
  const Icon = TILE_ICON[tile.key];
  const primeiro = tile.atual[0];
  if (enviando) {
    return <Loader2 className="h-5 w-5 animate-spin text-text-secondary" aria-label="Enviando" />;
  }
  if (primeiro && arquivoTipo(primeiro.nome) === "imagem") {
    return (
      <img
        src={primeiro.url}
        alt=""
        className="h-7 w-7 shrink-0 rounded object-cover ring-1 ring-border"
      />
    );
  }
  return <Icon className="h-5 w-5 text-text-secondary" strokeWidth={1.5} />;
}

/** Linha de estado do quadrado: curta no celular ("3 arq. · V1"), completa a partir de `sm`. */
function TileEstado({ tile, enviando }: { tile: ArquivoTile; enviando: boolean }) {
  if (enviando) return <>Enviando…</>;
  if (tile.estado === tile.estadoCurto) return <>{tile.estado}</>;
  return (
    <>
      <span className="sm:hidden">{tile.estadoCurto}</span>
      <span className="hidden sm:inline">{tile.estado}</span>
    </>
  );
}

/** Ponto laranja: o cliente pediu ajuste neste material. */
function TileAtencao() {
  return (
    <span
      aria-hidden
      title="Ajuste pedido pelo cliente"
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500"
    />
  );
}

/** Nome do material: até duas linhas (no celular "Conteúdo final" não cabe numa). */
function TileLabel({ tile, className }: { tile: ArquivoTile; className?: string }) {
  return (
    <span
      className={cn(
        "line-clamp-2 max-w-full break-words text-xs font-medium leading-tight text-foreground",
        className,
      )}
    >
      {tile.label}
    </span>
  );
}

function VersoesLista({
  titulo,
  grupo,
  onRemoverArquivo,
}: {
  titulo: string;
  grupo: ArquivoGrupo;
  onRemoverArquivo: (a: EntregaAnexo) => void;
}) {
  const versoes = [grupo.atual, ...grupo.anteriores];
  return (
    <div className="space-y-2.5">
      <CockpitTitle>{titulo} · versões</CockpitTitle>
      <ul className="space-y-2.5">
        {versoes.map((v, i) => {
          const data = v.anexos.find((a) => a.criadoEm)?.criadoEm;
          return (
            <li key={v.versao}>
              <p className="flex items-baseline justify-between gap-2 text-xs">
                <span className={cn("font-semibold", i > 0 && "text-text-secondary")}>
                  V{v.versao}
                  {i === 0 && " · atual"}
                </span>
                {data && (
                  <span className="tabular-nums text-text-secondary">{formatDiaMes(data)}</span>
                )}
              </p>
              <ul className="mt-0.5 divide-y divide-border/40">
                {v.anexos.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 py-1">
                    <span
                      className="min-w-0 flex-1 truncate text-sm text-foreground"
                      title={a.nome}
                    >
                      {a.nome}
                    </span>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs font-medium text-text-secondary underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Abrir
                    </a>
                    <button
                      type="button"
                      onClick={() => onRemoverArquivo(a)}
                      aria-label={`Remover ${a.nome}`}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-muted hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function EntregaArquivos({
  anexos,
  legenda,
  canal,
  ajusteCategoria,
  enviando,
  error,
  onPick,
  onNovaVersao,
  onSubstituir,
  onRemoverVersao,
  onRemoverArquivo,
  onSalvarLegenda,
  onCopiarLegenda,
  onRemoverLegenda,
}: {
  anexos: EntregaAnexo[] | undefined;
  legenda: string | undefined;
  canal: EditorialChannel;
  /** Material com pedido de ajuste do cliente em aberto. */
  ajusteCategoria?: EntregaAnexoCategoria;
  enviando: EntregaAnexoCategoria | null;
  error?: string;
  /** Quadrado vazio ou "+ Adicionar": abre o seletor de arquivos desta categoria. */
  onPick: (c: EntregaAnexoCategoria) => void;
  onNovaVersao: (c: EntregaAnexoCategoria) => void;
  onSubstituir: (tile: ArquivoTile) => void;
  onRemoverVersao: (tile: ArquivoTile) => void;
  onRemoverArquivo: (a: EntregaAnexo) => void;
  onSalvarLegenda: (texto: string | null) => Promise<boolean>;
  onCopiarLegenda: () => void;
  onRemoverLegenda: () => void;
}) {
  const [popover, setPopover] = useState<ArquivoTileKey | null>(null);
  /** O popover da legenda abre direto no campo (legenda vazia ou "Editar" do menu). */
  const [legendaEmEdicao, setLegendaEmEdicao] = useState(false);
  const tiles = tilesDaEntrega({ anexos, legenda }, ajusteCategoria);
  const grupos = agruparAnexos(anexos);
  const ocupado = enviando !== null;

  // Abrir o popover a partir de um item do menu: o menu é não-modal (um menu modal segura o foco
  // enquanto some e o popover fecharia por "foco fora"), fecha sem devolver o foco ao botão ⋮
  // (`onCloseAutoFocus`) e o popover abre um tick depois.
  const abrirPopover = (key: ArquivoTileKey) => window.setTimeout(() => setPopover(key), 0);

  const alternarPopover = (key: ArquivoTileKey) =>
    setPopover((atual) => (atual === key ? null : key));
  const clicar = (tile: ArquivoTile) => {
    if (tile.tipo === "legenda") {
      setLegendaEmEdicao(false);
      return alternarPopover("Legenda");
    }
    if (tile.vazio) return onPick(tile.key as EntregaAnexoCategoria);
    if (tile.atual.length === 1) return abrirUrl(tile.atual[0].url);
    alternarPopover(tile.key);
  };

  return (
    <section aria-label="Arquivos" className="space-y-1.5">
      <CockpitTitle
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={ocupado}
                className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-foreground disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ADICIONAR_ORDEM.map((c) => {
                const Icon = TILE_ICON[c];
                return (
                  <DropdownMenuItem key={c} onSelect={() => onPick(c)}>
                    <Icon className="h-3.5 w-3.5" />
                    {ARQUIVO_CATEGORIA_LABEL[c]}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        Arquivos
      </CockpitTitle>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <ul className="grid auto-rows-fr grid-cols-4 gap-2">
        {tiles.map((tile) => {
          const arquivo = tile.tipo === "arquivo" ? (tile.key as EntregaAnexoCategoria) : null;
          const multi = tile.atual.length > 1;
          const unico = tile.atual.length === 1;
          const grupo = arquivo ? grupos.find((g) => g.categoria === arquivo) : undefined;
          const estaEnviando = arquivo != null && enviando === arquivo;
          const aria = [tile.label, tile.estado, tile.atencao ? "ajuste pedido" : null]
            .filter(Boolean)
            .join(", ");
          return (
            <li key={tile.key} className="relative min-w-0">
              <Popover
                open={popover === tile.key}
                onOpenChange={(o) => setPopover(o ? tile.key : null)}
              >
                <PopoverAnchor asChild>
                  <button
                    type="button"
                    data-tile={tile.key}
                    onClick={() => clicar(tile)}
                    disabled={estaEnviando}
                    aria-label={aria}
                    className={cn(
                      "flex h-full min-h-[88px] w-full min-w-0 flex-col rounded-lg border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                      tile.vazio
                        ? "items-center justify-center border-dashed border-border text-center hover:bg-muted/40"
                        : "justify-between border-border bg-card hover:bg-muted/40",
                    )}
                  >
                    {tile.vazio ? (
                      <>
                        <span className="flex items-center gap-1.5">
                          <Plus className="h-4 w-4 text-text-secondary" aria-hidden />
                          {tile.atencao && <TileAtencao />}
                        </span>
                        <TileLabel tile={tile} className="mt-1 justify-center" />
                        <span className="max-w-full truncate text-[11px] text-text-secondary">
                          <TileEstado tile={tile} enviando={estaEnviando} />
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex h-7 items-center gap-1.5">
                          <TileGlyph tile={tile} enviando={estaEnviando} />
                          {tile.atencao && <TileAtencao />}
                        </span>
                        <span className="block min-w-0">
                          <TileLabel tile={tile} />
                          <span className="block truncate text-[11px] text-text-secondary">
                            <TileEstado tile={tile} enviando={estaEnviando} />
                          </span>
                        </span>
                      </>
                    )}
                  </button>
                </PopoverAnchor>

                {!tile.vazio && (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Mais ações de ${tile.label}`}
                        disabled={estaEnviando}
                        className="absolute right-0.5 top-0.5 flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-52 data-[state=closed]:animate-none!"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      {tile.tipo === "legenda" ? (
                        <>
                          <DropdownMenuItem
                            onSelect={() => {
                              setLegendaEmEdicao(true);
                              abrirPopover("Legenda");
                            }}
                          >
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={onCopiarLegenda}>Copiar</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={onRemoverLegenda}
                            className="text-destructive focus:text-destructive"
                          >
                            Remover
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <>
                          {unico && (
                            <DropdownMenuItem onSelect={() => abrirUrl(tile.atual[0].url)}>
                              Abrir
                            </DropdownMenuItem>
                          )}
                          {multi && (
                            <DropdownMenuItem onSelect={() => abrirPopover(tile.key)}>
                              Ver arquivos
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => onNovaVersao(arquivo!)}>
                            Adicionar nova versão
                          </DropdownMenuItem>
                          {unico && (
                            <DropdownMenuItem onSelect={() => onSubstituir(tile)}>
                              Substituir arquivo
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => abrirPopover(tile.key)}>
                            Ver versões
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => onRemoverVersao(tile)}
                            className="text-destructive focus:text-destructive"
                          >
                            Remover
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <PopoverContent
                  align="start"
                  className={cn("p-3", tile.tipo === "legenda" ? "w-80" : "w-72")}
                  // Clicar no próprio quadrado alterna (fecha) em vez de fechar e reabrir.
                  onInteractOutside={(e) => {
                    if ((e.target as HTMLElement | null)?.closest?.(`[data-tile="${tile.key}"]`)) {
                      e.preventDefault();
                    }
                  }}
                >
                  {tile.tipo === "legenda" ? (
                    <EditorialCaption
                      value={legenda ?? null}
                      canal={canal}
                      saving={false}
                      rows={5}
                      quiet
                      defaultEditing={!legenda || legendaEmEdicao}
                      emptyText="Nenhuma legenda adicionada."
                      onSave={async (texto) => {
                        const ok = await onSalvarLegenda(texto);
                        if (ok) setPopover(null);
                        return ok;
                      }}
                    />
                  ) : grupo ? (
                    <VersoesLista
                      titulo={tile.label}
                      grupo={grupo}
                      onRemoverArquivo={(a) => {
                        setPopover(null);
                        onRemoverArquivo(a);
                      }}
                    />
                  ) : null}
                </PopoverContent>
              </Popover>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ============================================================
 * Histórico — a história da entrega: quem fez o quê, em qual material, quando
 * ============================================================ */

function PessoaAvatar({ nome, iniciais }: { nome: string; iniciais: string }) {
  const membros = useTeamMembers();
  const foto = membros.find(
    (m) => m.name.trim().toLowerCase() === nome.trim().toLowerCase(),
  )?.photo;
  return (
    <span
      title={nome}
      className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[9px] font-semibold text-text-secondary ring-2 ring-background"
    >
      {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : iniciais}
    </span>
  );
}

const iniciaisDe = (nome: string) =>
  nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** "Roteiro · V2" (arquivo), "Roteiro · Feedback V1" (feedback) ou só "Roteiro". */
function metadadoDoEvento(e: HistoricoEvento): string | null {
  if (e.kind === "feedback") {
    const mat = e.material ?? "";
    return [mat, `Feedback V${e.versao ?? 1}`].filter(Boolean).join(" · ");
  }
  if (!e.material) return null;
  return e.arquivoVersao ? `${e.material} · V${e.arquivoVersao}` : e.material;
}

function diaRotulo(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  const chave = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const ontem = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1);
  if (chave(d) === chave(agora)) return "Hoje";
  if (chave(d) === chave(ontem)) return "Ontem";
  return `${String(d.getDate()).padStart(2, "0")} ${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][d.getMonth()]}`;
}
const horaDe = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function EventoLinha({
  evento,
  expandido,
  onToggle,
}: {
  evento: HistoricoEvento;
  expandido: boolean;
  onToggle: () => void;
}) {
  const meta = metadadoDoEvento(evento);
  const feedback = evento.kind === "feedback";
  const motivo = evento.motivo?.trim() ?? "";
  const resumo = feedbackExcerpt(motivo, 140);
  return (
    <li data-evento-id={evento.id} className="relative flex gap-2.5 pb-2.5 last:pb-0">
      <PessoaAvatar nome={evento.autor} iniciais={iniciaisDe(evento.autor)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 text-sm leading-snug">
            <span className="font-medium text-foreground">{evento.autor}</span>{" "}
            <span className="text-foreground">{evento.texto}</span>
          </p>
          <span className="shrink-0 text-[11px] tabular-nums text-text-secondary">
            {horaDe(evento.at)}
          </span>
        </div>
        {meta && <p className="text-[11px] leading-snug text-text-secondary">{meta}</p>}
        {feedback && (
          <div
            className={cn(
              "mt-1.5 rounded-lg border px-2.5 py-2",
              evento.pendente
                ? "border-warning-border/70 bg-warning-soft/40"
                : "border-border/60 bg-muted/30",
            )}
          >
            {motivo ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-snug text-foreground">
                “{expandido ? motivo : resumo.text}”
              </p>
            ) : (
              <p className="text-sm text-text-secondary">Sem comentário do cliente.</p>
            )}
            {(resumo.truncated || expandido) && (
              <div className="mt-1">
                <QuietButton onClick={onToggle}>
                  {expandido ? "Ocultar feedback" : "Ver feedback completo →"}
                </QuietButton>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function EntregaHistorico({
  eventos,
  showAll,
  onToggleAll,
  feedbackAberto,
  onToggleFeedback,
  limit = 6,
  sectionRef,
}: {
  eventos: HistoricoEvento[];
  showAll: boolean;
  onToggleAll: () => void;
  /** Id do feedback exibido por inteiro. */
  feedbackAberto: string | null;
  onToggleFeedback: (id: string) => void;
  limit?: number;
  sectionRef?: Ref<HTMLElement>;
}) {
  // Por padrão só os eventos relevantes (os de rotina ficam em "Ver tudo"); o ajuste que ainda
  // espera a equipe nunca fica escondido.
  const relevantes = eventos.filter((e) => !e.menor || e.pendente);
  const corte = Math.max(limit, relevantes.findIndex((e) => e.pendente) + 1);
  const lista = showAll ? eventos : relevantes.slice(0, corte);
  const temMais = showAll || eventos.length > lista.length;

  const grupos: { dia: string; itens: HistoricoEvento[] }[] = [];
  for (const e of lista) {
    const dia = diaRotulo(e.at);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.dia === dia) ultimo.itens.push(e);
    else grupos.push({ dia, itens: [e] });
  }

  return (
    <section aria-label="Histórico" ref={sectionRef} className="scroll-mt-16 space-y-1.5">
      <CockpitTitle
        action={
          eventos.length === 0 ? (
            <span className="text-xs text-text-secondary">Nenhum evento registrado ainda.</span>
          ) : temMais ? (
            <QuietButton onClick={onToggleAll}>{showAll ? "Ver menos" : "Ver tudo"}</QuietButton>
          ) : undefined
        }
      >
        Histórico
      </CockpitTitle>
      {grupos.map((g) => (
        <div key={g.dia} className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
            {g.dia}
          </p>
          <ul className="relative before:absolute before:bottom-2 before:left-2.5 before:top-2 before:w-px before:-translate-x-1/2 before:bg-border/70">
            {g.itens.map((e) => (
              <EventoLinha
                key={e.id}
                evento={e}
                expandido={feedbackAberto === e.id}
                onToggle={() => onToggleFeedback(e.id)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
