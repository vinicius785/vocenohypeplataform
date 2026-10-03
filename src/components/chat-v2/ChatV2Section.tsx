import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { isSidebarSectionCollapsed, setSidebarSectionCollapsed } from "./chat-v2-utils";

export function ChatV2Section({
  id,
  title,
  items,
  action,
}: {
  id: string;
  title: string;
  items: { key: string; el: React.ReactNode }[];
  /** Ação discreta ao lado do título (ex: "Ver campanhas encerradas") — nunca
   * um "mostrar mais"/paginação: a seção sempre lista todos os itens e rola
   * naturalmente dentro do scroll da coluna. */
  action?: { label: string; onClick: () => void };
}) {
  const [collapsed, setCollapsed] = useState(() => isSidebarSectionCollapsed(id));
  if (items.length === 0) return null;
  return (
    <div className="px-3 py-1.5">
      <div className="flex items-center justify-between gap-1.5">
        <button
          type="button"
          onClick={() => {
            setCollapsed((c) => {
              const next = !c;
              setSidebarSectionCollapsed(id, next);
              return next;
            });
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={`h-3 w-3 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
          <span className="truncate">{title}</span>
        </button>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="shrink-0 px-1 py-1 text-[11px] font-medium text-text-brand hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="space-y-0.5">
          {items.map((it) => (
            <div key={it.key}>{it.el}</div>
          ))}
        </div>
      )}
    </div>
  );
}
