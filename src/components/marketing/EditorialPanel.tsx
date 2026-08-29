import { useMemo, useState } from "react";
import { DateField } from "@/components/ui/date-field";
import {
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  ListPlus,
  CalendarDays,
  List as ListIcon,
} from "lucide-react";
import type { EditorialPost, EditorialStatus, Project, Task } from "@/lib/projetos";
import { formatIsoDate } from "@/lib/utils";

const STATUS: { key: EditorialStatus; label: string; cls: string }[] = [
  { key: "ideia", label: "Ideia", cls: "bg-muted text-foreground" },
  { key: "producao", label: "Produção", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  { key: "agendado", label: "Agendado", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  {
    key: "publicado",
    label: "Publicado",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
];

const CHANNELS = [
  "Instagram",
  "TikTok",
  "YouTube",
  "LinkedIn",
  "Facebook",
  "X / Twitter",
  "Blog",
  "Newsletter",
];

const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring";

export function EditorialPanel({
  project,
  update,
}: {
  project: Project;
  update: (p: Partial<Project>) => void;
}) {
  const posts = project.editorial ?? [];
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [editing, setEditing] = useState<EditorialPost | null>(null);
  const [presetDate, setPresetDate] = useState<string | undefined>();

  const setPosts = (next: EditorialPost[]) => update({ editorial: next });

  const save = (p: EditorialPost) => {
    const exists = posts.some((x) => x.id === p.id);
    setPosts(exists ? posts.map((x) => (x.id === p.id ? p : x)) : [...posts, p]);
    setEditing(null);
    setPresetDate(undefined);
  };
  const remove = (id: string) => setPosts(posts.filter((p) => p.id !== id));

  const createTaskFromPost = (p: EditorialPost) => {
    const t: Task = { id: crypto.randomUUID(), title: `[Editorial] ${p.title}`, status: "Aberto" };
    update({ tasks: [...project.tasks, t] });
  };

  const monthNameRaw = new Date(cursor.y, cursor.m, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const monthName = monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);
  const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDate = useMemo(() => {
    const map = new Map<string, EditorialPost[]>();
    for (const p of posts) {
      const arr = map.get(p.date) ?? [];
      arr.push(p);
      map.set(p.date, arr);
    }
    return map;
  }, [posts]);

  const iso = (d: number) =>
    `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const shift = (delta: number) => {
    let m = cursor.m + delta;
    let y = cursor.y;
    if (m < 0) {
      m = 11;
      y--;
    }
    if (m > 11) {
      m = 0;
      y++;
    }
    setCursor({ y, m });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border bg-background p-0.5">
          <button
            onClick={() => setView("calendar")}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium ${view === "calendar" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Calendário
          </button>
          <button
            onClick={() => setView("list")}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium ${view === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            <ListIcon className="h-3.5 w-3.5" /> Lista
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            aria-label="Mês anterior"
            className="rounded p-1 hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[160px] text-center text-xs font-medium capitalize">
            {monthName}
          </span>
          <button
            onClick={() => shift(1)}
            aria-label="Próximo mês"
            className="rounded p-1 hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={() => {
            setPresetDate(iso(new Date().getDate()));
            setEditing({
              id: "",
              title: "",
              date: iso(new Date().getDate()),
              channel: "Instagram",
              status: "ideia",
            });
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Novo post
        </button>
      </div>

      {view === "calendar" ? (
        <div className="rounded-lg border border-border bg-background">
          <div className="grid grid-cols-7 border-b border-border text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="px-2 py-1.5 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const dateKey = d ? iso(d) : "";
              const list = d ? (byDate.get(dateKey) ?? []) : [];
              return (
                <div
                  key={i}
                  className="min-h-[90px] border-b border-r border-border p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0"
                >
                  {d && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground">{d}</span>
                      <button
                        onClick={() => {
                          setPresetDate(dateKey);
                          setEditing({
                            id: "",
                            title: "",
                            date: dateKey,
                            channel: "Instagram",
                            status: "ideia",
                          });
                        }}
                        aria-label="Adicionar post"
                        className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <div className="mt-1 space-y-1">
                    {list.map((p) => {
                      const s = STATUS.find((x) => x.key === p.status)!;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setEditing(p)}
                          className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] ${s.cls}`}
                          title={`${p.title} · ${p.channel}`}
                        >
                          {p.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-background">
          {posts.length === 0 && (
            <li className="p-6 text-center text-xs text-muted-foreground">Nenhum post ainda.</li>
          )}
          {[...posts]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((p) => {
              const s = STATUS.find((x) => x.key === p.status)!;
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <button onClick={() => setEditing(p)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {formatIsoDate(p.date)} · {p.channel}
                    </p>
                  </button>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${s.cls}`}>{s.label}</span>
                  <button
                    onClick={() => createTaskFromPost(p)}
                    aria-label="Criar tarefa"
                    title="Criar tarefa no Kanban"
                    className="rounded p-1 hover:bg-muted"
                  >
                    <ListPlus className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    aria-label="Remover"
                    className="rounded p-1 hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </li>
              );
            })}
        </ul>
      )}

      {editing && (
        <PostModal
          initial={editing.id ? editing : { ...editing, id: crypto.randomUUID() }}
          onClose={() => {
            setEditing(null);
            setPresetDate(undefined);
          }}
          onSave={save}
          onCreateTask={createTaskFromPost}
          presetDate={presetDate}
        />
      )}
    </div>
  );
}

function PostModal({
  initial,
  onClose,
  onSave,
  onCreateTask,
  presetDate,
}: {
  initial: EditorialPost;
  onClose: () => void;
  onSave: (p: EditorialPost) => void;
  onCreateTask: (p: EditorialPost) => void;
  presetDate?: string;
}) {
  const [p, setP] = useState<EditorialPost>({ ...initial, date: presetDate ?? initial.date });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!p.title.trim() || !p.date) return;
    onSave(p);
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-border bg-background shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Post editorial</h2>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium">Título</span>
            <input
              value={p.title}
              onChange={(e) => setP({ ...p, title: e.target.value })}
              className={inputCls}
              required
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium">Data</span>
              <DateField
                value={p.date || undefined}
                onChange={(v) => setP({ ...p, date: v ?? "" })}
                className={inputCls}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Canal</span>
              <select
                value={p.channel}
                onChange={(e) => setP({ ...p, channel: e.target.value })}
                className={inputCls}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Status</span>
            <select
              value={p.status}
              onChange={(e) => setP({ ...p, status: e.target.value as EditorialStatus })}
              className={inputCls}
            >
              {STATUS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Notas</span>
            <textarea
              value={p.notes ?? ""}
              onChange={(e) => setP({ ...p, notes: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => {
              if (p.title.trim()) onCreateTask(p);
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            + Criar tarefa no Kanban
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background"
            >
              Salvar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
