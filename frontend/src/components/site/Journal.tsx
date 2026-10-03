import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { getArticles, getTaxonomy } from "@/lib/site/blog-api";
import { href, localized } from "@/lib/site/text";
import { ArticleCard } from "./ArticleCard";
import { Pagination } from "./Pagination";
import { PageTitle } from "./Section";

export async function journalLabels(locale: Locale) {
  const t = await getTranslations({ locale, namespace: "site.blog" });
  return {
    readingTime: t("readingTime", { minutes: "{minutes}" }),
    previous: t("previous"),
    next: t("next"),
    relatedArticles: t("relatedArticles"),
    relatedProjects: t("relatedProjects"),
    tags: t("tags"),
  };
}

/** The journal index: a title, the category/tag filters, a page of articles and the page links. */
export async function Journal({
  locale,
  title,
  intro,
  base,
  page,
  category,
  tag,
}: {
  locale: Locale;
  title: string;
  intro?: string;
  /** Locale-less path of this listing, e.g. `/blog` or `/blog/tag/coffee`. */
  base: string;
  page: number;
  category?: string;
  tag?: string;
}) {
  const t = await getTranslations({ locale, namespace: "site.blog" });
  const [articles, taxonomy] = await Promise.all([
    getArticles(locale, { category, tag, page }),
    getTaxonomy(locale),
  ]);
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors ${
      active
        ? "border-accent bg-accent text-bg"
        : "border-line text-muted hover:border-accent hover:text-text"
    }`;
  const groups = [
    { label: t("categories"), kind: "category", items: taxonomy.categories, active: category },
    { label: t("tags"), kind: "tag", items: taxonomy.tags, active: tag },
  ].filter((g) => g.items.length > 0);

  return (
    <>
      <PageTitle title={title} intro={intro} />
      <div className="mx-auto max-w-6xl px-4 pt-8">
        {groups.length ? (
          <nav aria-label={t("filters")} className="mb-8 flex flex-col gap-3">
            <a
              className={`${chip(!category && !tag)} self-start`}
              href={href(locale, "/blog")}
              aria-current={!category && !tag ? "page" : undefined}
            >
              {t("all")}
            </a>
            {groups.map((group) => (
              <div key={group.kind} className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted">{group.label}:</span>
                {group.items.map((item) => (
                  <a
                    key={item.slug}
                    className={chip(group.active === item.slug)}
                    href={href(locale, `/blog/${group.kind}/${encodeURIComponent(item.slug)}`)}
                    aria-current={group.active === item.slug ? "page" : undefined}
                  >
                    {localized(locale, item, "title")}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        ) : null}

        {articles.results.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.results.map((article, index) => (
              <li key={article.slug}>
                <ArticleCard
                  article={article}
                  locale={locale}
                  priority={index < 3}
                  labels={{ readingTime: t("readingTime", { minutes: "{minutes}" }) }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{t("empty")}</p>
        )}
        <Pagination
          page={articles.page}
          pages={articles.pages}
          base={base}
          locale={locale}
          labels={{
            navigation: t("pagination"),
            previous: t("prevPage"),
            next: t("nextPage"),
            pageOf: t("pageOf", { page: "{page}", pages: "{pages}" }),
          }}
        />
      </div>
    </>
  );
}
