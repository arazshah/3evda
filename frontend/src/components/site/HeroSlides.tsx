"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/config";
import { ButtonLink } from "@/components/ui/Button";
import type { Media } from "@/lib/site/types";
import { Photo } from "./Photo";

export type HeroSlide = { title: string; subtitle: string; media: Media | null };

/** The hero: every published slide is reachable through numbered buttons (no auto-rotation, so no motion to pause). */
export function HeroSlides({
  slides,
  locale,
  eyebrow,
  primary,
  secondary,
  slideLabelTemplate,
  groupLabel,
}: {
  slides: HeroSlide[];
  locale: Locale;
  eyebrow: string;
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
  /** Contains `{n}`; a string rather than a function so it can cross the server/client boundary. */
  slideLabelTemplate: string;
  groupLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const slide = slides[index] ?? slides[0]!;

  return (
    <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 md:grid-cols-2">
      <div className="space-y-6">
        <p className="text-sm tracking-widest text-accent">{eyebrow}</p>
        <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-6xl">{slide.title}</h1>
        <p className="max-w-prose text-lg text-muted">{slide.subtitle}</p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={primary.href}>{primary.label}</ButtonLink>
          <ButtonLink href={secondary.href} variant="secondary">
            {secondary.label}
          </ButtonLink>
        </div>
        {slides.length > 1 ? (
          <div role="group" aria-label={groupLabel} className="flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={slideLabelTemplate.replace("{n}", String(i + 1))}
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
                className="inline-flex size-11 items-center justify-center"
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-8 rounded-full ${i === index ? "bg-accent" : "bg-line"}`}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {slide.media ? (
        <Photo
          key={slide.media.id}
          media={slide.media}
          locale={locale}
          priority={index === 0}
          sizes="(min-width: 768px) 50vw, 100vw"
          className="aspect-[4/5] w-full rounded-brand object-cover"
        />
      ) : null}
    </div>
  );
}
