import { useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IconButton } from "@/components/ui/icon-button";
import { DateField } from "@/components/ui/date-field";
import { TimeField } from "@/components/ui/time-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/EmptyState";
import { useConfirm } from "@/hooks/use-confirm";
import { fmtDate, getCurrentAuthor } from "@/lib/influencer-model";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import type { CronogramaItem, CronogramaTipo } from "@/lib/campanha-scoped-store";
import {
  EVENTO_TIPOS,
  EVENTO_TIPO_LABEL,
  agruparPorDia,
  celulasDoMes,
  duplicarEvento,
  filtrarOcorrencias,
  limitarDia,
  novoEvento,
  ocorrenciasDoMes,
  tipoDe,
  visivelAoCliente,
  type FiltroVisibilidade,
  type Ocorrencia,
} from "@/lib/campanha-calendario";
import { CampaignToolShell } from "./CampaignToolShell";
import { CAMPAIGN_TOOLS } from "./campaign-tools";

const DIAS_LABEL = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const FILTROS = [
  { value: "todos", label: "Todos" },
  { value: "internos", label: "Internos" },
  { value: "cliente", label: "Cliente" },
] as const;

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Marcador discreto de visibilidade (olho = visível ao cliente). */
function Visibilidade({ item, className }: { item: CronogramaItem; className?: string }) {
  const cliente = visivelAoCliente(item);
  const Icon = cliente ? Eye : EyeOff;
  return (
    <Icon
      aria-label={cliente ? "Visível para o cliente" : "Interno"}
      className={`h-3 w-3 shrink-0 ${cliente ? "text-foreground" : "text-text-secondary/50"} ${className ?? ""}`}
    />
  );
}

/**
 * Campanha → Recursos → Calendário (V2). UM calendário, UM evento, UMA fonte
 * (`campanha_cronograma`) e UMA propriedade de visibilidade (`visivelCliente`): o time vê todos os
 * eventos; o Portal do Cliente só os marcados para ele (filtrado no servidor). Só eventos
 * adicionados à mão — nada é derivado de entregas ou pagamentos.
 */
