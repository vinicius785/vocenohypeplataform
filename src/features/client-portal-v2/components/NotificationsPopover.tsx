import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckSquare, Sparkles } from "lucide-react";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { deriveAttentionItems, deriveRecentActivity } from "../lib/derive";
import { isRead, markRead } from "../lib/notification-read-state";

const MAX_ITEMS = 6;

/**
 * Sino da topbar — popover compacto, nunca mais uma página própria
 * (Notificações deixou de ser destino de menu nesta rodada). Combina
 * pendências reais + atividade recente, mesmos dados já derivados pra
 * Início — nenhuma consulta nova, nenhum estado de "lida" no servidor
 * (ver `notification-read-state.ts`). Sem CTA "Ver todas": clicar num
 * item já abre o contexto certo e marca como lido.
 */
export function NotificationsPopover() {
  const { data } = usePortalSessionData();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [, forceRerender] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const attention = deriveAttentionItems(data).map((a) => ({
      id: `attention:${a.id}`,
      icon: CheckSquare,
      label: a.description,
      campanhaNome: a.campanhaNome,
      href: a.href,
    }));
    const activity = deriveRecentActivity(data, MAX_ITEMS).map((entry) => ({
      id: `activity:${entry.id}`,
      icon: Sparkles,
      label: entry.label,
      campanhaNome: entry.campanhaNome,
      href: entry.href,
    }));
    return [...attention, ...activity].slice(0, MAX_ITEMS);
  }, [data]);

  const unreadCount = items.filter((i) => !isRead(i.id)).length;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Notificações"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-warning" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-semibold text-foreground">Notificações</p>
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhuma notificação por aqui.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {items.map((item) => {
                const read = isRead(item.id);
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      markRead(item.id);
                      forceRerender((n) => n + 1);
                      setOpen(false);
                      navigate({ to: item.href });
                    }}
                    className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/60 ${
                      read ? "" : "bg-brand/5"
                    }`}
                  >
                    {!read && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    )}
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 text-muted-foreground ${read ? "ml-3.5" : ""}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-xs ${read ? "text-muted-foreground" : "font-medium text-foreground"}`}
                      >
                        {item.label}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {item.campanhaNome}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
