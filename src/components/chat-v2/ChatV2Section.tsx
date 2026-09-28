import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { isSidebarSectionCollapsed, setSidebarSectionCollapsed } from "./chat-v2-utils";

export function ChatV2Section({
  id,
  title,
  items,
  moreCount,
  onShowMore,
}: {
  id: string;
  title: string;
  items: { key: string; el: React.ReactNode }[];
  /** Quantos itens existem além dos já visíveis (ex: campanhas limitadas a
   * 5) — quem chama já decide o corte, esta seção só mostra o botão. */
  moreCount?: number;
  onShowMore?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(() => isSidebarSectionCollapsed(id));
  if (items.length === 0) return null;
  return (
    <div className="px-3 py-1.5">
      <button
        type="button"
        onClick={() => {
          setCollapsed((c) => {
            const next = !c;
            setSidebarSectionCollapsed(id, next);
            return next;
          });
        }}
        className="flex w-full items-center gap-1.5 rounded px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        {title}
      </button>
      {!collapsed && (
        <div className="space-y-0.5">
          {items.map((it) => (
            <div key={it.key}>{it.el}</div>
          ))}
          {!!moreCount && moreCount > 0 && (
            <button
              type="button"
              onClick={onShowMore}
              className="w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-brand hover:underline"
            >
              Mostrar mais ({moreCount})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
