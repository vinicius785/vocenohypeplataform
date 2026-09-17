import { useState } from "react";
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  LayoutGrid,
  Menu,
  Search,
  Target,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/shared/PageHeader";

const NAV_ITEMS = [
  { id: "inicio", label: "Início", icon: LayoutGrid },
  { id: "clientes", label: "Clientes", icon: Building2 },
  { id: "comercial", label: "Comercial", icon: Target },
  { id: "reunioes", label: "Reuniões", icon: CalendarDays },
  { id: "time", label: "Time", icon: Users },
  { id: "financeiro", label: "Financeiro", icon: BarChart3 },
] as const;

function NavList({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <nav className="space-y-0.5">
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === active;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-brand-subtle text-brand"
                : "text-text-secondary hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Demonstração ISOLADA do futuro layout global (rodada corretiva §9) —
 * NÃO é o `AppShell.tsx` real e não afeta a navegação de produção. Vive
 * só aqui, em `design-system/` (conteúdo demonstrativo), pra validar a
 * identidade visual (marca em item ativo/foco/ação principal, poucas
 * linhas divisórias, sidebar com contraste adequado) antes de qualquer
 * migração real do `AppShell`.
 */
export function AppShellPreview() {
  const [active, setActive] = useState<string>("inicio");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div className="flex h-[600px] min-h-0">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card p-4 lg:flex">
          <div className="mb-6 flex items-center gap-2 px-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">
              V
            </span>
            <span className={cn(TYPOGRAPHY.cardTitle, "text-foreground")}>Plataforma VNH</span>
          </div>
          <NavList active={active} onSelect={setActive} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir navegação"
              className="flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-muted lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <input
                placeholder="Buscar..."
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-brand"
              />
            </div>
            <button
              type="button"
              aria-label="Notificações"
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-muted hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
            </button>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-subtle text-xs font-semibold text-brand">
              RG
            </span>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <PageHeader
              title={NAV_ITEMS.find((n) => n.id === active)?.label ?? "Início"}
              description="Pré-visualização isolada — não é o AppShell real."
              primaryAction={{ label: "Nova ação", onClick: () => {} }}
              indicators={[
                { label: "Indicador A", value: "R$ 42.900", tone: "success", delta: { value: 12 } },
                { label: "Indicador B", value: "18", tone: "brand" },
                { label: "Indicador C", value: "4,2%", tone: "danger" },
                { label: "Indicador D", value: null },
              ]}
            />
          </div>
        </div>
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 p-4">
          <SheetTitle className="sr-only">Navegação</SheetTitle>
          <div className="mb-6 flex items-center gap-2 px-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">
              V
            </span>
            <span className={cn(TYPOGRAPHY.cardTitle, "text-foreground")}>Plataforma VNH</span>
          </div>
          <NavList
            active={active}
            onSelect={(id) => {
              setActive(id);
              setMobileNavOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
