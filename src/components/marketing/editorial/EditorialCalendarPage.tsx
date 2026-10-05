import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { useTeamMembers } from "@/components/tasks/task-people";
import { useConfirm } from "@/hooks/use-confirm";
import {
  EDITORIAL_CHANNELS,
  EDITORIAL_CHANNEL_LABEL,
  EDITORIAL_STATUSES,
  EDITORIAL_STATUS_LABEL,
  EMPTY_FILTERS,
  addMonths,
  buildMonthCells,
  currentMonthKey,
  dayHeading,
  directoryTaskId,
  draftFromItem,
  duplicateDraft,
  filterItems,
  groupByDay,
  hasActiveFilters,
  monthFetchRange,
  monthLabel,
  newDraft,
  overdueDays,
  overdueLabel,
  type EditorialDraft,
  type EditorialFile,
  type EditorialFilters,
  type EditorialItem,
  type MonthKey,
  channelFormatLabel,
  taskFromContent,
} from "@/lib/marketing-editorial";
import { editorialErrorMessage } from "@/lib/marketing-editorial-store";
import { formatDateToIso } from "@/lib/utils";
import { insertStandaloneWithId, type MktStandalone } from "@/lib/marketing-tasks";
import { removeEditorialFile, uploadEditorialFile } from "@/lib/marketing-editorial-files";
import { useMentionNavigation } from "@/components/chat-v2/use-mention-navigation";
import { cn } from "@/lib/utils";
import { useEditorialRange } from "./use-editorial";
import { EditorialChip, EditorialStatusBadge, MemberInline } from "./EditorialParts";
import { EditorialFormSheet, type EditorialFormState } from "./EditorialFormSheet";
import { EditorialDetailSheet } from "./EditorialDetailSheet";

type View = "calendario" | "lista";
const WEEKDAY_HEADERS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MAX_PER_CELL = 3;

