"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import { ButtonLink } from "@/components/ui/Button";
import type { Media } from "@/lib/site/types";
import { Photo } from "./Photo";

export type HeroSlide = { title: string; subtitle: string; media: Media | null };

export type HeroLabels = {
  /** Contains `{n}`; a string rather than a function so it can cross the server/client boundary. */
  slideTemplate: string;
  group: string;
  previous: string;
  next: string;
  pause: string;
  play: string;
};

const INTERVAL_MS = 7000;

/**
 * The home hero: a full-bleed slideshow. Slides cross-fade; the active photo drifts slowly (Ken Burns).
 * It advances by itself only when the visitor has not asked for reduced motion, and stops while the pointer or
 * keyboard focus is inside it or after the pause button was pressed (WCAG 2.2.2). Every slide stays reachable
 * through the numbered buttons and the arrows.
 */
export function HeroSlides({
  slides,
  locale,
  eyebrow,
  primary,
  secondary,
  labels,
}: {
  slides: HeroSlide[];
  locale: Locale;
  eyebrow: string;
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
  labels: HeroLabels;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [reduced, setReduced] = useState(true);
  const count = slides.length;
  const slide = slides[index] ?? slides[0]!;
  const number = (n: number) =>
    new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { minimumIntegerDigits: 2 }).format(n);

  useEffect(() => {
    // Without matchMedia (very old browsers) the slideshow simply does not advance by itself.
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (count < 2 || paused || engaged || reduced) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [index, count, paused, engaged, reduced]);

  const go = (to: number) => setIndex((to + count) % count);

  return (
    <section
      aria-label={labels.group}
      className="relative isolate flex min-h-[34rem] items-end overflow-hidden bg-ink text-on-ink md:min-h-[min(88vh,52rem)]"
      onPointerEnter={() => setEngaged(true)}
      onPointerLeave={() => setEngaged(false)}
      onFocus={() => setEngaged(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setEngaged(false);
      }}
    >
      {slides.map((s, i) =>
        s.media ? (
          <div
            key={s.media.id + i}
            aria-hidden="true"
            className={`absolute inset-0 -z-20 transition-opacity duration-[1400ms] ${i === index ? "opacity-100" : "opacity-0"}`}
          >
            <Photo
              media={s.media}
              locale={locale}
              alt=""
              priority={i === 0}
              sizes="100vw"
              className={`size-full object-cover ${i === index ? "hero-drift" : ""}`}
            />
          </div>
        ) : null,
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/85 via-ink/20 to-ink/50"
      />

      <div className="mx-auto w-full max-w-[96rem] px-[clamp(1rem,4vw,3.5rem)] pb-[clamp(1.75rem,4vw,3.5rem)] pt-40">
        <div key={index} className="hero-in grid gap-5">
          <p className="eyebrow text-accent-on-ink">{eyebrow}</p>
          <h1 className="font-display max-w-[22ch] text-[clamp(2.25rem,5.6vw,5rem)] leading-[1.15]">
            {slide.title}
          </h1>
          {slide.subtitle ? <p className="max-w-[52ch] text-lg text-on-ink/85">{slide.subtitle}</p> : null}
          <div className="flex flex-wrap gap-3 pt-2">
            <ButtonLink href={primary.href} variant="inverse" className="rounded-full">
              {primary.label}
            </ButtonLink>
            <ButtonLink href={secondary.href} variant="inverseOutline" className="rounded-full">
              {secondary.label}
            </ButtonLink>
          </div>
        </div>

        {count > 1 ? (
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-on-ink/25 pt-4">
            <div role="group" aria-label={labels.group} className="flex items-center">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={labels.slideTemplate.replace("{n}", String(i + 1))}
                  aria-pressed={i === index}
                  onClick={() => go(i)}
                  className="inline-flex h-11 min-w-11 items-center justify-center px-1"
                >
                  <span
                    aria-hidden="true"
                    className={`block h-px w-8 transition-all duration-500 ${i === index ? "w-14 bg-on-ink" : "bg-on-ink/40"}`}
                  />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="me-2 text-sm tabular-nums tracking-widest">
                {number(index + 1)} / {number(count)}
              </span>
              <button
                type="button"
                onClick={() => go(index - 1)}
                aria-label={labels.previous}
                className="inline-flex size-11 items-center justify-center rounded-full border border-on-ink/50 transition-colors hover:bg-on-ink hover:text-ink"
              >
                <span aria-hidden="true" className="rtl:rotate-180">
                  ←
                </span>
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                aria-label={labels.next}
                className="inline-flex size-11 items-center justify-center rounded-full border border-on-ink/50 transition-colors hover:bg-on-ink hover:text-ink"
              >
                <span aria-hidden="true" className="rtl:rotate-180">
                  →
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? labels.play : labels.pause}
                aria-pressed={paused}
                className="inline-flex size-11 items-center justify-center rounded-full border border-on-ink/50 transition-colors hover:bg-on-ink hover:text-ink"
              >
                <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
