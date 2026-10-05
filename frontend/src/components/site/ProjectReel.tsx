import type { Locale } from "@/i18n/config";
import { Photo } from "./Photo";
import { GUTTER } from "./Section";
import { href, localized, pick } from "@/lib/site/text";
import type { Project } from "@/lib/site/types";

/**
 * Featured work as a horizontal reel: scroll-snapping, every second card dropped for rhythm.
 * A plain scroll container, so touch, trackpad and keyboard (it takes focus, then arrow keys) all work with no script.
 */
export function ProjectReel({
  projects,
  locale,
  label,
}: {
  projects: Project[];
  locale: Locale;
  label: string;
}) {
  const number = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { minimumIntegerDigits: 2 });
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`reel flex snap-x snap-mandatory scroll-px-[clamp(1rem,4vw,3.5rem)] gap-4 overflow-x-auto pb-6 ${GUTTER}`}
    >
      {projects.map((p, i) => (
        <a
          key={p.slug}
          href={href(locale, `/portfolio/${p.slug}`)}
          data-cursor={pick(locale, "مشاهده", "View")}
          className={`group block w-[clamp(16rem,30vw,28rem)] shrink-0 snap-start ${i % 2 ? "md:mt-14" : ""}`}
        >
          <div className="relative aspect-[4/5] overflow-hidden bg-elevated">
            {p.cover ? (
              <Photo
                media={p.cover}
                locale={locale}
                alt=""
                sizes="(min-width: 768px) 30vw, 70vw"
                className="size-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
              />
            ) : null}
            <span
              aria-hidden="true"
              className="absolute start-3 top-3 text-xs tracking-[0.2em] text-on-ink mix-blend-difference"
            >
              {number.format(i + 1)}
            </span>
          </div>
          <h3 className="font-display mt-4 text-2xl leading-tight">{localized(locale, p, "title")}</h3>
        </a>
      ))}
    </div>
  );
}
