/** The visitor's choice. No cookie means "follow the system", which the stylesheet handles on its own. */
export type ThemeChoice = "light" | "dark" | "system";

export const THEME_COOKIE = "threevda_theme";

export function parseTheme(value: string | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}
