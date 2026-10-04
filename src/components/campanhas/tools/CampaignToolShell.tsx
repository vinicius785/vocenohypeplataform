import type { ComponentType, ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, ArrowLeft, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/ui/icon-button";

/**
 * Campanha → Ferramentas → <ferramenta>. Shell ÚNICO de apresentação das
 * ferramentas da campanha (Documentos, Calendário, Relatórios, NPS): só
 * container, header, scroll, footer e estados — nenhuma lógica de dado.
 *
 * Construído direto sobre o Radix Dialog (o mesmo primitivo do
 * `ui/dialog.tsx`), então herda foco preso, Esc pra fechar, retorno de foco
 * ao gatilho e `aria-labelledby/-describedby` automáticos.
 *
 * Tamanhos (regra única, ver pedido §12):
 * - `compact` → painel centralizado estreito (Documentos)
 * - `medium`  → painel centralizado amplo (Relatórios, NPS)
 * - `large`   → drawer lateral largo, altura total (Calendário)
 * Abaixo de `sm:` todos viram tela cheia — mesmo comportamento do
 * `mobileFullScreen` já usado nos diálogos do app.
 */
export type CampaignToolSize = "compact" | "medium" | "large";

const SIZE_CLASS: Record<CampaignToolSize, string> = {
  compact:
    "sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[85vh] sm:w-[calc(100vw-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
  medium:
    "sm:left-1/2 sm:top-1/2 sm:h-[88vh] sm:w-[calc(100vw-2rem)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
  large:
    "sm:left-auto sm:right-0 sm:top-0 sm:h-dvh sm:w-[min(100vw,72rem)] sm:border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
};

export function CampaignToolShell({
  open,
  onOpenChange,
  size,
  campanhaNome,
  backTo = "a campanha",
  icon: Icon,
  title,
  description,
  actions,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size: CampaignToolSize;
  campanhaNome: string;
  /** Complemento de "Voltar para …" (padrão: "a campanha"). */
  backTo?: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** Ação principal da ferramenta — sempre no mesmo lugar (direita do título). */
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const close = () => onOpenChange(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-hidden border-border bg-card shadow-lg ring-1 ring-primary/25 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:inset-auto",
            SIZE_CLASS[size],
          )}
        >
          <header className="shrink-0 space-y-3 border-b border-border px-4 pb-4 pt-3 sm:px-6 sm:pt-4">
            {/* Mesmo padrão de navegação do topo da página da campanha
             * (`← Campanhas / {nome}`) — aqui um nível abaixo. */}
            <div className="flex items-center justify-between gap-2">
              <nav aria-label="Navegação" className="flex min-w-0 items-center gap-1.5 text-sm">
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex min-w-0 items-center gap-1 text-text-secondary hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label={`Voltar para ${backTo} ${campanhaNome}`}
                >
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{campanhaNome}</span>
                </button>
                <span className="text-text-secondary">/</span>
                <span className="shrink-0 text-text-secondary">Recursos</span>
              </nav>
              <DialogPrimitive.Close asChild>
                <IconButton label="Fechar" className="-mr-2 h-8 w-8 shrink-0">
                  <X />
                </IconButton>
              </DialogPrimitive.Close>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <DialogPrimitive.Title className="text-lg font-semibold leading-tight tracking-tight text-foreground">
                    {title}
                  </DialogPrimitive.Title>
                  {description ? (
                    <DialogPrimitive.Description className="mt-0.5 text-sm text-text-secondary">
                      {description}
                    </DialogPrimitive.Description>
                  ) : (
                    <DialogPrimitive.Description className="sr-only">
                      {title}
                    </DialogPrimitive.Description>
                  )}
                </div>
              </div>
              {actions && (
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>
              )}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>

          {footer && (
            <footer className="shrink-0 border-t border-border px-4 py-3 sm:px-6">{footer}</footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Título de seção dentro de uma ferramenta — mesmo estilo dos rótulos de
 * seção da página da campanha ("Informações da campanha", "Briefing"). */
export function ToolSectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {children}
      </h3>
      {action}
    </div>
  );
}

/* ---------- Estados padronizados (iguais em todas as ferramentas) ---------- */

export function ToolLoading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-16 text-sm text-text-secondary"
    >
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ToolError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      compact
      icon={<AlertTriangle className="h-5 w-5" />}
      title={title}
      description={message}
      primaryAction={onRetry ? { label: "Tentar novamente", onClick: onRetry } : undefined}
    />
  );
}

/** Erro inline curto (ex.: falha de upload) — não substitui o conteúdo. */
export function ToolInlineError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
      {children}
    </p>
  );
}

export function ToolEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <EmptyState
      compact
      icon={<Icon className="h-5 w-5" />}
      title={title}
      description={description}
      primaryAction={action}
    />
  );
}
