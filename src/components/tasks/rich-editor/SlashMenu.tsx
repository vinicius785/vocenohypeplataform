import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import type { SuggestionProps } from "@tiptap/suggestion";
import type { SlashCommandItem } from "./slashCommandExtension";
import type { SuggestionListHandle } from "./suggestionRenderer";

/** Menu "/" de comandos — mesmo visual dos popups de seleção já usados na
 * plataforma (`rounded-md border border-border bg-popover shadow-md`,
 * linhas com hover discreto). Agrupa por `group` (Texto/Listas/Blocos/
 * Inserir), navegação por teclado via `useImperativeHandle`. */
export const SlashMenu = forwardRef<SuggestionListHandle, SuggestionProps<SlashCommandItem>>(
  function SlashMenu({ items, command }, ref) {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [items]);

    const groups = useMemo(() => {
      const byGroup = new Map<string, SlashCommandItem[]>();
      for (const item of items) {
        if (!byGroup.has(item.group)) byGroup.set(item.group, []);
        byGroup.get(item.group)!.push(item);
      }
      return Array.from(byGroup.entries());
    }, [items]);

    const select = (index: number) => {
      const item = items[index];
      if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowDown") {
          setSelected((i) => (i + 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((i) => (i - 1 + items.length) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "Enter") {
          select(selected);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="w-64 rounded-md border border-border bg-popover p-2 text-xs text-muted-foreground shadow-md">
          Nenhum comando encontrado.
        </div>
      );
    }

    let flatIndex = -1;
    return (
      <div className="max-h-80 w-64 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md">
        {groups.map(([group, groupItems]) => (
          <div key={group} className="py-0.5">
            <p className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </p>
            {groupItems.map((item) => {
              flatIndex += 1;
              const idx = flatIndex;
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(idx);
                  }}
                  onMouseEnter={() => setSelected(idx)}
                  className={`flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-sm ${
                    idx === selected ? "bg-muted text-foreground" : "text-foreground/90"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  },
);
