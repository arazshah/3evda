import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/site/JsonLd";
import { ArticleView } from "@/components/site/ArticleView";
import { journalLabels } from "@/components/site/Journal";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { getArticle } from "@/lib/site/blog-api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { articleLd, breadcrumbLd } from "@/lib/site/seo";

type Props = { params: Promise<{ locale: string; slug: string }> };

const other = (locale: "fa" | "en") => (locale === "fa" ? "en" : "fa");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await localeOf(params);
  const { slug } = await params;
  const [site, article] = await Promise.all([getSite(), getArticle(locale, slug)]);
  const path = `/blog/${encodeURIComponent(article.slug)}`;
  const languages: Partial<Record<"fa" | "en", string>> = { [locale]: path };
  for (const alt of article.alternates) {
    if (alt.language === "fa" || alt.language === "en")
      languages[alt.language] = `/blog/${encodeURIComponent(alt.slug)}`;
  }
  return pageMetadata(site, locale, path, article.seo_title, article.seo_description, article.og_image, {
    languages,
    type: "article",
    publishedTime: article.published_at,
  });
}

export default async function ArticlePage({ params }: Props) {
  const locale = await localeOf(params);
  const { slug } = await params;
  const [site, article, labels] = await Promise.all([
    getSite(),
    getArticle(locale, slug),
    journalLabels(locale),
  ]);
  const translation = article.alternates.find((a) => a.language === other(locale));
  const t = await getTranslations({ locale, namespace: "site.blog" });
  const nav = await getTranslations({ locale, namespace: "site.nav" });
  return (
    <SitePage
      site={site}
      locale={locale}
      path="/blog"
      // The language switch goes to the same article in the other language; without one, to that language's journal.
      switchPath={translation ? `/blog/${encodeURIComponent(translation.slug)}` : "/blog"}
    >
      <JsonLd
        data={[
          articleLd(site, locale, article),
          breadcrumbLd(locale, [
            { name: nav("blog"), path: "/blog" },
            { name: article.title, path: `/blog/${encodeURIComponent(article.slug)}` },
          ]),
        ]}
      />
      <ArticleView article={article} locale={locale} labels={{ ...labels, tags: t("tagsHeading") }} />
    </SitePage>
  );
}
