import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SURFACE } from "@/lib/design-tokens";

/**
 * Bloco compartilhado de layout da reconstrução de Configurações —
 * `SettingsCard`/`SettingsRow`/`SettingsSaveBar`/`SettingsSectionHeader`/
 * `DangerZone`. Nenhum destes componentes tem lógica de negócio: cada
 * seção (`PerfilSection`, `GeralSection`, etc.) continua dona dos próprios
 * dados/permissões/chamadas, só usa esta casca visual em vez de reimplementar
 * "card com borda"/"linha com switch"/"barra de salvar" do zero.
 */

export function SettingsCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl p-5", SURFACE.raised, className)}>
      {(title || description) && (
        <div className="mb-4 space-y-1">
          {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className="space-y-1">{children}</div>
      {footer && <div className="mt-4 border-t border-border/60 pt-4">{footer}</div>}
    </div>
  );
}

export function SettingsRow({
  title,
  description,
  control,
  action,
  destructive,
  className,
}: {
  title: string;
  description?: string;
  control?: ReactNode;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  destructive?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3.5 first:pt-0 last:border-b-0 last:pb-0",
        className,
      )}
    >
      <div className="min-w-[180px] flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            destructive ? "text-destructive" : "text-foreground",
          )}
        >
          {title}
        </p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {control}
      {action && (
        <Button
          type="button"
          variant={destructive ? "outline" : "outline"}
          size="sm"
          onClick={action.onClick}
          disabled={action.disabled}
          className={cn("shrink-0", destructive && "text-destructive hover:text-destructive")}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function SettingsSectionHeader({
  icon,
  title,
  description,
  adminOnly,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  adminOnly?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 pb-1">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {adminOnly && (
        <Badge variant="secondary" className="shrink-0">
          Somente administradores
        </Badge>
      )}
    </div>
  );
}

/**
 * Barra de "alterações não salvas" (modo `manual`) ou aviso discreto de
 * autosave (modo `autosave`) — sticky no rodapé da área de conteúdo.
 * Extraída do padrão repetido "Salvar/Salvando/Salvo" que cada aba
 * reimplementava (Perfil, Geral, Precificação, Score Operacional).
 */
export function SettingsSaveBar({
  mode,
  dirty,
  saving,
  error,
  savedFeedback,
  onDiscard,
  onSave,
}: {
  mode: "manual" | "autosave";
  dirty: boolean;
  saving?: boolean;
  error?: string | null;
  savedFeedback?: boolean;
  onDiscard?: () => void;
  onSave?: () => void;
}) {
  if (mode === "autosave") {
    if (!savedFeedback) return null;
    return (
      <p className="sticky bottom-0 z-10 mt-2 flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/95 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
        Alterações salvas automaticamente.
      </p>
    );
  }

  if (!dirty) return null;

  return (
    <div className="sticky bottom-0 z-10 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Você possui alterações não salvas</p>
        {error && <p className="mt-0.5 text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDiscard} disabled={saving}>
          Descartar
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}

export function DangerZone({
  title,
  description,
  actionLabel,
  onAction,
  disabled,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="min-w-[180px]">
        <p className="text-sm font-medium text-destructive">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAction}
        disabled={disabled}
        className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        {actionLabel}
      </Button>
    </div>
  );
}
