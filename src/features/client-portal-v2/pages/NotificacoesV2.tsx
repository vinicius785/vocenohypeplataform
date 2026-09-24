import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckSquare, Sparkles } from "lucide-react";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { deriveApprovalItems, deriveRecentActivity } from "../lib/derive";
import { isRead, markAllRead, markRead } from "../lib/notification-read-state";

type NotificationEntry = {
  id: string;
  icon: typeof Bell;
  label: string;
  campanhaNome: string;
  at: string;
  href: string;
};

/**
 * Central de notificações — composta a partir de dados que já existem
 * (aprovações pendentes + atividade recente), não uma tabela nova. "Lida"
 * é só uma conveniência local (`notification-read-state.ts`), nunca um
 * registro compartilhado — nota explícita na tela sobre essa limitação.
 */
export function NotificacoesV2() {
  const { data } = usePortalSessionData();
  const navigate = useNavigate();
  const [, forceRerender] = useState(0);

  const entries: NotificationEntry[] = useMemo(() => {
    const approvals = deriveApprovalItems(data).map((a) => ({
      id: `approval:${a.id}`,
      icon: CheckSquare,
      label: a.title,
      campanhaNome: a.campanhaNome,
      at: new Date().toISOString(),
      href: "/portal-v2/aprovacoes",
    }));
    const activity = deriveRecentActivity(data, 20).map((entry) => ({
      id: `activity:${entry.id}`,
      icon: Sparkles,
      label: entry.label,
      campanhaNome: entry.campanhaNome,
      at: entry.at,
      href: entry.href,
    }));
    return [...approvals, ...activity].sort((a, b) => b.at.localeCompare(a.at));
  }, [data]);

  const unreadCount = entries.filter((e) => !isRead(e.id)).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Notificações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} não lida(s)` : "Tudo em dia"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => {
              markAllRead(entries.map((e) => e.id));
              forceRerender((n) => n + 1);
            }}
            className="text-xs font-medium text-brand hover:underline"
          >
            Marcar todas como lidas
          </button>
        )}
      </header>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma notificação por aqui.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => {
            const read = isRead(entry.id);
            const Icon = entry.icon;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  markRead(entry.id);
                  forceRerender((n) => n + 1);
                  navigate({ to: entry.href });
                }}
                className={`flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-left hover:bg-muted/40 ${
                  read ? "bg-card" : "bg-brand/5"
                }`}
              >
                {!read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />}
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm ${read ? "text-muted-foreground" : "font-medium text-foreground"}`}
                  >
                    {entry.label}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {entry.campanhaNome}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        "Lida" é salvo só neste navegador — ainda não existe um registro de leitura compartilhado
        entre dispositivos.
      </p>
    </div>
  );
}
