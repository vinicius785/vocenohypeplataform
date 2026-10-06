import { useState, type ReactNode, type Ref } from "react";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Film,
  Loader2,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  User,
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
import { overdueLabel } from "@/components/tasks/task-ui";
import { formatActivityWhen } from "@/lib/activity-time";
import {
  ARQUIVO_CATEGORIAS_ORDEM,
  ARQUIVO_CATEGORIA_LABEL,
  ARQUIVO_TIPO_LABEL,
  ENTREGA_FASE_COLUNAS,
  ENTREGA_FASE_COLUNA_LABEL,
  agruparAnexos,
  arquivoTipo,
  formatDiaMes,
  historicoTexto,
  type ArquivoGrupo,
  type EntregaFaseColuna,
  type EntregaFocus,
  type StepperStep,
} from "@/lib/entrega-detail";
import type {
  Entrega,
  EntregaAnexo,
  EntregaAnexoCategoria,
  InfluActivity,
} from "@/lib/influencer-model";
import type { EntregaTone } from "@/lib/influencer-next-action";
import { cn } from "@/lib/utils";
import { CockpitTitle, QuietButton } from "./InfluencerCockpit";
import { ENTREGA_TONE_DOT } from "./entrega-tone";

/**
 * Peças de apresentação do detalhe da ENTREGA (V2). Só layout: a máquina de estados, o motor de
 * ações, o ciclo de ajustes e a persistência continuam onde sempre estiveram (ver
 * `lib/entrega-detail.ts` para o que mostrar e `EntregaDetailBody` no board para o que fazer).
 * Linguagem: títulos em caixa-alta pequena (`CockpitTitle`), cor só como sinal de estado, poucas
 * bordas, uma superfície só (a próxima ação) e listas simples para o resto.
 */

/* ============================================================
 * Cabeçalho: voltar + entrega (título) + status + influenciador + Editar / ⋮
 * ============================================================ */

