import { toast } from "sonner";
import {
  AlertTriangle,
  AtSign,
  CheckSquare,
  Info,
  MessageSquare,
  Package,
  ThumbsUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { TYPOGRAPHY, SURFACE } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

/**
 * Notificação genérica do produto — substitui o `toast()` padrão do
 * sonner (card cinza, sem identidade) por um conteúdo próprio do Hype,
 * renderizado via `toast.custom()` (mantém empilhamento/posição/swipe do
 * `<Toaster>` já configurado em `AppShell.tsx`, só troca o JSX
 * desenhado). Reutilizável pros vários tipos de evento do produto — não
 * é uma solução feita só pra mensagem de chat.
 */
export type NotificationKind =
  | "message"
  | "mention"
  | "task"
  | "delivery"
  | "approval"
  | "system"
  | "alert";

const NOTIFICATION_KIND_ICON: Record<NotificationKind, LucideIcon> = {
  message: MessageSquare,
  mention: AtSign,
  task: CheckSquare,
  delivery: Package,
  approval: ThumbsUp,
  system: Info,
  alert: AlertTriangle,
};

export type AppNotification = {
  kind: NotificationKind;
  /** Quem/o quê — "Toni Aversa", nome da campanha, etc. */
  title: string;
  /** O que aconteceu — "Enviou uma nova mensagem". */
  event: string;
  /** Contexto curto, nunca uma URL crua nem texto longo — ex. "6 links
   * recebidos", "Campanha PoupaTempo RJ". Omitido quando não há nada
   * relevante a mostrar (nunca inventado). */
  context?: string;
  /** Foto de quem gerou o evento — só pra `kind` ligado a uma pessoa
   * (`message`/`mention`). Ausente/`null` cai no círculo de ícone do
   * `kind`, nunca num avatar genérico fingindo ser uma foto. */
  avatarUrl?: string | null;
  avatarFallback?: string;
  timeLabel: string;
  /** Rótulo da ação (“Ver conversa”) — só aparece junto de `onAction`,
   * nunca uma ação fictícia sem handler. */
  actionLabel?: string;
  onAction?: () => void;
};

function NotificationIcon({ notification }: { notification: AppNotification }) {
  const isPersonKind = notification.kind === "message" || notification.kind === "mention";
  if (isPersonKind) {
    return (
      <Avatar className="h-9 w-9 shrink-0">
        {notification.avatarUrl && <AvatarImage src={notification.avatarUrl} alt="" />}
        <AvatarFallback className="text-xs font-semibold">
          {notification.avatarFallback || notification.title.slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>
    );
  }
  const Icon = NOTIFICATION_KIND_ICON[notification.kind];
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function NotificationToastContent({
  notification,
  onClose,
}: {
  notification: AppNotification;
  onClose: () => void;
}) {
  const { title, event, context, timeLabel, actionLabel, onAction } = notification;
  const clickable = !!onAction;

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onAction}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAction();
        }
      }}
      className={cn(
        "w-full max-w-sm rounded-xl p-3 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        SURFACE.raised,
        clickable && "cursor-pointer",
      )}
    >
      <div className="flex items-start gap-2.5">
        <NotificationIcon notification={notification} />
        <div className="min-w-0 flex-1">
          <p className={cn(TYPOGRAPHY.cardTitle, "truncate")}>{title}</p>
          <p className={cn(TYPOGRAPHY.bodySecondary, "truncate")}>{event}</p>
        </div>
        <IconButton
          label="Fechar notificação"
          tone="neutral"
          className="-mr-1 -mt-1 h-7 w-7 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      {context && <p className="mt-1.5 truncate pl-[46px] text-sm text-foreground/90">{context}</p>}

      <div className="mt-1.5 flex items-center justify-between gap-2 pl-[46px]">
        <span className={TYPOGRAPHY.caption}>{timeLabel}</span>
        {actionLabel && onAction && (
          <span className="text-sm font-medium text-text-brand">{actionLabel} →</span>
        )}
      </div>
    </div>
  );
}

/** Dispara a notificação — `duration` generosa (6s) pra dar tempo de ler
 * identidade+evento+contexto sem pressa, mas não `Infinity` (não é um
 * alerta bloqueante). */
export function showAppNotification(
  notification: AppNotification,
  /** Mesmo `id` substitui o toast em tela em vez de empilhar outro — é como
   * várias mensagens seguidas viram uma única notificação agrupada. */
  options?: { id?: string | number },
) {
  return toast.custom(
    (id) => (
      <NotificationToastContent notification={notification} onClose={() => toast.dismiss(id)} />
    ),
    { duration: 6000, id: options?.id },
  );
}
