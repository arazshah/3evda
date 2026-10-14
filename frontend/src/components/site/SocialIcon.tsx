import type { ReactNode } from "react";

export type SocialKind = "instagram" | "telegram" | "whatsapp";

// Stroke glyphs on a 24×24 grid, drawn here so no icon package or third-party request is needed.
const GLYPHS: Record<SocialKind, ReactNode> = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" />
    </>
  ),
  telegram: (
    <>
      <path d="M21.5 4.5 2.8 11.7l5.7 2.1 2 5.7 3.1-3.6 4.7 3.4z" />
      <path d="M8.5 13.8 21.5 4.5" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M3.5 20.5 5 16A8.5 8.5 0 1 1 8 19z" />
      <path d="M9.2 8.6c-.3 2.4 3.4 6.2 6 6l1.1-1.4-2.1-1-.9.8c-.9-.4-1.9-1.4-2.3-2.3l.8-.9-1-2.1z" />
    </>
  ),
};

/** A social network's glyph; decorative (the link around it carries the accessible name). */
export function SocialIcon({ kind, size = 22 }: { kind: SocialKind; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[kind]}
    </svg>
  );
}