export function EntregaHeader({
  tipo,
  titulo,
  unidades,
  grupo,
  statusLabel,
  tone,
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
  tipo: string;
  titulo?: string;
  unidades: string | null;
  /** Unidade independente de um grupo (aprovada separadamente das demais). */
  grupo: boolean;
  statusLabel: string;
  tone: EntregaTone;
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
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background px-5 py-3">
      <div className="flex items-start gap-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar ao influenciador"
            title="Voltar ao influenciador"
            className="-ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        {influNome !== undefined && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
            {influFoto ? (
              <img src={influFoto} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            <h2
              className="min-w-0 truncate text-lg font-semibold leading-tight tracking-tight text-foreground"
              title={
                grupo ? "Unidade independente — aprovada separadamente das demais." : undefined
              }
            >
              {tipo || "Sem tipo"}
              {titulo && <span className="font-normal text-text-secondary"> · {titulo}</span>}
              {unidades && <span className="font-normal text-text-secondary"> · {unidades}</span>}
            </h2>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground">
              <span
                aria-hidden
                className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ENTREGA_TONE_DOT[tone])}
              />
              {statusLabel}
            </span>
          </div>
          {(influNome || influContexto) && (
            <p className="mt-0.5 truncate text-xs text-text-secondary">
              {[influNome, influContexto].filter(Boolean).join(" · ")}
            </p>
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
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {editing && editor && <div className="mt-3">{editor}</div>}
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
  podeSepararArquivos,
  onEditar,
  onMover,
  onSplitUnidade,
  onSplitExistente,
  onRemover,
}: {
  colunaAtual: EntregaFaseColuna;
  grupo: boolean;
  /** Há arquivos irmãos já enviados que podem virar uma unidade cada. */
  podeSepararArquivos: boolean;
  onEditar: () => void;
  onMover: (coluna: EntregaFaseColuna) => void;
  onSplitUnidade: (delta: 1 | -1) => void;
  onSplitExistente: () => void;
  onRemover: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Mais ações da entrega"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem className="sm:hidden" onSelect={onEditar}>
          <Pencil className="h-3.5 w-3.5" /> Editar entrega
        </DropdownMenuItem>
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
 * Próxima ação — a única superfície destacada; uma ação principal
 * ============================================================ */

export function EntregaActionSurface({
  focus,
  busy,
  error,
  onPrimary,
  onOpenArquivo,
}: {
  focus: EntregaFocus;
  busy: boolean;
  error?: string;
  onPrimary: () => void;
  /** Abre o arquivo que o cliente está analisando (estados de espera). */
  onOpenArquivo?: () => void;
}) {
  const p = focus.primary;
  const abrir = focus.openCategoria === "Conteúdo final" ? "conteúdo" : "roteiro";
  return (
    <section
      aria-label="Próxima ação"
      className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
    >
      <CockpitTitle>Próxima ação</CockpitTitle>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-base font-semibold leading-tight text-foreground">{focus.title}</p>
          {focus.hint && <p className="mt-0.5 text-sm text-text-secondary">{focus.hint}</p>}
          {focus.note && (
            <p className="mt-0.5 text-xs text-warning-soft-foreground">{focus.note}</p>
          )}
        </div>
        {p ? (
          <Button onClick={onPrimary} disabled={busy} className="rounded-lg font-semibold">
            {busy ? "Enviando..." : p.label}
          </Button>
        ) : (
          onOpenArquivo && <QuietButton onClick={onOpenArquivo}>Abrir {abrir} →</QuietButton>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </section>
  );
}

/* ============================================================
 * Progresso + prazos (um bloco só: as datas ficam sob cada etapa)
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

const PRAZO_CAMPOS = [
  ["dataRecebimentoRoteiro", "Roteiro"],
  ["dataRecebimentoConteudo", "Conteúdo"],
  ["dataPostagem", "Publicação"],
] as const;
export type PrazoCampo = (typeof PRAZO_CAMPOS)[number][0];

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
    <section aria-label="Progresso" className="space-y-2.5">
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
                  "mt-1.5 truncate text-[11px] font-medium uppercase tracking-wide",
                  s.state === "current" ? "text-foreground" : "text-text-secondary",
                )}
              >
                {s.label}
              </p>
              <p
                className={cn(
                  "truncate text-xs tabular-nums",
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
 * Arquivos — por categoria, versão atual aberta, anteriores recolhidas
 * ============================================================ */

const CATEGORIA_ICON: Record<EntregaAnexoCategoria, typeof FileText> = {
  Roteiro: FileText,
  "Conteúdo final": Upload,
  Gravação: Film,
  Outro: Paperclip,
};
const CATEGORIA_VAZIO: Partial<Record<EntregaAnexoCategoria, string>> = {
  Roteiro: "roteiro",
  "Conteúdo final": "conteúdo final",
};

function FileThumb({ nome, url }: { nome: string; url: string }) {
  const tipo = arquivoTipo(nome);
  if (tipo === "imagem") {
    return (
      <img
        src={url}
        alt=""
        className="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-border"
      />
    );
  }
  const Icon = tipo === "video" ? Film : tipo === "outro" ? Paperclip : FileText;
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-text-secondary">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function FileRow({
  anexo,
  versao,
  mostrarVersao,
  onReplace,
  onRemove,
}: {
  anexo: EntregaAnexo;
  versao: number;
  mostrarVersao: boolean;
  onReplace?: () => void;
  onRemove: () => void;
}) {
  const meta = [
    ARQUIVO_TIPO_LABEL[arquivoTipo(anexo.nome)],
    mostrarVersao ? `v${versao}` : null,
    anexo.criadoEm ? formatDiaMes(anexo.criadoEm) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const acao =
    "rounded px-1.5 py-1 text-xs font-medium text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
  const icone =
    "flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-muted hover:text-foreground";
  return (
    <li className="flex items-center gap-3 py-1.5">
      <FileThumb nome={anexo.nome} url={anexo.url} />
      <div className="min-w-0 flex-1">
        <a
          href={anexo.url}
          target="_blank"
          rel="noreferrer"
          title={anexo.nome}
          className="block truncate text-sm font-medium text-foreground hover:underline"
        >
          {anexo.nome}
        </a>
        <p className="truncate text-xs text-text-secondary">{meta}</p>
      </div>
      <div className="flex shrink-0 items-center">
        <a
          href={anexo.url}
          target="_blank"
          rel="noreferrer"
          className={cn(acao, "hidden sm:inline-flex")}
        >
          Abrir
        </a>
        {onReplace && (
          <button
            type="button"
            onClick={onReplace}
            title="Envia uma nova versão (a anterior continua em versões anteriores)"
            className={cn(acao, "hidden sm:inline-flex")}
          >
            Substituir
          </button>
        )}
        <a
          href={anexo.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Abrir ${anexo.nome}`}
          className={cn(icone, "sm:hidden")}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        {onReplace && (
          <button
            type="button"
            onClick={onReplace}
            aria-label={`Substituir ${anexo.nome}`}
            className={cn(icone, "sm:hidden")}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${anexo.nome}`}
          className="flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-muted hover:text-destructive sm:h-7 sm:w-7"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

function ArquivoGrupoView({
  categoria,
  grupo,
  ajuste,
  enviando,
  onPick,
  onRemove,
}: {
  categoria: EntregaAnexoCategoria;
  grupo: ArquivoGrupo | undefined;
  /** Esta categoria é a do ajuste pedido pelo cliente. */
  ajuste: boolean;
  enviando: boolean;
  onPick: (c: EntregaAnexoCategoria) => void;
  onRemove: (a: EntregaAnexo) => void;
}) {
  const [verAnteriores, setVerAnteriores] = useState(false);
  const vazio = CATEGORIA_VAZIO[categoria];
  const multi = grupo ? grupo.anteriores.length > 0 : false;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        {ARQUIVO_CATEGORIA_LABEL[categoria]}
        {ajuste && (
          <span className="inline-flex items-center gap-1 font-normal">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            ajuste pedido
          </span>
        )}
        {enviando && <Loader2 className="h-3 w-3 animate-spin" aria-label="Enviando" />}
      </p>
      {grupo ? (
        <>
          <ul className="divide-y divide-border/40">
            {grupo.atual.anexos.map((a) => (
              <FileRow
                key={a.id}
                anexo={a}
                versao={grupo.atual.versao}
                mostrarVersao={multi}
                onReplace={() => onPick(categoria)}
                onRemove={() => onRemove(a)}
              />
            ))}
          </ul>
          {multi && (
            <div className="mt-0.5">
              <QuietButton onClick={() => setVerAnteriores((v) => !v)}>
                {verAnteriores
                  ? "Ocultar versões anteriores"
                  : `${grupo.anteriores.length} ${grupo.anteriores.length === 1 ? "versão anterior" : "versões anteriores"}`}
              </QuietButton>
              {verAnteriores && (
                <ul className="divide-y divide-border/40">
                  {grupo.anteriores.flatMap((v) =>
                    v.anexos.map((a) => (
                      <FileRow
                        key={a.id}
                        anexo={a}
                        versao={v.versao}
                        mostrarVersao
                        onRemove={() => onRemove(a)}
                      />
                    )),
                  )}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 text-sm text-text-secondary">
          <span>Nenhum {vazio ?? "arquivo"} anexado ainda.</span>
          <QuietButton onClick={() => onPick(categoria)}>
            Adicionar {vazio ?? "arquivo"}
          </QuietButton>
        </p>
      )}
    </div>
  );
}

export function EntregaArquivos({
  anexos,
  esperada,
  ajusteCategoria,
  enviando,
  error,
  onPick,
  onRemove,
  sectionRef,
}: {
  anexos: EntregaAnexo[] | undefined;
  /** Categoria que a entrega espera agora (mostra o espaço "Adicionar" mesmo vazio). */
  esperada: EntregaAnexoCategoria | null;
  ajusteCategoria?: EntregaAnexoCategoria;
  enviando: EntregaAnexoCategoria | null;
  error?: string;
  onPick: (c: EntregaAnexoCategoria) => void;
  onRemove: (a: EntregaAnexo) => void;
  sectionRef?: Ref<HTMLElement>;
}) {
  const grupos = agruparAnexos(anexos);
  const visiveis = ARQUIVO_CATEGORIAS_ORDEM.filter(
    (c) => grupos.some((g) => g.categoria === c) || c === esperada || c === ajusteCategoria,
  );
  return (
    <section aria-label="Arquivos" ref={sectionRef} className="scroll-mt-16 space-y-2">
      <CockpitTitle
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={enviando !== null}
                className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-foreground disabled:opacity-60"
              >
                {enviando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Adicionar
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ARQUIVO_CATEGORIAS_ORDEM.map((c) => {
                const Icon = CATEGORIA_ICON[c];
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
      {visiveis.length === 0 ? (
        <p className="text-sm text-text-secondary">Nenhum arquivo anexado.</p>
      ) : (
        <div className="space-y-3">
          {visiveis.map((c) => (
            <ArquivoGrupoView
              key={c}
              categoria={c}
              grupo={grupos.find((g) => g.categoria === c)}
              ajuste={c === ajusteCategoria}
              enviando={enviando === c}
              onPick={onPick}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================
 * Publicação (só publicada) e Histórico
 * ============================================================ */

export function EntregaPublicacao({
  publicadoEm,
  link,
  urlTexto,
  metricas,
  editing,
  onToggleEdit,
  editor,
}: {
  publicadoEm?: string;
  /** Link já validado (http/https) ou `null`. */
  link: string | null;
  /** Texto salvo em `url` quando não é um link utilizável. */
  urlTexto?: string;
  metricas: string[];
  editing: boolean;
  onToggleEdit: () => void;
  editor: ReactNode;
}) {
  return (
    <section aria-label="Publicação" className="space-y-2">
      <CockpitTitle
        action={<QuietButton onClick={onToggleEdit}>{editing ? "Concluir" : "Editar"}</QuietButton>}
      >
        Publicação
      </CockpitTitle>
      {editing ? (
        editor
      ) : (
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground">
            <span>{publicadoEm ? `Publicada em ${formatDiaMes(publicadoEm)}` : "Publicada"}</span>
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2"
              >
                Abrir post <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-text-secondary">{urlTexto || "Sem link do post"}</span>
            )}
          </p>
          <p className="text-sm text-text-secondary">
            {metricas.length > 0 ? metricas.join(" · ") : "Sem métricas ainda."}
          </p>
        </div>
      )}
    </section>
  );
}

export function EntregaHistorico({
  items,
  showAll,
  onToggleAll,
  limit = 3,
}: {
  items: InfluActivity[];
  showAll: boolean;
  onToggleAll: () => void;
  limit?: number;
}) {
  const visible = showAll ? items : items.slice(0, limit);
  return (
    <section aria-label="Histórico" className="space-y-2">
      <CockpitTitle
        action={
          items.length > limit ? (
            <QuietButton onClick={onToggleAll}>
              {showAll ? "Ver menos" : `Ver tudo (${items.length})`}
            </QuietButton>
          ) : undefined
        }
      >
        Histórico
      </CockpitTitle>
      {items.length === 0 ? (
        <p className="text-sm text-text-secondary">Nenhum evento registrado ainda.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {visible.map((a) => (
            <li key={a.id}>
              <span className="mr-2 text-xs tabular-nums text-text-secondary">
                {formatActivityWhen(a.createdAt)}
              </span>
              <span className="font-medium text-foreground">{a.author}</span>{" "}
              <span className="text-text-secondary">{historicoTexto(a.action)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
