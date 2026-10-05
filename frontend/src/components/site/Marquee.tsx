"use client";

import { useState } from "react";

/** Each row is made at least this many words long, so one cycle is wider than any normal screen. */
const MIN_WORDS = 16;

/**
 * A slow ticker of words (clients and services) under the hero. The words are listed once for assistive technology
 * and once more, hidden from it, so the loop has no seam; short lists are repeated inside each row so it always
 * spans the screen. Moves with transform only; it has a pause button (WCAG 2.2.2), pauses while hovered or focused,
 * and under reduced motion it stops and wraps into a normal row (see `.marquee` in globals.css).
 */
export function Marquee({
  items,
  label,
  pauseLabel,
  playLabel,
}: {
  items: string[];
  label: string;
  pauseLabel: string;
  playLabel: string;
}) {
  const [paused, setPaused] = useState(false);
  const words = items.filter(Boolean);
  if (words.length === 0) return null;
  const copies = Math.max(1, Math.ceil(MIN_WORDS / words.length));
  const row = (hidden: boolean) => (
    <ul className="marquee-row" aria-hidden={hidden || undefined} role={hidden ? "presentation" : undefined}>
      {Array.from({ length: copies }, (_, c) =>
        words.map((word, i) => (
          // Only the first copy of the visible row is read out; the repeats are decoration.
          <li
            key={`${hidden}-${c}-${i}`}
            className="marquee-item font-display"
            aria-hidden={hidden || c > 0 ? true : undefined}
          >
            {word}
            <span aria-hidden="true" className="marquee-dot">
              ✦
            </span>
          </li>
        )),
      )}
    </ul>
  );
  return (
    <section aria-label={label} className="marquee border-b border-line" data-paused={paused}>
      <div className="marquee-window">
        <div className="marquee-track">
          {row(false)}
          {row(true)}
        </div>
      </div>
      <button
        type="button"
        className="marquee-toggle"
        aria-pressed={paused}
        aria-label={paused ? playLabel : pauseLabel}
        onClick={() => setPaused((p) => !p)}
      >
        <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
      </button>
    </section>
  );
}
