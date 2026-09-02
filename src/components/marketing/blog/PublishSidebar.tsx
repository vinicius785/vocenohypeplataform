import { useMemo, useState, type RefObject } from "react";
import { Globe, Megaphone, Users2, Check, X, Plus } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { BlogPost } from "@/lib/projetos";
import { loadTeamMembers } from "@/lib/projetos";
import { useClientes } from "@/lib/clientes-store";
import { CoverUploadField } from "../ImageUploadField";
import { initialsOf, colorFor } from "@/lib/blog-engagement";
import { buildChecklist } from "./types";

const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring";

const DESTINOS = [
  { key: "site" as const, icon: Globe, label: "Site", desc: "Artigo público no blog" },
  {
    key: "mural" as const,
    icon: Megaphone,
    label: "Mural de novidades",
    desc: "Comunicação interna",
  },
];

export type FieldRefs = {
  title: RefObject<HTMLInputElement | null>;
  content: RefObject<HTMLTextAreaElement | null>;
  author: RefObject<HTMLDivElement | null>;
  destino: RefObject<HTMLDivElement | null>;
  portalClientes: RefObject<HTMLDivElement | null>;
  schedule: RefObject<HTMLDivElement | null>;
};

export function PublishSidebar({
  post,
  patchImmediate,
  patchDebounced,
  portalEnabled,
  onPortalEnabledChange,
  scheduleMode,
  onScheduleModeChange,
  scheduleAt,
  onScheduleAtChange,
  fieldRefs,
}: {
  post: BlogPost;
  patchImmediate: (patch: Partial<BlogPost>) => void;
  patchDebounced: (patch: Partial<BlogPost>) => void;
  portalEnabled: boolean;
  onPortalEnabledChange: (v: boolean) => void;
  scheduleMode: "now" | "schedule";
  onScheduleModeChange: (v: "now" | "schedule") => void;
  /** Data/hora escolhida pro agendamento — ISO completo, ou "" se ainda
   * não escolhida. Só usada quando `scheduleMode === "schedule"`; a ação
   * de fato (mudar `status`/`publishDate` do post) acontece só quando o
   * CTA principal é confirmado (`PublishActions`), não aqui. */
  scheduleAt: string;
  onScheduleAtChange: (v: string) => void;
  fieldRefs: FieldRefs;
}) {
  const team = useMemo(() => loadTeamMembers(), []);
  const clientes = useClientes();
  const authorPhoto = post.authorId ? team.find((m) => m.id === post.authorId)?.photo : undefined;
  const checklist = buildChecklist(post);
  const doneCount = checklist.filter((i) => i.done).length;

  // `scheduleAt` é sempre um ISO UTC completo (com "Z"), pra que o cron do
  // Postgres (`pg_cron`, ver migration blog_scheduled_autopublish) compare
  // o instante certo — um ISO "solto" tipo "2026-09-01T22:40" (sem fuso)
  // seria interpretado como UTC pelo banco, publicando ~3h adiantado/
  // atrasado em relação ao horário local escolhido aqui. Os campos de Data/
  // Hora, por sua vez, trabalham só com componentes locais (via `Date`
  // getters), nunca fatiando a string ISO diretamente.
  const scheduleDateObj = scheduleAt ? new Date(scheduleAt) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const scheduleDate = scheduleDateObj
    ? `${scheduleDateObj.getFullYear()}-${pad(scheduleDateObj.getMonth() + 1)}-${pad(scheduleDateObj.getDate())}`
    : "";
  const scheduleTime = scheduleDateObj
    ? `${pad(scheduleDateObj.getHours())}:${pad(scheduleDateObj.getMinutes())}`
    : "";
  const combineLocal = (dateStr: string, timeStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const [h, min] = timeStr.split(":").map(Number);
    return new Date(y, m - 1, d, h, min).toISOString();
  };
  const setScheduleDate = (d: string | undefined) => {
    if (!d) return onScheduleAtChange("");
    onScheduleAtChange(combineLocal(d, scheduleTime || "09:00"));
  };
  const setScheduleTime = (t: string) => {
    const today = new Date();
    const base =
      scheduleDate || `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    onScheduleAtChange(combineLocal(base, t));
  };

  return (
    <aside className="space-y-4 rounded-xl border border-border bg-background p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Publicação
      </p>

      <CoverUploadField cover={post.cover} onChange={(cover) => patchImmediate({ cover })} />

      <div ref={fieldRefs.author} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">Autor (time)</span>
          <div className="flex items-center gap-2">
            {authorPhoto ? (
              <img
                src={authorPhoto}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${colorFor(post.authorName || "?")}`}
              >
                {initialsOf(post.authorName || "") || "?"}
              </span>
            )}
            <select
              value={post.authorId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                const m = team.find((x) => x.id === id);
                patchImmediate({ authorId: id || undefined, authorName: m?.name });
              }}
              className={inputCls}
            >
              <option value="">— Nenhum —</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.role ? ` · ${m.role}` : ""}
                </option>
              ))}
            </select>
          </div>
          {team.length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              Cadastre membros na aba Time para vincular autores.
            </p>
          )}
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">Autor (texto livre)</span>
          <input
            value={post.authorName ?? ""}
            onChange={(e) => patchDebounced({ authorName: e.target.value, authorId: undefined })}
            className={inputCls}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">Categoria</span>
        <input
          value={post.category ?? ""}
          onChange={(e) => patchDebounced({ category: e.target.value })}
          placeholder="Marketing, Design..."
          className={inputCls}
        />
      </label>

      <div className="border-t border-border pt-4">
        <div ref={fieldRefs.destino} className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Destinos
          </span>
          <p className="text-[10px] text-muted-foreground">Onde este conteúdo será publicado?</p>
          <div className="space-y-1.5">
            {DESTINOS.map(({ key, icon: Icon, label, desc }) => {
              const checked = post.audience?.includes(key) ?? false;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => {
                    const prev = post.audience ?? [];
                    const next = checked ? prev.filter((a) => a !== key) : [...prev, key];
                    patchImmediate({ audience: next });
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors ${
                    checked ? "border-foreground/30 bg-muted/60" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium leading-none">{label}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">{desc}</span>
                  </span>
                  {checked && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={portalEnabled}
              onClick={() => {
                const next = !portalEnabled;
                onPortalEnabledChange(next);
                if (!next) patchImmediate({ portalClienteIds: [] });
              }}
              className={`flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors ${
                portalEnabled
                  ? "border-foreground/30 bg-muted/60"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <Users2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium leading-none">Portal do cliente</span>
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  Conteúdo para clientes
                </span>
              </span>
              {portalEnabled && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />}
            </button>
          </div>
        </div>

        {portalEnabled && (
          <div ref={fieldRefs.portalClientes} className="mt-2 space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Clientes</span>
            <ClienteChips
              clientes={clientes}
              selectedIds={post.portalClienteIds ?? []}
              onChange={(ids) => patchImmediate({ portalClienteIds: ids })}
            />
          </div>
        )}
      </div>

      <div ref={fieldRefs.schedule} className="border-t border-border pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Publicação
        </span>
        <RadioGroup
          value={scheduleMode}
          onValueChange={(v) => onScheduleModeChange(v as "now" | "schedule")}
          className="mt-2 space-y-2"
        >
          <label className="flex items-center gap-2 text-xs">
            <RadioGroupItem value="now" id="publish-now" />
            Publicar agora
          </label>
          <label className="flex items-center gap-2 text-xs">
            <RadioGroupItem value="schedule" id="publish-schedule" />
            Agendar
          </label>
        </RadioGroup>
        {scheduleMode === "schedule" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Data</span>
              <DateField
                value={scheduleDate || undefined}
                onChange={setScheduleDate}
                className={inputCls}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Hora</span>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Pronto para publicar
        </p>
        <ul className="mt-2 space-y-1">
          {checklist.map((item) => (
            <li key={item.key} className="flex items-center gap-1.5 text-xs">
              {item.done ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/40" />
              )}
              <span className={item.done ? "text-foreground" : "text-muted-foreground"}>
                {item.label}
                {!item.required && " (opcional)"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {doneCount} de {checklist.length} completos
        </p>
      </div>
    </aside>
  );
}

function ClienteChips({
  clientes,
  selectedIds,
  onChange,
}: {
  clientes: { id: string; empresa: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = clientes.filter((c) => selectedIds.includes(c.id));
  const available = clientes.filter((c) => !selectedIds.includes(c.id));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-foreground"
        >
          {c.empresa}
          <button
            type="button"
            aria-label={`Remover ${c.empresa}`}
            onClick={() => onChange(selectedIds.filter((id) => id !== c.id))}
            className="rounded-full hover:bg-background/60"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {available.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> Adicionar
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-1">
            <div className="max-h-48 overflow-y-auto">
              {available.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange([...selectedIds, c.id]);
                    setOpen(false);
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                >
                  {c.empresa}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
      {clientes.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          Cadastre clientes na aba Clientes pra poder selecionar.
        </p>
      )}
    </div>
  );
}
