"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Media } from "@/lib/site/types";
import { Photo } from "./Photo";

export type ServiceRow = { id: number; title: string; body: string; media: Media | null };

/**
 * The services as a large index. With pointer hover the picture beside the list changes to the row's photo;
 * that is decoration only, every row already carries its full text.
 */
export function ServiceIndex({ rows, locale }: { rows: ServiceRow[]; locale: Locale }) {
  const [active, setActive] = useState(0);
  const withPhotos = rows.some((r) => r.media);
  const number = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { minimumIntegerDigits: 2 });
  return (
    <div className={withPhotos ? "grid gap-10 md:grid-cols-[1.3fr_1fr] md:gap-20" : ""}>
      <ul className="border-t border-line">
        {rows.map((r, i) => (
          <li
            key={r.id}
            onMouseEnter={() => setActive(i)}
            className="reveal group grid grid-cols-[3rem_1fr] gap-x-4 border-b border-line py-7 transition-colors"
          >
            <span className="pt-2 text-xs tracking-[0.2em] text-muted">{number.format(i + 1)}</span>
            <div>
              <h3
                className={`font-display text-[clamp(1.4rem,2.6vw,2.25rem)] leading-[1.1] transition-all duration-500 ${
                  i === active ? "ps-3 text-text" : "text-muted"
                }`}
              >
                {r.title}
              </h3>
              {r.body ? <p className="mt-3 max-w-[56ch] text-muted">{r.body}</p> : null}
            </div>
          </li>
        ))}
      </ul>
      {withPhotos ? (
        <div
          aria-hidden="true"
          className="relative hidden aspect-[4/5] overflow-hidden bg-elevated md:sticky md:top-24 md:block md:self-start"
        >
          {rows.map((r, i) =>
            r.media ? (
              <div
                key={r.id}
                className={`absolute inset-0 transition-opacity duration-700 ${i === active ? "opacity-100" : "opacity-0"}`}
              >
                <Photo
                  media={r.media}
                  locale={locale}
                  alt=""
                  sizes="35vw"
                  className="size-full object-cover"
                />
              </div>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}
