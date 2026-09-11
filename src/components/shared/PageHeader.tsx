import type { ReactNode } from "react";
import { ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { MetricCard } from "./MetricCard";
import type { MetricDelta } from "@/lib/component-utils";
import type { SemanticTone } from "@/lib/design-tokens";

/**
 * Componente canônico (promovido de `PageHeaderPreview` na rodada
 * corretiva) — mas NÃO substitui `SectionHeader.tsx` ainda: nenhuma tela
 * real importa `PageHeader` até a migração de cada módulo (Etapa 3+).
 * Fica em `components/shared` porque é usado nas composições realistas
 * da própria página `/design-system` (Dashboard, Listagem).
 *
 * Sem prop de tabs — navegação, filtro e troca-de-visualização são
 * conceitos separados (ver auditoria §6: menus internos). Filtros e
 * busca vivem aqui só como SLOTS visuais de exemplo; a implementação
 * real de filtro é o `FilterBar`/chips já demonstrado na seção de
 * Selects e filtros da página.
 */
export function PageHeader({
  breadcrumb,
  title,
  description,
  primaryAction,
  secondaryActions,
  actionsSlot,
  searchPlaceholder,
  filters,
  indicators,
}: {
  breadcrumb?: string[];
  title: string;
  description?: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryActions?: { label: string; onClick: () => void }[];
  /** Escape hatch (Etapa 3) pra ações que não cabem no formato
   * `{label,onClick}` estruturado (dropdown, `PeriodPicker`, mais de um
   * botão com estilos diferentes) — usado por `SectionHeader` pra
   * delegar aqui sem quebrar quem já passa um `action` livre. Renderiza
   * junto de `primaryAction`/`secondaryActions`, não no lugar deles. */
  actionsSlot?: ReactNode;
  searchPlaceholder?: string;
  filters?: ReactNode;
  indicators?: {
    label: string;
    value: string | null;
    tone?: SemanticTone;
    delta?: MetricDelta;
  }[];
}) {
  return (
    <div className="space-y-4">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-text-secondary">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <span className={i === breadcrumb.length - 1 ? "text-foreground" : undefined}>
                {crumb}
              </span>
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={cn(TYPOGRAPHY.pageTitle, "text-foreground")}>{title}</p>
          {description && <p className={cn(TYPOGRAPHY.bodySecondary, "mt-1.5")}>{description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actionsSlot}
          {secondaryActions?.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              size="comfortable"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
          {primaryAction && (
            <Button variant="primary" size="comfortable" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}
        </div>
      </div>

      {(searchPlaceholder || filters) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchPlaceholder && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <input
                placeholder={searchPlaceholder}
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-brand sm:w-64"
              />
            </div>
          )}
          {filters}
        </div>
      )}

      {indicators && indicators.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {indicators.map((indicator) => (
            <MetricCard
              key={indicator.label}
              label={indicator.label}
              value={indicator.value}
              tone={indicator.tone}
              delta={indicator.delta}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}
