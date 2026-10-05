import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PackageCard } from "@/components/site/PackageCard";
import { PageTitle, Section, WIDE } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { getPackageGroups, getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { block, localized } from "@/lib/site/text";

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
    "/packages",
    block(site, locale, "packages.title"),
    block(site, locale, "packages.intro"),
  );
}

export default async function PackagesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const [site, groups, t] = await Promise.all([
    getSite(),
    getPackageGroups(),
    getTranslations({ locale, namespace: "site" }),
  ]);
  const labels = {
    from: t("packages.from"),
    toman: t("packages.toman"),
    inquiry: t("packages.inquiry"),
    included: t("packages.included"),
    excluded: t("packages.excluded"),
    quote: t("packages.quote"),
  };
  return (
    <SitePage site={site} locale={locale} path="/packages">
      <PageTitle
        title={block(site, locale, "packages.title")}
        intro={block(site, locale, "packages.intro")}
      />
      {groups.length ? (
        groups.map((g) => (
          <Section
            key={g.id}
            id={`group-${g.id}`}
            title={localized(locale, g, "title")}
            intro={localized(locale, g, "description")}
          >
            <ul className="grid gap-x-6 gap-y-10 md:grid-cols-3">
              {g.packages.map((p) => (
                <li key={p.id} className="reveal">
                  <PackageCard pkg={p} locale={locale} labels={labels} />
                </li>
              ))}
            </ul>
          </Section>
        ))
      ) : (
        <p className={`${WIDE} pt-10 text-muted`}>{t("common.empty")}</p>
      )}
    </SitePage>
  );
}
