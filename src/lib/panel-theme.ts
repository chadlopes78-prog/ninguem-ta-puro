// Preferência visual do painel (independente do tema de cada checkout público).
export const PANEL_THEMES = ["system", "light", "dark"] as const;
export type PanelTheme = (typeof PANEL_THEMES)[number];
export const THEME_COOKIE = "ntp_theme";
export function isPanelTheme(v: unknown): v is PanelTheme {
  return typeof v === "string" && (PANEL_THEMES as readonly string[]).includes(v);
}
