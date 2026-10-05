"use client";

import { useMemo, useState } from "react";
import type { Locale } from "@/i18n/config";
import { Photo } from "./Photo";
import { vtName } from "@/lib/site/transitions";
import { href, localized } from "@/lib/site/text";
import type { Category, Project } from "@/lib/site/types";

/**
 * Tile sizes of the mosaic, repeated: every row of three adds up to six columns and two rows, so the wall
 * has no holes. On phones (two columns) the first tile of a row is full width.
 */
const SPANS = [
  "col-span-2 row-span-2 md:col-span-2",
  "col-span-1 row-span-2 md:col-span-2",
  "col-span-1 row-span-2 md:col-span-2",
  "col-span-2 row-span-2 md:col-span-3",
  "col-span-1 row-span-2 md:col-span-1",
  "col-span-1 row-span-2 md:col-span-2",
];

/** What each tile of `SPANS` really occupies (phones, then from `md`), so the browser picks a fitting rendition. */
const SIZES = [
  "(min-width: 768px) 33vw, 100vw",
  "(min-width: 768px) 33vw, 50vw",
  "(min-width: 768px) 33vw, 50vw",
  "(min-width: 768px) 50vw, 100vw",
  "(min-width: 768px) 17vw, 50vw",
  "(min-width: 768px) 33vw, 50vw",
];

type Labels = {
  filter: string;
  all: string;
  noResults: string;
  styles: Record<string, string>;
};

export function PortfolioGrid({
  projects,
  categories,
  locale,
  labels,
  initialCategory = "",
}: {
  projects: Project[];
  categories: Category[];
  locale: Locale;
  labels: Labels;
  initialCategory?: string;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [style, setStyle] = useState("");
  const styles = useMemo(() => [...new Set(projects.map((p) => p.style).filter(Boolean))], [projects]);
  const shown = projects.filter(
    (p) => (!category || p.category === category) && (!style || p.style === style),
  );

  // Filters are plain text with a hairline under the active one, in the manner of a gallery wall label.
  const tab = (active: boolean) =>
    `link-line inline-flex min-h-11 items-center text-sm transition-colors ${
      active ? "text-text after:!scale-x-100" : "text-muted hover:text-text"
    }`;

  return (
    <div>
      <div
        role="group"
        aria-label={labels.filter}
        className="mb-8 flex flex-wrap items-center gap-x-7 gap-y-1"
      >
        <button
          type="button"
          className={tab(!category)}
          aria-pressed={!category}
          onClick={() => setCategory("")}
        >
          {labels.all}
        </button>
        {categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            className={tab(category === c.slug)}
            aria-pressed={category === c.slug}
            onClick={() => setCategory(category === c.slug ? "" : c.slug)}
          >
            {localized(locale, c, "title")}
          </button>
        ))}
        {styles.length > 1 ? <span className="h-4 w-px bg-line" aria-hidden /> : null}
        {styles.length > 1
          ? styles.map((s) => (
              <button
                key={s}
                type="button"
                className={tab(style === s)}
                aria-pressed={style === s}
                onClick={() => setStyle(style === s ? "" : s)}
              >
                {labels.styles[s] ?? s}
              </button>
            ))
          : null}
      </div>
      {shown.length ? (
        <ul className="grid auto-rows-[clamp(9rem,26vw,15rem)] grid-cols-2 gap-1.5 md:auto-rows-[clamp(9rem,15vw,15rem)] md:grid-cols-6">
          {shown.map((p, i) => (
            <li key={p.slug} className={`relative overflow-hidden bg-elevated ${SPANS[i % SPANS.length]}`}>
              <a
                href={href(locale, `/portfolio/${p.slug}`)}
                className="group absolute inset-0 block"
                style={vtName(`project-${p.slug}`)}
              >
                {p.cover ? (
                  <Photo
                    media={p.cover}
                    locale={locale}
                    alt=""
                    priority={i < 2}
                    sizes={SIZES[i % SIZES.length]!}
                    className="size-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                  />
                ) : null}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-4 pt-14 text-on-ink opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
                  <span className="font-display text-xl leading-tight">{localized(locale, p, "title")}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">{labels.noResults}</p>
      )}
    </div>
  );
}
