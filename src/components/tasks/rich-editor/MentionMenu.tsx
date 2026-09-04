import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import type { SuggestionProps } from "@tiptap/suggestion";
import { MENTION_KIND_CONFIG, MENTION_KIND_ORDER, type MentionOption } from "@/lib/mention-kinds";
import type { SuggestionListHandle } from "./suggestionRenderer";

type TabKey = "all" | (typeof MENTION_KIND_ORDER)[number];

/** Menu "@" de menção — tabs Tudo/Pessoas/Tarefas/... (item 8 do pedido),
 * mesma fonte de opções (`MentionOption[]`) e mesmo critério de ranking já
 * usados no Chat (`mention-kinds.ts`), sem depender de nada privado do
 * componente de Chat. */
export const MentionMenu = forwardRef<SuggestionListHandle, SuggestionProps<MentionOption>>(
  function MentionMenu({ items, command }, ref) {
    const [tab, setTab] = useState<TabKey>("all");
    const [selected, setSelected] = useState(0);

    const availableKinds = useMemo(
      () => MENTION_KIND_ORDER.filter((k) => items.some((o) => o.kind === k)),
      [items],
    );
    const filtered = useMemo(
      () => (tab === "all" ? items : items.filter((o) => o.kind === tab)),
      [items, tab],
    );

    useEffect(() => setSelected(0), [filtered]);
    useEffect(() => setTab("all"), [items]);

    const select = (index: number) => {
      const item = filtered[index];
      if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowDown") {
          setSelected((i) => (i + 1) % Math.max(filtered.length, 1));
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1));
          return true;
        }
        if (event.key === "Enter") {
          select(selected);
          return true;
        }
        return false;
      },
    }));

    return (
      <div className="w-72 rounded-md border border-border bg-popover shadow-md">
        {availableKinds.length > 1 && (
          <div className="flex gap-0.5 border-b border-border p-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTab("all")}
              className={`cursor-pointer rounded px-2 py-1 text-[11px] font-medium ${
                tab === "all"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              Tudo
            </button>
            {availableKinds.map((k) => (
              <button
                key={k}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setTab(k)}
                className={`cursor-pointer rounded px-2 py-1 text-[11px] font-medium ${
                  tab === k ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {MENTION_KIND_CONFIG[k].label}
              </button>
            ))}
          </div>
        )}
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">Nada encontrado.</p>
          ) : (
            filtered.map((opt, idx) => {
              const Icon = MENTION_KIND_CONFIG[opt.kind].Icon;
              return (
                <button
                  key={`${opt.kind}:${opt.id}`}
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
                  {opt.photo ? (
                    <img
                      src={opt.photo}
                      alt=""
                      className="h-5 w-5 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                      {opt.hint}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  },
);
