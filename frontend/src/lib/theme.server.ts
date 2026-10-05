import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE } from "./theme";

/**
 * The value for `<html data-theme>`: set only for an explicit choice, so that the system preference
 * (`prefers-color-scheme`) keeps applying when nothing was chosen. Read on the server so the first paint
 * already has the right colours, with no inline script and no flash.
 */
export async function themeAttribute(): Promise<"light" | "dark" | undefined> {
  const choice = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return choice === "system" ? undefined : choice;
}
