import { useMemo, useState, type RefObject } from "react";
import { Globe, Megaphone, Users2, Check, X, Plus } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { BlogPost } from "@/lib/projetos";
import { loadTeamMembers } from "@/lib/projetos";
import { useClientes } from "@/lib/clientes-store";
import { CoverUploadField } from "../ImageUploadField";
import { initialsOf, colorFor } from "@/lib/blog-engagement";
import { buildChecklist, slugify } from "./types";
import { NativeSelect } from "@/components/ui/native-select";

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

export function ArticleSettings({
  post,
  patchImmediate,
  patchDebounced,
  portalEnabled,
  onPortalEnabledChange,
  scheduleMode,
  onScheduleModeChange,
  scheduleAt,
  onScheduleAtChange,
  authorModeState,
  onAuthorModeChange,
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
  authorModeState: "team" | "custom";
  onAuthorModeChange: (v: "team" | "custom") => void;
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

  const authorMode: "team" | "custom" = authorModeState;
  const SECTION = "text-xs font-semibold uppercase tracking-widest text-text-secondary";

  return (
    <section aria-labelledby="blog-config" className="space-y-6">
      <h2 id="blog-config" className={SECTION}>
        Publicação
      </h2>

      <div className="space-y-7">
        <div className="space-y-6">
          <CoverUploadField cover={post.cover} onChange={(cover) => patchImmediate({ cover })} />

          <div ref={fieldRefs.author} className="space-y-2">
            <p className={SECTION}>Autor</p>
            <SegmentedControl
              aria-label="Tipo de autor"
              size="sm"
              value={authorMode}
              onChange={(v) => {
                onAuthorModeChange(v);
                // Trocar o tipo não apaga o nome já escolhido; só passa a editar o campo do tipo.
                if (v === "custom") patchImmediate({ authorId: undefined });
              }}
              options={[
                { value: "team", label: "Usuário do time" },
                { value: "custom", label: "Autor personalizado" },
              ]}
            />
            {authorMode === "team" ? (
              <div className="flex items-center gap-2">
                {authorPhoto ? (
                  <img
                    src={authorPhoto}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${colorFor(post.authorName || "?")}`}
                  >
                    {initialsOf(post.authorName || "") || "?"}
                  </span>
                )}
                <NativeSelect
                  value={post.authorId ?? ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const m = team.find((x) => x.id === id);
                    patchImmediate({ authorId: id || undefined, authorName: m?.name });
                  }}
                  aria-label="Autor (usuário do time)"
                  selectClassName="h-10"
                >
                  <option value="">Selecione um usuário</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.role ? ` · ${m.role}` : ""}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : (
              <Input
                value={post.authorName ?? ""}
                onChange={(e) =>
                  patchDebounced({ authorName: e.target.value, authorId: undefined })
                }
                aria-label="Nome do autor"
                placeholder="Nome que aparece no artigo"
                className="h-10"
              />
            )}
            {authorMode === "team" && team.length === 0 && (
              <p className="text-xs text-text-secondary">
                Cadastre membros na aba Time para vincular autores.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label htmlFor="blog-categoria" className={SECTION}>
                Categoria
              </label>
              <Input
                id="blog-categoria"
                value={post.category ?? ""}
                onChange={(e) => patchDebounced({ category: e.target.value })}
                placeholder="Marketing, Design..."
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="blog-slug" className={SECTION}>
                Endereço (slug)
              </label>
              <Input
                id="blog-slug"
                value={post.slug ?? ""}
                onChange={(e) => patchDebounced({ slug: slugify(e.target.value) })}
                className="h-10"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div ref={fieldRefs.destino} className="space-y-2">
            <p className={SECTION}>Destinos</p>
            <ul className="divide-y divide-border/60">
              {DESTINOS.map(({ key, icon: Icon, label, desc }) => {
                const checked = post.audience?.includes(key) ?? false;
                return (
                  <li key={key}>
                    <label className="flex cursor-pointer items-center gap-3 py-2.5">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          const prev = post.audience ?? [];
                          patchImmediate({
                            audience: checked ? prev.filter((a) => a !== key) : [...prev, key],
                          });
                        }}
                      />
                      <Icon className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">{label}</span>
                        <span className="block text-xs text-text-secondary">{desc}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
              <li>
                <label className="flex cursor-pointer items-center gap-3 py-2.5">
                  <Checkbox
                    checked={portalEnabled}
                    onCheckedChange={() => {
                      const next = !portalEnabled;
                      onPortalEnabledChange(next);
                      if (!next) patchImmediate({ portalClienteIds: [] });
                    }}
                  />
                  <Users2 className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      Portal do cliente
                    </span>
                    <span className="block text-xs text-text-secondary">
                      Conteúdo para clientes
                    </span>
                  </span>
                </label>
              </li>
            </ul>
            {portalEnabled && (
              <div ref={fieldRefs.portalClientes} className="space-y-1.5 pl-7">
                <span className="text-xs font-medium text-text-secondary">Clientes</span>
                <ClienteChips
                  clientes={clientes}
                  selectedIds={post.portalClienteIds ?? []}
                  onChange={(ids) => patchImmediate({ portalClienteIds: ids })}
                />
              </div>
            )}
          </div>

          <div ref={fieldRefs.schedule} className="space-y-2">
            <p className={SECTION}>Publicação</p>
            <RadioGroup
              value={scheduleMode}
              onValueChange={(v) => onScheduleModeChange(v as "now" | "schedule")}
              className="flex flex-wrap gap-x-6 gap-y-2"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="now" id="publish-now" />
                Publicar agora
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="schedule" id="publish-schedule" />
                Agendar
              </label>
            </RadioGroup>
            {scheduleMode === "schedule" && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-text-secondary">Data</span>
                  <DateField
                    value={scheduleDate || undefined}
                    onChange={setScheduleDate}
                    className="h-10 text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-text-secondary">Hora</span>
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="h-10"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className={SECTION}>
              Pronto para publicar{" "}
              <span className="ml-1 font-normal normal-case tracking-normal text-text-secondary">
                · {doneCount} de {checklist.length}
              </span>
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {checklist.map((item) => (
                <li key={item.key} className="flex items-center gap-1.5 text-sm">
                  {item.done ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-label="Concluído" />
                  ) : (
                    <span
                      aria-label="Pendente"
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/40"
                    />
                  )}
                  <span className={item.done ? "text-foreground" : "text-text-secondary"}>
                    {item.label}
                    {!item.required && " (opcional)"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
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
        <p className="text-[11px] text-muted-foreground">
          Cadastre clientes na aba Clientes pra poder selecionar.
        </p>
      )}
    </div>
  );
}
