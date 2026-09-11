export type Theme = "light" | "dark";

const KEY = "config:theme";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function initTheme() {
  if (typeof window === "undefined") return;
  applyTheme(getTheme());
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

/** Aditivo (rodada corretiva do design system) — "Sistema" não é um
 * terceiro valor de `Theme` (isso mudaria o tipo usado em toda tela real
 * hoje); é só limpar a preferência salva e aplicar o que o SO já diz,
 * que é exatamente o que `getTheme()` já fazia como fallback. Só a
 * página `/design-system` chama isso por enquanto. */
export function clearThemePreference() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  applyTheme(window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

export function hasStoredThemePreference(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
