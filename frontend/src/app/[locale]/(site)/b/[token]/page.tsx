import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BookingStatus } from "@/components/site/BookingStatus";
import { Section } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { getBooking } from "@/lib/site/booking-api";
import { BOOKING_LABEL_KEYS, type BookingLabels } from "@/lib/site/booking-labels";
import { localeOf, pageMetadata } from "@/lib/site/page";

type Props = { params: Promise<{ locale: string; token: string }> };

/** A private link: never indexed, never cached, and nothing about the booking in its metadata. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await localeOf(params);
  const [site, t] = await Promise.all([getSite(), getTranslations({ locale, namespace: "site.booking" })]);
  return pageMetadata(site, locale, "/", t("statusTitle"), undefined, null, {
    noindex: true,
    languages: { [locale]: "/" },
  });
}

export default async function BookingPage({ params }: Props) {
  const locale = await localeOf(params);
  const { token } = await params;
  const [site, booking, t] = await Promise.all([
    getSite(),
    getBooking(token),
    getTranslations({ locale, namespace: "site.booking" }),
  ]);
  if (!booking) notFound();
  const labels = Object.fromEntries(
    BOOKING_LABEL_KEYS.map((key) => [key, t.raw(key) as string]),
  ) as BookingLabels;
  return (
    <SitePage site={site} locale={locale} path="/" switchPath="/">
      <Section>
        <BookingStatus initial={booking} token={token} locale={locale} labels={labels} />
      </Section>
    </SitePage>
  );
}
