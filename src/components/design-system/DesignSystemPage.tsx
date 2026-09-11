import { useEffect, useState } from "react";
import { Laptop, Menu, Moon, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clearThemePreference,
  getTheme,
  hasStoredThemePreference,
  setTheme,
  type Theme,
} from "@/lib/theme";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { FoundationsSection } from "./sections/FoundationsSection";
import { FormsSection } from "./sections/FormsSection";
import { SurfacesSection } from "./sections/SurfacesSection";
import { DataSection } from "./sections/DataSection";
import { OverlaysSection } from "./sections/OverlaysSection";
import { ChartSection } from "./sections/ChartSection";
import { PageHeaderSection } from "./sections/PageHeaderSection";
import { AppShellSection } from "./sections/AppShellSection";
import { CompositionsSection } from "./sections/CompositionsSection";
import { ThemeComparisonSection } from "./sections/ThemeComparisonSection";
import { ResponsiveSection } from "./sections/ResponsiveSection";
import { AccessibilitySection } from "./sections/AccessibilitySection";

const NAV_GROUPS = [
  {
    group: "Introdução",
    items: [{ id: "principios", label: "Princípios" }],
  },
  {
    group: "Fundação visual",
    items: [
      { id: "paleta-clara", label: "Paleta clara" },
      { id: "paleta-escura", label: "Paleta escura" },
      { id: "tipografia", label: "Tipografia" },
      { id: "espacamento", label: "Espaçamento" },
      { id: "raios-sombras", label: "Raios e sombras" },
      { id: "icones", label: "Ícones" },
    ],
  },
  {
    group: "Componentes",
    items: [
      { id: "botoes", label: "Botões" },
      { id: "icon-button", label: "IconButton" },
      { id: "inputs", label: "Inputs" },
      { id: "selects-filtros", label: "Selects e filtros" },
      { id: "segmented", label: "Segmented control" },
      { id: "cards", label: "Cards" },
      { id: "metric-cards", label: "Metric cards" },
      { id: "badges", label: "Badges" },
      { id: "alerts", label: "Alerts" },
      { id: "list-rows", label: "List rows" },
      { id: "tabela", label: "Tabela" },
      { id: "estados-vazios", label: "Estados vazios" },
      { id: "skeletons", label: "Skeletons" },
      { id: "modal", label: "Modal" },
      { id: "drawer", label: "Drawer" },
      { id: "tooltip-popover-dropdown", label: "Tooltip / Popover / Dropdown" },
      { id: "grafico", label: "Gráfico" },
      { id: "page-header", label: "PageHeader" },
    ],
  },
  {
    group: "Padrões de composição",
    items: [
      { id: "appshell", label: "AppShellPreview" },
      { id: "composicoes", label: "Composições" },
      { id: "comparacao-temas", label: "Claro e escuro" },
    ],
  },
  {
    group: "Responsividade e acessibilidade",
    items: [
      { id: "responsivo", label: "Responsivo" },
      { id: "acessibilidade", label: "Acessibilidade" },
    ],
  },
];

function ThemeSelector() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [isSystem, setIsSystem] = useState(false);

  useEffect(() => {
    setThemeState(getTheme());
    setIsSystem(!hasStoredThemePreference());
  }, []);

  const pick = (choice: Theme | "system") => {
    if (choice === "system") {
      clearThemePreference();
      setIsSystem(true);
      setThemeState(getTheme());
    } else {
      setTheme(choice);
      setIsSystem(false);
      setThemeState(choice);
    }
  };

  const OPTIONS = [
    { id: "light" as const, label: "Claro", icon: Sun },
    { id: "dark" as const, label: "Escuro", icon: Moon },
    { id: "system" as const, label: "Sistema", icon: Laptop },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Tema da página"
      className="inline-flex rounded-full border border-border bg-card p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = opt.id === "system" ? isSystem : !isSystem && theme === opt.id;
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(opt.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-text-secondary hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <div key={group.group} className="mb-4">
          <p className={cn(TYPOGRAPHY.label, "px-2 pb-1.5")}>{group.group}</p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={onNavigate}
                className="block rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Página de validação da fundação do design system. Só alcançável por
 * URL direta (`/design-system`), sem item na sidebar de produção, e sem
 * existir fora de `import.meta.env.DEV` (ver
 * `src/routes/_authenticated/design-system.tsx`). Conteúdo 100%
 * demonstrativo — nada aqui lê dado real da plataforma.
 *
 * Layout revisado na rodada corretiva: largura fluida até 1280px (era
 * `max-w-7xl` = 1280px também, mas com padding menor e sidebar mais
 * larga sobrando pouco pro conteúdo — ajustado pra aproveitar melhor o
 * desktop), índice recolhível em drawer no mobile.
 */
export function DesignSystemPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] gap-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
      <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-56 shrink-0 overflow-y-auto lg:block">
        <NavContent />
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-background p-4 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <p className={TYPOGRAPHY.cardTitle}>Índice</p>
              <button
                type="button"
                aria-label="Fechar índice"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavContent onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1 space-y-14">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir índice"
              className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div>
              <p className={TYPOGRAPHY.display}>Design System</p>
              <p className={cn(TYPOGRAPHY.bodySecondary, "mt-2 max-w-2xl")}>
                Fundação visual da plataforma — tokens, tipografia, componentes canônicos e
                composições realistas. Contrato visual pra migração futura de cada tela. Nada aqui
                está em produção ainda.
              </p>
            </div>
          </div>
          <ThemeSelector />
        </header>

        <FoundationsSection />
        <FormsSection />
        <SurfacesSection />
        <DataSection />
        <OverlaysSection />
        <ChartSection />
        <PageHeaderSection />
        <AppShellSection />
        <CompositionsSection />
        <ThemeComparisonSection />
        <ResponsiveSection />
        <AccessibilitySection />

        <footer className="border-t border-border py-8 text-center text-xs text-text-secondary">
          Design system em rodada corretiva — proposta visual ainda não aprovada, aguardando revisão
          antes da Etapa 3 (migração).
        </footer>
      </div>
    </div>
  );
}
