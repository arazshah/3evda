import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BookingFlow } from "@/components/site/BookingFlow";
import { PageTitle, Section } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { getBookingOptions } from "@/lib/site/booking-api";
import { BOOKING_LABEL_KEYS, type BookingLabels } from "@/lib/site/booking-labels";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { block } from "@/lib/site/text";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string; package?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await localeOf(params);
  const [site, t] = await Promise.all([getSite(), getTranslations({ locale, namespace: "site.booking" })]);
  return pageMetadata(
    site,
    locale,
    "/book",
    block(site, locale, "book.title") || t("title"),
    block(site, locale, "book.intro") || t("intro"),
  );
}

export default async function BookPage({ params, searchParams }: Props) {
  const locale = await localeOf(params);
  const query = await searchParams;
  const [site, options, t] = await Promise.all([
    getSite(),
    getBookingOptions(),
    getTranslations({ locale, namespace: "site.booking" }),
  ]);
  const labels = Object.fromEntries(
    BOOKING_LABEL_KEYS.map((key) => [key, t.raw(key) as string]),
  ) as BookingLabels;
  const packageId = Number(query.package);
  return (
    <SitePage site={site} locale={locale} path="/book">
      <PageTitle
        title={block(site, locale, "book.title") || t("title")}
        intro={block(site, locale, "book.intro") || t("intro")}
      />
      <Section>
        {options.session_types.length === 0 ? (
          <p className="text-muted">{t("noDays")}</p>
        ) : (
          <BookingFlow
            options={options}
            locale={locale}
            labels={labels}
            initialType={query.type}
            packageId={Number.isInteger(packageId) && packageId > 0 ? packageId : undefined}
          />
        )}
      </Section>
    </SitePage>
  );
}
