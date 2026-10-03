"use client";

import { useMemo, useState } from "react";
import type { Locale } from "@/i18n/config";
import { Photo } from "./Photo";
import { href, localized } from "@/lib/site/text";
import type { Category, Project } from "@/lib/site/types";

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

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors ${
      active
        ? "border-accent bg-accent text-bg"
        : "border-line text-muted hover:border-accent hover:text-text"
    }`;

  return (
    <div>
      <div role="group" aria-label={labels.filter} className="mb-8 flex flex-wrap gap-2">
        <button
          type="button"
          className={chip(!category)}
          aria-pressed={!category}
          onClick={() => setCategory("")}
        >
          {labels.all}
        </button>
        {categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            className={chip(category === c.slug)}
            aria-pressed={category === c.slug}
            onClick={() => setCategory(category === c.slug ? "" : c.slug)}
          >
            {localized(locale, c, "title")}
          </button>
        ))}
        {styles.length > 1 ? <span className="mx-2 w-px self-stretch bg-line" aria-hidden /> : null}
        {styles.length > 1
          ? styles.map((s) => (
              <button
                key={s}
                type="button"
                className={chip(style === s)}
                aria-pressed={style === s}
                onClick={() => setStyle(style === s ? "" : s)}
              >
                {labels.styles[s] ?? s}
              </button>
            ))
          : null}
      </div>
      {shown.length ? (
        <ul className="flex flex-wrap gap-3 after:grow-[100] after:content-['']">
          {shown.map((p, i) => {
            const ratio = p.cover?.width && p.cover?.height ? p.cover.width / p.cover.height : 1.5;
            return (
              <li
                key={p.slug}
                style={{ flexGrow: ratio * 100, flexBasis: `${ratio * 14}rem` }}
                className="relative"
              >
                <a
                  href={href(locale, `/portfolio/${p.slug}`)}
                  className="group relative block overflow-hidden rounded-brand bg-elevated"
                >
                  {p.cover ? (
                    <Photo
                      media={p.cover}
                      locale={locale}
                      alt=""
                      priority={i < 2}
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="aspect-[3/2]" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/90 to-transparent p-4 pt-10 font-semibold">
                    {localized(locale, p, "title")}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted">{labels.noResults}</p>
      )}
    </div>
  );
}
