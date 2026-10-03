import type { Locale } from "@/i18n/config";
import { formatDate, href, localized } from "@/lib/site/text";
import type { BlogArticleDetail } from "@/lib/site/types";
import { ArticleCard, type ArticleLabels } from "./ArticleCard";
import { Photo } from "./Photo";
import { ProjectCard } from "./ProjectCard";
import { Section } from "./Section";

export type ArticleViewLabels = ArticleLabels & {
  previous: string;
  next: string;
  relatedArticles: string;
  relatedProjects: string;
  tags: string;
  preview?: string;
};

/** One article: header, cover, the server-sanitised body, tags, neighbours and related content. */
export function ArticleView({
  article,
  locale,
  labels,
}: {
  article: BlogArticleDetail;
  locale: Locale;
  labels: ArticleViewLabels;
}) {
  const readingTime = labels.readingTime.replace(
    "{minutes}",
    new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(article.reading_minutes),
  );
  const tagLink =
    "inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm hover:border-accent";
  return (
    <article className="pb-4">
      {labels.preview ? (
        <p role="status" className="bg-accent px-4 py-2 text-center font-semibold text-bg">
          {labels.preview}
        </p>
      ) : null}
      <header className="mx-auto max-w-3xl px-4 pt-14">
        {article.category ? (
          <a
            href={href(locale, `/blog/category/${encodeURIComponent(article.category.slug)}`)}
            className="inline-flex min-h-11 items-center text-accent hover:underline"
          >
            {localized(locale, article.category, "title")}
          </a>
        ) : null}
        <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-5xl">{article.title}</h1>
        <p className="mt-4 text-muted">
          <time dateTime={article.published_at ?? undefined}>{formatDate(article.published_at, locale)}</time>
          <span aria-hidden className="mx-3 inline-block size-1 rounded-full bg-muted align-middle" />
          {readingTime}
        </p>
      </header>

      {article.cover ? (
        <div className="mx-auto mt-8 max-w-5xl px-4">
          <Photo
            media={article.cover}
            locale={locale}
            priority
            sizes="(min-width: 1024px) 960px, 100vw"
            className="w-full rounded-brand object-cover"
          />
        </div>
      ) : null}

      {/* The HTML is produced and sanitised on the server from a validated document; see apps/blog/body.py. */}
      <div
        className="rich mx-auto mt-10 max-w-3xl px-4 text-lg leading-loose"
        dangerouslySetInnerHTML={{ __html: article.body_html }}
      />

      {article.tags.length ? (
        <div className="mx-auto mt-10 max-w-3xl px-4">
          <h2 className="sr-only">{labels.tags}</h2>
          <ul className="flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <li key={tag.slug}>
                <a className={tagLink} href={href(locale, `/blog/tag/${encodeURIComponent(tag.slug)}`)}>
                  {localized(locale, tag, "title")}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {article.previous || article.next ? (
        <nav
          className="mx-auto mt-12 flex max-w-3xl justify-between gap-4 px-4"
          aria-label={labels.relatedArticles}
        >
          {article.previous ? (
            <a
              className="inline-flex min-h-11 items-center text-accent hover:underline"
              href={href(locale, `/blog/${encodeURIComponent(article.previous)}`)}
              rel="prev"
            >
              ← {labels.previous}
            </a>
          ) : (
            <span />
          )}
          {article.next ? (
            <a
              className="inline-flex min-h-11 items-center text-accent hover:underline"
              href={href(locale, `/blog/${encodeURIComponent(article.next)}`)}
              rel="next"
            >
              {labels.next} →
            </a>
          ) : null}
        </nav>
      ) : null}

      {article.related_projects.length ? (
        <Section id="related-projects" title={labels.relatedProjects}>
          <ul className="flex flex-wrap gap-3 after:grow-[100] after:content-['']">
            {article.related_projects.map((project) => (
              <li key={project.slug} className="contents">
                <ProjectCard project={project} locale={locale} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {article.related_articles.length ? (
        <Section id="related-articles" title={labels.relatedArticles}>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {article.related_articles.map((related) => (
              <li key={related.slug}>
                <ArticleCard article={related} locale={locale} labels={labels} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </article>
  );
}
