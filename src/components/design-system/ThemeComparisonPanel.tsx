import type { CSSProperties, ReactNode } from "react";

/**
 * Força os tokens de um tema específico dentro de uma caixa, via
 * variáveis CSS custom em `style` (maior especificidade que a regra
 * `.dark`/`:root` de `styles.css`) — assim a comparação lado a lado
 * (rodada corretiva §11) funciona com os tokens REAIS, independente do
 * tema ativo na página no momento. Valores copiados de `styles.css`.
 */
const LIGHT_VARS: Record<string, string> = {
  colorScheme: "light",
  "--background": "oklch(1 0 0)",
  "--foreground": "oklch(0.129 0.042 264.695)",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.129 0.042 264.695)",
  "--secondary": "oklch(0.968 0.007 247.896)",
  "--secondary-foreground": "oklch(0.208 0.042 265.755)",
  "--muted": "oklch(0.968 0.007 247.896)",
  "--muted-foreground": "oklch(0.554 0.046 257.417)",
  "--destructive": "oklch(0.577 0.245 27.325)",
  "--destructive-foreground": "oklch(0.984 0.003 247.858)",
  "--border": "oklch(0.929 0.013 255.508)",
  "--input": "oklch(0.929 0.013 255.508)",
  "--ring": "oklch(0.704 0.04 256.788)",
  "--brand": "oklch(0.6907 0.1616 267.26)",
  "--brand-hover": "oklch(0.6281 0.1455 267.06)",
  "--brand-subtle": "oklch(0.6907 0.1616 267.26 / 12%)",
  "--brand-foreground": "oklch(0.1773 0.0341 269.56)",
  "--text-secondary": "oklch(0.4461 0.0263 256.8)",
  "--success": "oklch(0.6959 0.1491 162.48)",
  "--success-soft": "oklch(0.6959 0.1491 162.48 / 12%)",
  "--success-soft-foreground": "oklch(0.4 0.1 162.48)",
  "--success-border": "oklch(0.6959 0.1491 162.48 / 30%)",
  "--warning": "oklch(0.7686 0.1647 70.08)",
  "--warning-soft": "oklch(0.7686 0.1647 70.08 / 14%)",
  "--warning-soft-foreground": "oklch(0.42 0.11 70.08)",
  "--warning-border": "oklch(0.7686 0.1647 70.08 / 32%)",
  "--danger": "oklch(0.6368 0.2078 25.331)",
  "--danger-soft": "oklch(0.6368 0.2078 25.331 / 12%)",
  "--danger-soft-foreground": "oklch(0.4 0.15 25.331)",
  "--danger-border": "oklch(0.6368 0.2078 25.331 / 30%)",
  "--info": "oklch(0.6231 0.188 259.815)",
  "--info-soft": "oklch(0.6231 0.188 259.815 / 12%)",
  "--info-soft-foreground": "oklch(0.38 0.12 259.815)",
  "--info-border": "oklch(0.6231 0.188 259.815 / 30%)",
};

const DARK_VARS: Record<string, string> = {
  colorScheme: "dark",
  "--background": "oklch(0.145 0 0)",
  "--foreground": "oklch(0.985 0 0)",
  "--card": "oklch(0.205 0 0)",
  "--card-foreground": "oklch(0.985 0 0)",
  "--secondary": "oklch(0.269 0 0)",
  "--secondary-foreground": "oklch(0.985 0 0)",
  "--muted": "oklch(0.269 0 0)",
  "--muted-foreground": "oklch(0.708 0 0)",
  "--destructive": "oklch(0.704 0.191 22.216)",
  "--destructive-foreground": "oklch(0.985 0 0)",
  "--border": "oklch(1 0 0 / 10%)",
  "--input": "oklch(1 0 0 / 15%)",
  "--ring": "oklch(0.556 0 0)",
  "--brand": "oklch(0.6907 0.1616 267.26)",
  "--brand-hover": "oklch(0.7246 0.142 268.111)",
  "--brand-subtle": "oklch(0.6907 0.1616 267.26 / 14%)",
  "--brand-foreground": "oklch(0.1773 0.0341 269.56)",
  "--text-secondary": "oklch(0.7137 0.0192 261.32)",
  "--success": "oklch(0.7729 0.1535 163.223)",
  "--success-soft": "oklch(0.7729 0.1535 163.223 / 14%)",
  "--success-soft-foreground": "oklch(0.85 0.14 163.223)",
  "--success-border": "oklch(0.7729 0.1535 163.223 / 30%)",
  "--warning": "oklch(0.8369 0.1644 84.429)",
  "--warning-soft": "oklch(0.8369 0.1644 84.429 / 16%)",
  "--warning-soft-foreground": "oklch(0.88 0.15 84.429)",
  "--warning-border": "oklch(0.8369 0.1644 84.429 / 32%)",
  "--danger": "oklch(0.7106 0.1661 22.216)",
  "--danger-soft": "oklch(0.7106 0.1661 22.216 / 14%)",
  "--danger-soft-foreground": "oklch(0.82 0.15 22.216)",
  "--danger-border": "oklch(0.7106 0.1661 22.216 / 30%)",
  "--info": "oklch(0.7137 0.1434 254.624)",
  "--info-soft": "oklch(0.7137 0.1434 254.624 / 14%)",
  "--info-soft-foreground": "oklch(0.82 0.11 254.624)",
  "--info-border": "oklch(0.7137 0.1434 254.624 / 30%)",
};

export function ThemeComparisonPanel({
  label,
  theme,
  children,
}: {
  label: string;
  theme: "light" | "dark";
  children: ReactNode;
}) {
  return (
    <div
      style={(theme === "light" ? LIGHT_VARS : DARK_VARS) as CSSProperties}
      className="min-w-0 rounded-xl border border-border bg-background p-4"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
