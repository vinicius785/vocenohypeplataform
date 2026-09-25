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

/**
 * Preferência de tema de 3 vias (Sistema/Claro/Escuro) — usada pelo menu
 * compacto do Portal V2 (`ClientThemeMenu`). "Sistema" nunca é persistido
 * como um terceiro valor de `Theme` (isso mudaria o tipo usado em toda
 * tela real hoje) — é só a AUSÊNCIA de preferência salva, que já é
 * exatamente o que `getTheme()`/`clearThemePreference()` já faziam.
 */
export type ThemePreference = "light" | "dark" | "system";

export function getThemePreference(): ThemePreference {
  if (!hasStoredThemePreference()) return "system";
  return getTheme();
}

export function setThemePreference(pref: ThemePreference) {
  if (pref === "system") {
    clearThemePreference();
    return;
  }
  setTheme(pref);
}

/**
 * Mantém o tema aplicado em sincronia com: (1) mudança de
 * `prefers-color-scheme` do SO enquanto a preferência é "Sistema", e (2)
 * a preferência sendo trocada em OUTRA aba (evento `storage` do
 * `localStorage`, que só dispara nas abas que NÃO fizeram a escrita —
 * por isso `setThemePreference` chama `applyTheme` direto na própria aba,
 * e este listener cobre as demais). Retorna uma função de limpeza.
 */
export function watchThemePreference(onChange: (pref: ThemePreference) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (!hasStoredThemePreference()) {
      applyTheme(mql?.matches ? "dark" : "light");
      onChange("system");
    }
  };
  mql?.addEventListener?.("change", onSystemChange);

  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== KEY) return;
    const pref = getThemePreference();
    applyTheme(pref === "system" ? (mql?.matches ? "dark" : "light") : pref);
    onChange(pref);
  };
  window.addEventListener("storage", onStorage);

  return () => {
    mql?.removeEventListener?.("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}
