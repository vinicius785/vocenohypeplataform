import { useState } from "react";
import { Check, Tag as TagIcon, X } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  createTaskTag,
  updateTaskTagColor,
  deleteTaskTag,
  TASK_TAG_COLORS,
  type TaskTag,
} from "@/lib/task-tags-store";

/**
 * Substitui o antigo campo de etiquetas (uma `div absolute` sem Portal,
 * filha do scroll da coluna esquerda do modal — por isso ficava atrás
 * de qualquer overlay real e era clipada pelo `overflow-y-auto` do
 * ancestral). Reconstruído em cima de `Popover`+`Command`, o mesmo par
 * já usado em `ClienteFormSheet.tsx` pra busca — herda Portal, `z-50`,
 * detecção de colisão/flip e rolagem interna do Radix de graça, em vez
 * de mais um `z-index` arbitrário.
 */
export function TaskTagsPopover({
  value,
  onChange,
  taskTags,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  taskTags: TaskTag[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingColorFor, setEditingColorFor] = useState<string | null>(null);

  const colorFor = (name: string) => taskTags.find((t) => t.name === name)?.color ?? "bg-muted";

  const toggle = (name: string) => {
    // Nunca fecha o Popover ao selecionar — seleção múltipla precisa de
    // vários cliques seguidos sem reabrir o menu a cada um.
    onChange(value.includes(name) ? value.filter((t) => t !== name) : [...value, name]);
  };

  const remove = (name: string) => onChange(value.filter((t) => t !== name));

  const matches = taskTags.filter((t) =>
    t.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const exactMatch = taskTags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  const createAndSelect = () => {
    const name = search.trim();
    if (!name || exactMatch) return;
    const tag = createTaskTag(name, TASK_TAG_COLORS[0].value);
    onChange(value.includes(tag.name) ? value : [...value, tag.name]);
    setSearch("");
  };

  const MAX_VISIBLE = 3;
  const visible = value.slice(0, MAX_VISIBLE);
  const overflow = value.slice(MAX_VISIBLE);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setEditingColorFor(null);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-h-7 w-full flex-wrap items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-sm outline-none data-[state=open]:ring-1 data-[state=open]:ring-ring"
        >
          {value.length === 0 && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <TagIcon className="h-3.5 w-3.5" /> Adicionar etiqueta
            </span>
          )}
          {visible.map((t) => (
            <span
              key={t}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${colorFor(t)}`}
            >
              {t}
              <X
                className="h-2.5 w-2.5 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(t);
                }}
              />
            </span>
          ))}
          {overflow.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  +{overflow.length}
                </span>
              </TooltipTrigger>
              <TooltipContent>{overflow.join(", ")}</TooltipContent>
            </Tooltip>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-72 overflow-hidden p-0 [overscroll-behavior:contain]"
      >
        {editingColorFor ? (
          <div className="p-2">
            <p className="mb-1.5 px-1 text-[11px] text-muted-foreground">
              Cor de "{editingColorFor}" — reflete em todas as tarefas
            </p>
            <div className="flex flex-wrap gap-1.5 p-1">
              {TASK_TAG_COLORS.map((c) => {
                const current = taskTags.find((t) => t.name === editingColorFor)?.color;
                return (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => {
                      const tag = taskTags.find((t) => t.name === editingColorFor);
                      if (tag) updateTaskTagColor(tag.id, c.value);
                      setEditingColorFor(null);
                    }}
                    className={`h-6 w-6 shrink-0 rounded-full ${c.value.split(" ")[0]} ${
                      current === c.value
                        ? "ring-2 ring-offset-2 ring-offset-popover ring-foreground"
                        : ""
                    }`}
                  />
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                const tag = taskTags.find((t) => t.name === editingColorFor);
                if (tag) deleteTaskTag(tag.id);
                remove(editingColorFor);
                setEditingColorFor(null);
              }}
              className="mt-1 w-full rounded px-2 py-1 text-left text-[11px] text-destructive hover:bg-destructive/10"
            >
              Excluir etiqueta do registro
            </button>
          </div>
        ) : (
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar ou criar etiqueta..."
              value={search}
              onValueChange={setSearch}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches.length === 0) {
                  e.preventDefault();
                  createAndSelect();
                }
              }}
            />
            <CommandList className="max-h-56">
              <CommandEmpty>
                {search.trim() ? (
                  <button
                    type="button"
                    onClick={createAndSelect}
                    className="w-full px-2 py-1.5 text-left text-xs text-primary hover:bg-muted"
                  >
                    + Criar etiqueta "{search.trim()}"
                  </button>
                ) : (
                  "Nenhuma etiqueta ainda."
                )}
              </CommandEmpty>
              <CommandGroup>
                {matches.map((t) => {
                  const selected = value.includes(t.name);
                  return (
                    <CommandItem
                      key={t.id}
                      value={t.name}
                      onSelect={() => toggle(t.name)}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Check
                          className={`h-3.5 w-3.5 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`}
                        />
                        <span
                          className={`truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${t.color}`}
                        >
                          {t.name}
                        </span>
                      </span>
                      <button
                        type="button"
                        title="Editar cor desta etiqueta"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingColorFor(t.name);
                        }}
                        className={`h-3.5 w-3.5 shrink-0 rounded-full ${t.color.split(" ")[0]}`}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
