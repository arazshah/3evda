import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle, WIDE } from "@/components/site/Section";
import { PortfolioGrid } from "@/components/site/PortfolioGrid";
import { SitePage } from "@/components/site/SitePage";
import { getPortfolio, getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { block } from "@/lib/site/text";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await localeOf(params);
  const site = await getSite();
  return pageMetadata(
    site,
    locale,
    "/portfolio",
    block(site, locale, "portfolio.title"),
    block(site, locale, "portfolio.intro"),
  );
}

export default async function PortfolioPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const locale = await localeOf(params);
  const { category } = await searchParams;
  const [site, portfolio, t] = await Promise.all([
    getSite(),
    getPortfolio(),
    getTranslations({ locale, namespace: "site" }),
  ]);
  return (
    <SitePage site={site} locale={locale} path="/portfolio">
      <PageTitle
        title={block(site, locale, "portfolio.title")}
        intro={block(site, locale, "portfolio.intro")}
      />
      <div className={`${WIDE} pt-10`}>
        <PortfolioGrid
          projects={portfolio.projects}
          categories={portfolio.categories}
          locale={locale}
          initialCategory={typeof category === "string" ? category : ""}
          labels={{
            filter: t("portfolio.filterLabel"),
            all: t("portfolio.all"),
            noResults: t("portfolio.noResults"),
            styles: {
              low_key: t("portfolio.styles.low_key"),
              high_key: t("portfolio.styles.high_key"),
              natural: t("portfolio.styles.natural"),
            },
          }}
        />
      </div>
    </SitePage>
  );
}
