import { useMemo, useRef, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { DateField } from "@/components/ui/date-field";
import { fmtDate, type Influ } from "@/lib/influencer-model";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import type { CronogramaItem } from "@/lib/campanha-scoped-store";
import { CampaignToolShell, ToolEmpty, ToolSectionTitle } from "./CampaignToolShell";
import { CAMPAIGN_TOOLS } from "./campaign-tools";

const DIAS_LABEL = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type CalendarEvent = {
  label: string;
  tone: "inicio" | "prazo" | "postagem" | "pagamento" | "manual";
};

const TONE_DOT: Record<CalendarEvent["tone"], string> = {
  inicio: "bg-sky-500",
  prazo: "bg-amber-500",
  postagem: "bg-violet-500",
  pagamento: "bg-emerald-500",
  manual: "bg-rose-500",
};
const TONE_LABEL: Record<CalendarEvent["tone"], string> = {
  inicio: "Início",
  prazo: "Prazo",
  postagem: "Postagem",
  pagamento: "Pagamento",
  manual: "Cronograma",
};

/**
 * Campanha → Ferramentas → Calendário. Mesma lógica de antes (marcos
 * derivados da campanha/entregas/pagamentos + cronograma manual persistido
 * via `onCronogramaChange` → `saveCampanhaCronograma`, com itens
 * recorrentes em cliente recorrente). Mudou só o container: drawer largo
 * (`size="large"`) com calendário à esquerda e cronograma à direita.
 */
export function CalendarTool({
  open,
  onOpenChange,
  campanha: c,
  influs,
  cronograma,
  onCronogramaChange,
  isRecorrente,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanha: Campaign;
  influs: Influ[];
  cronograma: CronogramaItem[];
  onCronogramaChange: (next: CronogramaItem[]) => void;
  isRecorrente: boolean;
}) {
  const meta = CAMPAIGN_TOOLS.calendario;
  const titleInputRef = useRef<HTMLInputElement>(null);
  const initialCursor = useMemo(() => {
    const first = c.dataInicio ?? c.prazo;
    return first ? new Date(first + "T00:00:00") : new Date();
  }, [c.dataInicio, c.prazo]);
  const [cursor, setCursor] = useState(initialCursor);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const add = (date: string | undefined, ev: CalendarEvent) => {
      if (!date) return;
      const arr = map.get(date) ?? [];
      arr.push(ev);
      map.set(date, arr);
    };
    add(c.dataInicio, { label: "Início da campanha", tone: "inicio" });
    add(c.prazo, { label: "Prazo da campanha", tone: "prazo" });
    for (const i of influs) {
      for (const e of i.entregas) {
        add(e.dataPostagem, { label: `Postagem · ${i.nome} (${e.tipo})`, tone: "postagem" });
      }
      add(i.pagamento?.data, { label: `Pagamento · ${i.nome}`, tone: "pagamento" });
    }
    // Itens recorrentes repetem no mesmo dia-do-mês da data âncora, todo
    // mês — a ocorrência mostrada é sempre a do mês visualizado (cursor).
    for (const item of cronograma) {
      if (item.recurring) {
        const day = Number(item.date.slice(8, 10));
        const daysInCursorMonth = new Date(
          cursor.getFullYear(),
          cursor.getMonth() + 1,
          0,
        ).getDate();
        const occurrence = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          Math.min(day, daysInCursorMonth),
        );
        add(toISODate(occurrence), { label: item.title, tone: "manual" });
      } else {
        add(item.date, { label: item.title, tone: "manual" });
      }
    }
    return map;
  }, [c.dataInicio, c.prazo, influs, cronograma, cursor]);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startDate = new Date(first);
  startDate.setDate(first.getDate() - first.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    cells.push(d);
  }
  const today = toISODate(new Date());
  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const hasAnyEvent = eventsByDate.size > 0;

  const focusAdd = () => {
    titleInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    titleInputRef.current?.focus();
  };

  return (
    <CampaignToolShell
      open={open}
      onOpenChange={onOpenChange}
      size={meta.size}
      campanhaNome={c.nome}
      icon={meta.icon}
      title={meta.label}
      description={meta.description}
      actions={
        <Button variant="primary" size="sm" onClick={focusAdd}>
          <Plus /> Adicionar evento
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        {/* Calendário + dia selecionado */}
        <section className="min-w-0 space-y-4" aria-label="Calendário mensal">
          <div className="flex items-center justify-between gap-2">
            <IconButton
              label="Mês anterior"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              <ChevronLeft />
            </IconButton>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold capitalize text-foreground" aria-live="polite">
                {monthLabel}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCursor(new Date())}
                className="h-7 px-2"
              >
                Hoje
              </Button>
            </div>
            <IconButton
              label="Próximo mês"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              <ChevronRight />
            </IconButton>
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
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
              {cells.map((d, idx) => {
                const iso = toISODate(d);
                const inMonth = d.getMonth() === cursor.getMonth();
                const isToday = iso === today;
                const isSelected = iso === selectedDate;
                const items = eventsByDate.get(iso) ?? [];
                return (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => setSelectedDate((prev) => (prev === iso ? null : iso))}
                    aria-pressed={isSelected}
                    aria-label={`${fmtDate(iso)}${items.length ? ` — ${items.length} evento${items.length === 1 ? "" : "s"}` : ""}`}
                    className={`h-14 overflow-hidden border-b border-r border-border p-1 text-left align-top transition-colors hover:bg-muted/40 focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:h-20 sm:p-1.5 ${
                      inMonth ? "" : "bg-background/40 text-text-secondary"
                    } ${isSelected ? "bg-muted/60" : ""}`}
                  >
                    <span
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums ${
                        isToday ? "border border-foreground/40" : ""
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {/* Mobile: só pontos; ≥sm: até 2 rótulos + contador. */}
                    <div className="mt-0.5 flex flex-wrap gap-0.5 sm:hidden">
                      {items.slice(0, 4).map((ev, i) => (
                        <span key={i} className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[ev.tone]}`} />
                      ))}
                    </div>
                    <div className="mt-1 hidden space-y-0.5 sm:block">
                      {items.slice(0, 2).map((ev, i) => (
                        <div key={i} className="flex items-center gap-1 truncate text-[11px]">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[ev.tone]}`}
                          />
                          <span className="truncate text-text-secondary">{ev.label}</span>
                        </div>
                      ))}
                      {items.length > 2 && (
                        <div className="text-[11px] font-medium text-text-secondary">
                          +{items.length - 2} evento{items.length - 2 === 1 ? "" : "s"}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legenda">
            {(Object.keys(TONE_DOT) as CalendarEvent["tone"][]).map((t) => (
              <li key={t} className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[t]}`} /> {TONE_LABEL[t]}
              </li>
            ))}
          </ul>

          <div className="border-t border-border pt-4">
            {selectedDate ? (
              <div className="space-y-2">
                <ToolSectionTitle>{fmtDate(selectedDate)}</ToolSectionTitle>
                {(eventsByDate.get(selectedDate) ?? []).length === 0 ? (
                  <p className="text-sm text-text-secondary">Nenhum evento neste dia.</p>
                ) : (
                  <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                    {(eventsByDate.get(selectedDate) ?? []).map((ev, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-sm">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[ev.tone]}`}
                        />
                        <span className="text-foreground">{ev.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : hasAnyEvent ? (
              <p className="text-xs text-text-secondary">
                Clique num dia com eventos para ver os detalhes.
              </p>
            ) : (
              <p className="text-sm text-text-secondary">Nenhuma data cadastrada ainda.</p>
            )}
          </div>
        </section>

        {/* Cronograma manual */}
        <CronogramaPanel
          cronograma={cronograma}
          onChange={onCronogramaChange}
          isRecorrente={isRecorrente}
          titleInputRef={titleInputRef}
        />
      </div>
    </CampaignToolShell>
  );
}

/** Cronograma manual — setado pelo time (data + título + descrição livre),
 * em vez de derivado das entregas dos influenciadores. Mostrado aqui e no
 * portal do cliente. */
function CronogramaPanel({
  cronograma,
  onChange,
  isRecorrente,
  titleInputRef,
}: {
  cronograma: CronogramaItem[];
  onChange: (next: CronogramaItem[]) => void;
  isRecorrente: boolean;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recurring, setRecurring] = useState(false);

  const add = () => {
    const t = title.trim();
    if (!date || !t) return;
    onChange(
      [
        ...cronograma,
        {
          id: crypto.randomUUID(),
          date,
          title: t,
          description: description.trim() || undefined,
          recurring: isRecorrente && recurring ? true : undefined,
        },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    );
    setDate("");
    setTitle("");
    setDescription("");
    setRecurring(false);
  };

  const remove = (id: string) => onChange(cronograma.filter((i) => i.id !== id));

  return (
    <section
      className="min-w-0 space-y-4 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
      aria-label="Cronograma"
    >
      <ToolSectionTitle>Cronograma</ToolSectionTitle>

      <form
        className="space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="space-y-1">
          <label htmlFor="cron-title" className="text-xs font-medium text-text-secondary">
            Título
          </label>
          <Input
            id="cron-title"
            ref={titleInputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Gravação do vídeo"
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-text-secondary">Data</span>
          <DateField value={date || undefined} onChange={(v) => setDate(v ?? "")} className="h-9" />
        </div>
        <div className="space-y-1">
          <label htmlFor="cron-desc" className="text-xs font-medium text-text-secondary">
            Descrição (opcional)
          </label>
          <Input
            id="cron-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalhes adicionais"
          />
        </div>
        {isRecorrente && (
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border"
            />
            Repete todo mês (dia {date ? Number(date.slice(8, 10)) : "—"})
          </label>
        )}
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!date || !title.trim()}
          className="w-full"
        >
          <Plus /> Adicionar ao cronograma
        </Button>
      </form>

      {cronograma.length === 0 ? (
        <ToolEmpty
          icon={CalendarClock}
          title="Nenhum item de cronograma."
          description="Adicione marcos com data, título e descrição. Eles aparecem no calendário e no portal do cliente."
        />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {cronograma.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text-secondary">
                  {item.recurring
                    ? `Todo dia ${Number(item.date.slice(8, 10))}`
                    : fmtDate(item.date)}
                </p>
                <p className="truncate text-sm text-foreground">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-xs text-text-secondary">{item.description}</p>
                )}
              </div>
              <IconButton
                label={`Remover ${item.title}`}
                onClick={() => remove(item.id)}
                className="h-8 w-8 hover:text-destructive"
              >
                <X />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