/** Calendário Editorial — ferramenta do projeto Marketing. */
export function EditorialCalendarPage({
  projectId,
  projectName,
  onBack,
}: {
  projectId: string;
  projectName: string;
  onBack: () => void;
}) {
  const today = formatDateToIso(new Date());
  const [month, setMonth] = useState<MonthKey>(() => currentMonthKey());
  const [view, setView] = useState<View>("calendario");
  const [filters, setFilters] = useState<EditorialFilters>(EMPTY_FILTERS);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<EditorialFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const members = useTeamMembers();
  const { confirm, confirmDialog } = useConfirm();
  const { openTask } = useMentionNavigation();
  const [uploading, setUploading] = useState<Record<string, string[]>>({});
  const [captionSaving, setCaptionSaving] = useState(false);

  const { from, to } = useMemo(() => monthFetchRange(month), [month]);
  const { items, loading, error, total, reload, create, update, remove } = useEditorialRange(
    projectId,
    from,
    to,
  );

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const visible = useMemo(
    () => filterItems(items, filters, (id) => members.find((m) => m.id === id)?.name),
    [items, filters, members],
  );
  const byDay = useMemo(() => groupByDay(visible), [visible]);
  const detail = items.find((i) => i.id === detailId) ?? null;
  const monthItems = visible.filter((i) => i.data.slice(0, 7) === month);
  const listDays = [...groupByDay(monthItems).entries()];

  const openNew = (date?: string) =>
    setForm({
      mode: "new",
      draft: newDraft(date ?? (month === currentMonthKey() ? today : `${month}-01`)),
    });

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      return true;
    } catch (e) {
      toast.error(editorialErrorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Cria a tarefa avulsa do Marketing (a mesma do Kanban) a partir do conteúdo. O id já foi gravado no
   * conteúdo; se a gravação da tarefa falhar, o vínculo é desfeito e o usuário é avisado. */
  const makeTask = (taskRaw: string, draft: EditorialDraft, itemId: string) => {
    const name = members.find((m) => m.id === draft.responsavelId)?.name;
    const t = taskFromContent(draft, name);
    const task: MktStandalone = {
      id: taskRaw,
      title: t.title,
      status: "Aberto",
      assignees: t.assignees.length > 0 ? t.assignees : undefined,
      dueDate: t.dueDate,
      note: t.note,
      noteText: t.note,
      createdAt: new Date().toISOString(),
    };
    insertStandaloneWithId(task, () => {
      toast.error("A tarefa não foi salva. Use “Criar tarefa” no detalhe do conteúdo.");
      void update(itemId, { tarefaId: null }).catch(() => {});
    });
  };

  const submitForm = async (
    state: EditorialFormState,
    draft: EditorialDraft,
    withTask: boolean,
  ) => {
    if (state.mode === "edit" && state.id) {
      const id = state.id;
      const ok = await run(() => update(id, draft), "Conteúdo atualizado.");
      if (ok) {
        setForm(null);
        setDetailId(id);
      }
      return;
    }
    const ok = await run(
      async () => {
        const taskRaw = withTask ? crypto.randomUUID() : null;
        const created = await create({
          ...draft,
          tarefaId: taskRaw ? directoryTaskId(taskRaw) : null,
        });
        if (taskRaw) makeTask(taskRaw, draft, created.id);
      },
      withTask ? "Conteúdo e tarefa criados." : "Conteúdo criado.",
    );
    if (ok) setForm(null);
  };

  const createTaskFor = (it: EditorialItem) =>
    void run(async () => {
      const taskRaw = crypto.randomUUID();
      await update(it.id, { tarefaId: directoryTaskId(taskRaw) });
      makeTask(taskRaw, draftFromItem(it), it.id);
    }, "Tarefa criada.");

  const saveCaption = async (it: EditorialItem, text: string | null) =>
    run(async () => {
      setCaptionSaving(true);
      try {
        await update(it.id, { legenda: text });
      } finally {
        setCaptionSaving(false);
      }
    }, "Legenda salva.");

  const addFiles = async (it: EditorialItem, files: File[]) => {
    const uploaded: EditorialFile[] = [];
    for (const f of files) {
      setUploading((u) => ({ ...u, [it.id]: [...(u[it.id] ?? []), f.name] }));
      try {
        uploaded.push(await uploadEditorialFile(projectId, it.id, f));
      } catch {
        toast.error(`Não foi possível enviar “${f.name}”.`);
      } finally {
        setUploading((u) => ({ ...u, [it.id]: (u[it.id] ?? []).filter((n) => n !== f.name) }));
      }
    }
    if (uploaded.length === 0) return;
    const latest = itemsRef.current.find((x) => x.id === it.id) ?? it;
    const ok = await run(() => update(it.id, { arquivos: [...latest.arquivos, ...uploaded] }));
    if (ok) toast.success(uploaded.length === 1 ? "Arquivo anexado." : "Arquivos anexados.");
    else void Promise.all(uploaded.map((f) => removeEditorialFile(f.path).catch(() => {})));
  };

  const removeFile = async (it: EditorialItem, file: EditorialFile) => {
    const yes = await confirm(`“${file.name}” será removido deste conteúdo.`, {
      title: "Remover arquivo?",
      confirmLabel: "Remover",
      destructive: true,
    });
    if (!yes) return;
    const latest = itemsRef.current.find((x) => x.id === it.id) ?? it;
    const ok = await run(
      () => update(it.id, { arquivos: latest.arquivos.filter((a) => a.id !== file.id) }),
      "Arquivo removido.",
    );
    if (ok) void removeEditorialFile(file.path).catch(() => {});
  };

  const openLinkedTask = (taskId: string) => {
    onBack();
    openTask(taskId);
  };

  const deleteItem = async (it: EditorialItem) => {
    const yes = await confirm(`“${it.titulo}” será removido do calendário.`, {
      title: "Excluir conteúdo?",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!yes) return;
    if (await run(() => remove(it.id), "Conteúdo excluído.")) {
      setDetailId(null);
      void Promise.all(it.arquivos.map((f) => removeEditorialFile(f.path).catch(() => {})));
    }
  };
  const publish = (it: EditorialItem) =>
    void run(() => update(it.id, { status: "publicado" }), "Marcado como publicado.");

  const filtered = hasActiveFilters(filters);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-md text-xs text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {projectName}
          <span className="text-text-secondary/70">/ Recursos</span>
        </button>
        <PageHeader
          title="Calendário Editorial"
          description="Planeje e acompanhe os conteúdos da Você no Hype."
          actionsSlot={
            <Button variant="primary" size="comfortable" onClick={() => openNew()}>
              <Plus className="h-4 w-4" /> Novo conteúdo
            </Button>
          }
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-border/60 px-4 py-6 text-center">
          <p className="text-sm text-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void reload()}>
            Tentar de novo
          </Button>
        </div>
      ) : total === 0 && !loading ? (
        <div className="rounded-lg border border-border/60">
          <EmptyState
            title="Nenhum conteúdo planejado"
            description="Comece adicionando o primeiro conteúdo do Marketing."
            primaryAction={{ label: "+ Novo conteúdo", onClick: () => openNew() }}
          />
        </div>
      ) : (
        <>
          {/* Mês + visualização */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMonth((m) => addMonths(m, -1))}
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="min-w-[10.5rem] text-center text-sm font-semibold text-foreground">
                {monthLabel(month)}
              </p>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMonth((m) => addMonths(m, 1))}
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMonth(currentMonthKey())}
                disabled={month === currentMonthKey()}
              >
                Hoje
              </Button>
            </div>
            <div className="hidden md:block">
              <SegmentedControl<View>
                aria-label="Visualização"
                value={view}
                onChange={setView}
                options={[
                  { value: "calendario", label: "Calendário" },
                  { value: "lista", label: "Lista" },
                ]}
              />
            </div>
          </div>

          {/* Busca e filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                value={filters.query}
                onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
                placeholder="Buscar título, canal ou responsável"
                aria-label="Buscar conteúdos"
                className="pl-9"
              />
            </div>
            <NativeSelect
              className="w-auto min-w-[8.5rem]"
              aria-label="Filtrar por status"
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value as EditorialFilters["status"] }))
              }
            >
              <option value="">Status</option>
              {EDITORIAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {EDITORIAL_STATUS_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              className="w-auto min-w-[7.5rem]"
              aria-label="Filtrar por canal"
              value={filters.canal}
              onChange={(e) =>
                setFilters((f) => ({ ...f, canal: e.target.value as EditorialFilters["canal"] }))
              }
            >
              <option value="">Canal</option>
              {EDITORIAL_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {EDITORIAL_CHANNEL_LABEL[c]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              className="w-auto min-w-[9rem]"
              aria-label="Filtrar por responsável"
              value={filters.responsavelId}
              onChange={(e) => setFilters((f) => ({ ...f, responsavelId: e.target.value }))}
            >
              <option value="">Responsável</option>
              {members
                .filter((m) => m.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </NativeSelect>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                Limpar
              </Button>
            )}
          </div>

          {/* Calendário mensal (desktop) */}
          {view === "calendario" && (
            <div className="hidden overflow-hidden rounded-lg border border-border/60 md:block">
              <div className="grid grid-cols-7 border-b border-border/60 bg-muted/20">
                {WEEKDAY_HEADERS.map((d) => (
                  <div
                    key={d}
                    className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {buildMonthCells(month).map((cell) => {
                  const dayItems = byDay.get(cell.date) ?? [];
                  const extra = dayItems.length - MAX_PER_CELL;
                  const isToday = cell.date === today;
                  return (
                    <div
                      key={cell.date}
                      onClick={() => openNew(cell.date)}
                      className={cn(
                        "group min-h-[118px] cursor-pointer space-y-1 border-b border-r border-border/60 p-1.5 [&:nth-child(7n)]:border-r-0",
                        !cell.inMonth && "bg-muted/20",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            "grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px]",
                            isToday
                              ? "bg-foreground font-semibold text-background"
                              : cell.inMonth
                                ? "text-foreground"
                                : "text-text-secondary/60",
                          )}
                        >
                          {Number(cell.date.slice(8))}
                        </span>
                        <Plus className="h-3 w-3 text-text-secondary opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      {dayItems.slice(0, MAX_PER_CELL).map((it) => (
                        <EditorialChip key={it.id} item={it} today={today} onOpen={setDetailId} />
                      ))}
                      {extra > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-text-secondary hover:bg-muted hover:text-foreground"
                            >
                              + {extra} {extra === 1 ? "conteúdo" : "conteúdos"}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className="w-72 space-y-1 p-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                              {dayHeading(cell.date)}
                            </p>
                            {dayItems.map((it) => (
                              <EditorialChip
                                key={it.id}
                                item={it}
                                today={today}
                                onOpen={setDetailId}
                              />
                            ))}
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lista (alternativa no desktop; única visão no mobile) */}
          <div className={cn(view === "lista" ? "block" : "md:hidden")}>
            {listDays.length === 0 ? (
              <p className="rounded-lg border border-border/60 px-4 py-8 text-center text-sm text-text-secondary">
                {loading
                  ? "Carregando…"
                  : filtered
                    ? "Nenhum conteúdo com esses filtros neste mês."
                    : "Nenhum conteúdo neste mês."}
              </p>
            ) : (
              <div className="space-y-5">
                {listDays.map(([date, dayItems]) => (
                  <section key={date} aria-label={dayHeading(date)}>
                    <h3
                      className={cn(
                        "border-b border-border/60 pb-1.5 text-[11px] font-semibold uppercase tracking-wide",
                        date === today ? "text-foreground" : "text-text-secondary",
                      )}
                    >
                      {dayHeading(date)}
                      {date === today && " · Hoje"}
                    </h3>
                    <ul className="divide-y divide-border/40">
                      {dayItems.map((it) => {
                        const late = overdueDays(it, today);
                        return (
                          <li key={it.id}>
                            <button
                              type="button"
                              onClick={() => setDetailId(it.id)}
                              className="flex w-full flex-wrap items-start gap-x-4 gap-y-1 py-2.5 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:flex-nowrap"
                            >
                              <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-text-secondary">
                                {it.hora ?? ""}
                              </span>
                              <span className="min-w-0 flex-1 basis-[12rem]">
                                <span
                                  className={cn(
                                    "block truncate text-sm font-medium text-foreground",
                                    it.status === "cancelado" && "line-through opacity-60",
                                  )}
                                >
                                  {it.titulo}
                                </span>
                                <span className="block truncate text-xs text-text-secondary">
                                  {channelFormatLabel(it)}
                                  {late > 0 && (
                                    <span className="text-danger"> · {overdueLabel(late)}</span>
                                  )}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-4 pl-12 sm:pl-0">
                                <EditorialStatusBadge status={it.status} />
                                <span className="w-32 min-w-0">
                                  <MemberInline members={members} id={it.responsavelId} />
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <EditorialDetailSheet
        item={detail}
        members={members}
        today={today}
        busy={busy}
        captionSaving={captionSaving}
        uploading={detail ? (uploading[detail.id] ?? []) : []}
        onClose={() => setDetailId(null)}
        onEdit={(it) => {
          setDetailId(null);
          setForm({ mode: "edit", id: it.id, draft: draftFromItem(it) });
        }}
        onDuplicate={(it) => {
          setDetailId(null);
          setForm({ mode: "duplicate", draft: duplicateDraft(it) });
        }}
        onDelete={(it) => void deleteItem(it)}
        onPublish={publish}
        onSaveCaption={saveCaption}
        onAddFiles={(it, files) => void addFiles(it, files)}
        onRemoveFile={(it, f) => void removeFile(it, f)}
        onCreateTask={createTaskFor}
        onOpenTask={openLinkedTask}
      />
      <EditorialFormSheet
        state={form}
        members={members}
        saving={busy}
        onClose={() => setForm(null)}
        onSubmit={(s, d, withTask) => void submitForm(s, d, withTask)}
      />
      {confirmDialog}
    </div>
  );
}
