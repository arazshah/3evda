"use client";

import { useState } from "react";
import { parseTheme, THEME_COOKIE, type ThemeChoice } from "@/lib/theme";

const ORDER: ThemeChoice[] = ["system", "light", "dark"];
const YEAR = 60 * 60 * 24 * 365;

export type ThemeLabels = {
  /** Accessible name of the control, e.g. "Colour theme". */
  label: string;
  system: string;
  light: string;
  dark: string;
};

function current(): ThemeChoice {
  if (typeof document === "undefined") return "system";
  return parseTheme(document.documentElement.dataset.theme);
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // A cookie (not localStorage) so that the server can paint the right theme on the next page load.
  document.cookie = `${THEME_COOKIE}=${choice === "system" ? "" : choice}; Path=/; Max-Age=${choice === "system" ? 0 : YEAR}; SameSite=Lax${secure}`;
}

/** Cycles system, light, dark. The button names the choice in force; its icon is decorative. */
export function ThemeToggle({
  labels,
  tone = "default",
  className = "",
}: {
  labels: ThemeLabels;
  /** `onInk` for the always-dark surfaces, where the page text colour is not the right one. */
  tone?: "default" | "onInk";
  className?: string;
}) {
  // The server already wrote the choice on <html>; reading it on the first client render matches that markup.
  const [choice, setChoice] = useState<ThemeChoice>(current);

  const next = () => {
    const to = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!;
    apply(to);
    setChoice(to);
  };

  return (
    <button
      type="button"
      onClick={next}
      aria-label={`${labels.label}: ${labels[choice]}`}
      title={`${labels.label}: ${labels[choice]}`}
      className={`inline-flex size-11 items-center justify-center rounded-full border transition-colors ${
        tone === "onInk"
          ? "border-on-ink/40 text-on-ink hover:border-on-ink"
          : "border-line text-text hover:border-accent"
      } ${className}`.trim()}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        {choice === "dark" ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        ) : choice === "light" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3v18" />
            <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
          </>
        )}
      </svg>
    </button>
  );
}
