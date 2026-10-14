// Preferência visual do painel (independente do tema de cada checkout público).
export const PANEL_THEMES = ["system", "light", "dark"] as const;
export type PanelTheme = (typeof PANEL_THEMES)[number];
export const THEME_COOKIE = "ntp_theme";
/** Idioma da conta (pt-MZ | pt-PT | pt-BR): define o atributo lang das páginas do painel. */
export const LOCALE_COOKIE = "ntp_locale";
export function isPanelTheme(v: unknown): v is PanelTheme {
  return typeof v === "string" && (PANEL_THEMES as readonly string[]).includes(v);
}