export function CalendarTool({
  open,
  onOpenChange,
  campanha: c,
  cronograma,
  onCronogramaChange,
  isRecorrente,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanha: Campaign;
  cronograma: CronogramaItem[];
  onCronogramaChange: (next: CronogramaItem[]) => void;
  isRecorrente: boolean;
}) {
  const meta = CAMPAIGN_TOOLS.calendario;
  const { confirm, confirmDialog } = useConfirm();
  const [cursor, setCursor] = useState(() => {
    const first = c.dataInicio ?? c.prazo;
    const d = first ? new Date(first + "T00:00:00") : new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [busca, setBusca] = useState("");
  const [visibilidade, setVisibilidade] = useState<FiltroVisibilidade>("todos");
  const [editor, setEditor] = useState<{ item?: CronogramaItem; date?: string } | null>(null);
  const [detalhe, setDetalhe] = useState<Ocorrencia | null>(null);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);

  const ocorrencias = useMemo(
    () =>
      filtrarOcorrencias(ocorrenciasDoMes(cronograma, cursor.y, cursor.m), { busca, visibilidade }),
    [cronograma, cursor, busca, visibilidade],
  );
  const porDia = useMemo(() => agruparPorDia(ocorrencias), [ocorrencias]);
  const cells = useMemo(() => celulasDoMes(cursor.y, cursor.m), [cursor]);
  const dias = useMemo(() => [...porDia.keys()].sort(), [porDia]);
  const hoje = todayIso();
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const move = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goHoje = () => {
    const d = new Date();
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  const salvar = (next: CronogramaItem[]) =>
    onCronogramaChange([...next].sort((a, b) => a.date.localeCompare(b.date)));
  const excluir = async (item: CronogramaItem) => {
    const ok = await confirm(`Excluir “${item.title}”?`, {
      title: "Excluir evento?",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    salvar(cronograma.filter((x) => x.id !== item.id));
    setDetalhe(null);
  };

  const EventoLinha = ({ o, compact }: { o: Ocorrencia; compact?: boolean }) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setDetalhe(o);
      }}
      className={`flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${compact ? "text-[11px]" : "text-sm"}`}
    >
      {o.item.hora && (
        <span className="shrink-0 tabular-nums text-text-secondary">{o.item.hora}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-foreground">{o.item.title}</span>
      <Visibilidade item={o.item} />
    </button>
  );

  return (
    <CampaignToolShell
      open={open}
      onOpenChange={onOpenChange}
      size={meta.size}
      campanhaNome={c.nome}
      icon={meta.icon}
      title={meta.label}
      description="Cronograma e datas da campanha."
      actions={
        <Button variant="primary" size="sm" onClick={() => setEditor({})}>
          <Plus /> Adicionar evento
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <IconButton label="Mês anterior" onClick={() => move(-1)}>
              <ChevronLeft />
            </IconButton>
            <p
              className="min-w-[10rem] text-center text-sm font-semibold text-foreground first-letter:uppercase"
              aria-live="polite"
            >
              {monthLabel}
            </p>
            <IconButton label="Próximo mês" onClick={() => move(1)}>
              <ChevronRight />
            </IconButton>
            <Button variant="ghost" size="sm" onClick={goHoje} className="h-7 px-2">
              Hoje
            </Button>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar evento..."
                aria-label="Buscar evento"
                className="h-8 w-44 pl-8 text-xs"
              />
            </div>
            <SegmentedControl
              aria-label="Visibilidade"
              size="sm"
              value={visibilidade}
              onChange={setVisibilidade}
              options={[...FILTROS]}
            />
          </div>
        </div>

        {/* Desktop: grade mensal */}
        <div className="hidden overflow-hidden rounded-xl border border-border sm:block">
          <div className="grid grid-cols-7 border-b border-border bg-muted/30">
            {DIAS_LABEL.map((d) => (
              <div
                key={d}
                className="px-1 py-1.5 text-center text-[11px] font-medium uppercase tracking-wider text-text-secondary"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell) => {
              const list = porDia.get(cell.date) ?? [];
              const { shown, rest } = limitarDia(list, 3);
              const day = Number(cell.date.slice(8, 10));
              return (
                <div
                  key={cell.date}
                  onClick={() => setEditor({ date: cell.date })}
                  className={`group min-h-[7rem] cursor-pointer space-y-0.5 border-b border-r border-border p-1.5 transition-colors hover:bg-muted/30 ${cell.inMonth ? "" : "bg-background/40 text-text-secondary"}`}
                >
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums ${cell.date === hoje ? "bg-foreground font-semibold text-background" : ""}`}
                  >
                    {day}
                  </span>
                  {shown.map((o) => (
                    <EventoLinha key={`${o.item.id}-${o.date}`} o={o} compact />
                  ))}
                  {rest > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDiaAberto(cell.date);
                      }}
                      className="px-1 text-[11px] font-medium text-text-secondary hover:text-foreground"
                    >
                      +{rest} evento{rest === 1 ? "" : "s"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Celular: agenda por dia */}
        <div className="sm:hidden">
          {dias.length === 0 ? null : (
            <ul className="space-y-4">
              {dias.map((d) => (
                <li key={d}>
                  <p className="border-b border-border pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                    {new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      weekday: "short",
                    })}
                  </p>
                  <ul className="mt-1 divide-y divide-border/40">
                    {(porDia.get(d) ?? []).map((o) => (
                      <li key={`${o.item.id}-${o.date}`}>
                        <EventoLinha o={o} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        {dias.length === 0 && (
          <EmptyState
            compact
            icon={<CalendarClock className="h-4 w-4" aria-hidden />}
            title={
              cronograma.length === 0
                ? "Nenhum evento ainda"
                : busca || visibilidade !== "todos"
                  ? "Nenhum evento com esses filtros"
                  : "Nenhum evento neste mês"
            }
            description={
              cronograma.length === 0
                ? "Adicione datas importantes. Marque as que o cliente deve ver."
                : undefined
            }
          />
        )}
        <p className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <Eye className="h-3 w-3" /> visível para o cliente · <EyeOff className="h-3 w-3" />{" "}
          interno
        </p>
      </div>

      {/* Dia com muitos eventos */}
      <Dialog open={!!diaAberto} onOpenChange={(o) => !o && setDiaAberto(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-base font-semibold">
            {diaAberto ? fmtDate(diaAberto) : ""}
          </DialogTitle>
          <DialogDescription className="sr-only">Eventos do dia.</DialogDescription>
          <ul className="divide-y divide-border/40">
            {(diaAberto ? (porDia.get(diaAberto) ?? []) : []).map((o) => (
              <li key={o.item.id}>
                <EventoLinha o={o} />
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Detalhe */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-md">
          {detalhe && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 pr-6">
                <div className="min-w-0">
                  <DialogTitle className="text-base font-semibold leading-snug">
                    {detalhe.item.title}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-text-secondary">
                    {detalhe.item.recurring
                      ? `Todo dia ${Number(detalhe.item.date.slice(8, 10))}`
                      : fmtDate(detalhe.date)}
                    {detalhe.item.hora ? ` · ${detalhe.item.hora}` : ""} ·{" "}
                    {EVENTO_TIPO_LABEL[tipoDe(detalhe.item)]}
                  </DialogDescription>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditor({ item: detalhe.item });
                      setDetalhe(null);
                    }}
                  >
                    Editar
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton label="Mais ações">
                        <MoreHorizontal />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          salvar([
                            ...cronograma,
                            duplicarEvento(detalhe.item, getCurrentAuthor().name),
                          ]);
                          setDetalhe(null);
                        }}
                      >
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => void excluir(detalhe.item)}
                        className="text-destructive focus:text-destructive"
                      >
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <p className="flex items-center gap-1.5 text-sm text-foreground">
                <Visibilidade item={detalhe.item} className="h-3.5 w-3.5" />
                {visivelAoCliente(detalhe.item)
                  ? "Visível no Portal do Cliente"
                  : "Interno — não visível para o cliente"}
              </p>
              {detalhe.item.description && (
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {detalhe.item.description}
                </p>
              )}
              {(detalhe.item.criadoPor || detalhe.item.atualizadoEm) && (
                <p className="text-xs text-text-secondary">
                  {detalhe.item.criadoPor ? `Criado por ${detalhe.item.criadoPor}` : ""}
                  {detalhe.item.atualizadoEm
                    ? `${detalhe.item.criadoPor ? " · " : ""}atualizado em ${new Date(detalhe.item.atualizadoEm).toLocaleDateString("pt-BR")}`
                    : ""}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Criar / editar */}
      <Dialog open={!!editor} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent className="max-w-md">
          {editor && (
            <EventoForm
              key={editor.item?.id ?? `novo-${editor.date ?? ""}`}
              item={editor.item}
              dateInicial={editor.date}
              isRecorrente={isRecorrente}
              onCancel={() => setEditor(null)}
              onSave={(values) => {
                const autor = getCurrentAuthor().name;
                if (editor.item) {
                  const agora = new Date().toISOString();
                  salvar(
                    cronograma.map((x) =>
                      x.id === editor.item!.id
                        ? {
                            ...x,
                            ...values,
                            description: values.description.trim() || undefined,
                            hora: values.hora || undefined,
                            recurring: values.recurring ? true : undefined,
                            atualizadoEm: agora,
                          }
                        : x,
                    ),
                  );
                } else {
                  salvar([...cronograma, novoEvento(values, autor)]);
                }
                setEditor(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </CampaignToolShell>
  );
}

type Valores = {
  title: string;
  date: string;
  hora: string;
  tipo: CronogramaTipo;
  description: string;
  visivelCliente: boolean;
  recurring: boolean;
};

function EventoForm({
  item,
  dateInicial,
  isRecorrente,
  onCancel,
  onSave,
}: {
  item?: CronogramaItem;
  dateInicial?: string;
  isRecorrente: boolean;
  onCancel: () => void;
  onSave: (v: Valores) => void;
}) {
  const [v, setV] = useState<Valores>({
    title: item?.title ?? "",
    date: item?.date ?? dateInicial ?? "",
    hora: item?.hora ?? "",
    tipo: tipoDe(item ?? {}),
    description: item?.description ?? "",
    visivelCliente: item ? visivelAoCliente(item) : false,
    recurring: !!item?.recurring,
  });
  const [tentou, setTentou] = useState(false);
  const [tipoAberto, setTipoAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const erroTitulo = tentou && v.title.trim() === "";
  const erroData = tentou && v.date === "";
  const ok = v.title.trim() !== "" && v.date !== "";
  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (salvando) return;
        if (!ok) {
          setTentou(true);
          return;
        }
        setSalvando(true);
        onSave(v);
        toast.success(item ? "Evento atualizado." : "Evento criado.");
      }}
    >
      <DialogTitle className="text-base font-semibold">
        {item ? "Editar evento" : "Novo evento"}
      </DialogTitle>
      <DialogDescription className="sr-only">
        Dados do evento do calendário da campanha.
      </DialogDescription>
      <div className="space-y-1">
        <label htmlFor="evento-titulo" className="text-xs font-medium text-text-secondary">
          Título *
        </label>
        <Input
          id="evento-titulo"
          autoFocus
          value={v.title}
          disabled={salvando}
          aria-invalid={erroTitulo}
          aria-describedby={erroTitulo ? "evento-titulo-erro" : undefined}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          placeholder="Ex.: Gravação do vídeo"
          className={cn("h-9", erroTitulo && "border-danger focus-visible:ring-danger")}
        />
        {erroTitulo && (
          <p id="evento-titulo-erro" className="text-xs text-danger">
            Dê um título ao evento.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-xs font-medium text-text-secondary">Data *</span>
          <DateField
            value={v.date || undefined}
            onChange={(d) => setV({ ...v, date: d ?? "" })}
            ariaLabel="Data do evento"
            className={cn("h-9", erroData && "border-danger")}
          />
          {erroData && <p className="text-xs text-danger">Escolha a data.</p>}
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-text-secondary">Horário</span>
          <TimeField
            layout="colunas"
            value={v.hora}
            onChange={(h) => setV({ ...v, hora: h })}
            ariaLabel="Horário do evento"
            placeholder="Sem horário"
            className="h-9"
          />
        </div>
      </div>
      <div className="space-y-1">
        <span className="text-xs font-medium text-text-secondary">Tipo</span>
        <Popover open={tipoAberto} onOpenChange={setTipoAberto}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={salvando}
              aria-label="Tipo do evento"
              className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              {EVENTO_TIPO_LABEL[v.tipo]}
              <ChevronDown className="h-4 w-4 text-text-secondary" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[var(--radix-popover-trigger-width)] p-1"
            role="listbox"
          >
            {EVENTO_TIPOS.map((t) => (
              <button
                key={t}
                type="button"
                role="option"
                aria-selected={t === v.tipo}
                onClick={() => {
                  setV({ ...v, tipo: t });
                  setTipoAberto(false);
                }}
                className="flex h-8 w-full items-center justify-between rounded-sm px-2 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                {EVENTO_TIPO_LABEL[t]}
                {t === v.tipo && <Check className="h-4 w-4" />}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
      <div className="space-y-1">
        <label htmlFor="evento-desc" className="text-xs font-medium text-text-secondary">
          Descrição
        </label>
        <Textarea
          id="evento-desc"
          rows={2}
          value={v.description}
          disabled={salvando}
          onChange={(e) => setV({ ...v, description: e.target.value })}
          placeholder="Detalhes adicionais"
          className="min-h-0 resize-none"
        />
      </div>
      {isRecorrente && (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={v.recurring}
            disabled={salvando}
            onCheckedChange={(c) => setV({ ...v, recurring: c === true })}
            className="transition-transform active:scale-90 motion-reduce:transition-none"
          />
          Repete todo mês{v.date ? ` (dia ${Number(v.date.slice(8, 10))})` : ""}
        </label>
      )}
      <label
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
          v.visivelCliente ? "border-foreground/30 bg-muted" : "border-border hover:bg-muted/50",
        )}
      >
        <Checkbox
          checked={v.visivelCliente}
          disabled={salvando}
          onCheckedChange={(c) => setV({ ...v, visivelCliente: c === true })}
          className="transition-transform active:scale-90 motion-reduce:transition-none"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground">Mostrar para o cliente</span>
          <span className="block text-xs text-text-secondary">
            {v.visivelCliente ? "Aparece no Portal do Cliente" : "Só o time vê"}
          </span>
        </span>
        {v.visivelCliente ? (
          <Eye className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
        ) : (
          <EyeOff className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
        )}
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" size="sm" isLoading={salvando}>
          {item ? "Salvar" : "Criar evento"}
        </Button>
      </div>
    </form>
  );
}
