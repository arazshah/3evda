import type { Locale } from "@/i18n/config";
import { formatDate, href, localized } from "@/lib/site/text";
import type { BlogArticle } from "@/lib/site/types";
import { Photo } from "./Photo";

export type ArticleLabels = { readingTime: string };

export function ArticleCard({
  article,
  locale,
  labels,
  priority = false,
}: {
  article: BlogArticle;
  locale: Locale;
  /** `readingTime` contains `{minutes}`. */
  labels: ArticleLabels;
  priority?: boolean;
}) {
  const readingTime = labels.readingTime.replace(
    "{minutes}",
    new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(article.reading_minutes),
  );
  return (
    <article className="group relative flex h-full flex-col">
      {article.cover ? (
        <div className="overflow-hidden bg-elevated">
          <Photo
            media={article.cover}
            locale={locale}
            alt=""
            priority={priority}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="aspect-[3/2] w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 pt-4">
        {article.category ? (
          <a
            href={href(locale, `/blog/category/${encodeURIComponent(article.category.slug)}`)}
            className="eyebrow relative z-10 inline-flex min-h-6 items-center text-accent hover:underline"
          >
            {localized(locale, article.category, "title")}
          </a>
        ) : null}
        <h2 className="font-display text-2xl leading-snug">
          <a
            href={href(locale, `/blog/${encodeURIComponent(article.slug)}`)}
            className="after:absolute after:inset-0 hover:text-accent"
          >
            {article.title}
          </a>
        </h2>
        {article.summary ? <p className="line-clamp-3 text-muted">{article.summary}</p> : null}
        <p className="mt-auto pt-2 text-sm text-muted">
          <time dateTime={article.published_at ?? undefined}>{formatDate(article.published_at, locale)}</time>
          <span aria-hidden className="mx-3 inline-block size-1 rounded-full bg-muted align-middle" />
          {readingTime}
        </p>
      </div>
    </article>
  );
}
