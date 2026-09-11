import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TYPOGRAPHY } from "@/lib/design-tokens";

/**
 * Estado vazio canônico — generaliza `ChartEmptyState` (financeiro), o
 * único lugar da plataforma que já tinha um padrão consistente. Em todo
 * o resto (Chat, Campanhas, Configurações, etc.) hoje é um `<p>` solto —
 * ver auditoria.
 */
export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        compact ? "px-4 py-6" : "px-6 py-12",
      )}
    >
      {icon && (
        <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </span>
      )}
      <p className={compact ? "text-sm font-medium text-foreground" : TYPOGRAPHY.sectionTitle}>
        {title}
      </p>
      {description && <p className={cn(TYPOGRAPHY.bodySecondary, "max-w-sm")}>{description}</p>}
      {(primaryAction || secondaryAction) && (
        <div className="mt-2 flex items-center gap-2">
          {secondaryAction && (
            <Button variant="ghost" size="sm" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
          {primaryAction && (
            <Button variant="primary" size="sm" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
