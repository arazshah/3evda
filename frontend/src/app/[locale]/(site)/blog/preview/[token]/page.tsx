import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArticleView } from "@/components/site/ArticleView";
import { journalLabels } from "@/components/site/Journal";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { getPreview } from "@/lib/site/blog-api";
import { localeOf, pageMetadata } from "@/lib/site/page";

type Props = { params: Promise<{ locale: string; token: string }> };

/** A draft, seen through the owner's temporary link. Never indexed, never cached. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await localeOf(params);
  const { token } = await params;
  const [site, article] = await Promise.all([getSite(), getPreview(token)]);
  return pageMetadata(
    site,
    locale,
    `/blog/preview/${token}`,
    article.seo_title,
    article.seo_description,
    null,
    {
      noindex: true,
    },
  );
}

export default async function PreviewPage({ params }: Props) {
  const locale = await localeOf(params);
  const { token } = await params;
  const [site, article, labels] = await Promise.all([getSite(), getPreview(token), journalLabels(locale)]);
  const t = await getTranslations({ locale, namespace: "site.blog" });
  return (
    <SitePage site={site} locale={locale} path="/blog" switchPath="/blog">
      <ArticleView
        article={article}
        locale={locale}
        labels={{ ...labels, tags: t("tagsHeading"), preview: t("preview") }}
      />
    </SitePage>
  );
}
