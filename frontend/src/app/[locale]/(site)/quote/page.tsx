import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle, Section } from "@/components/site/Section";
import { QuoteForm, type QuoteLabels } from "@/components/site/QuoteForm";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { getQuoteOptions } from "@/lib/site/quote-api";
import { block } from "@/lib/site/text";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await localeOf(params);
  const [site, t] = await Promise.all([getSite(), getTranslations({ locale, namespace: "site.quote" })]);
  return pageMetadata(
    site,
    locale,
    "/quote",
    block(site, locale, "quote.title") || t("title"),
    block(site, locale, "quote.intro") || t("intro"),
  );
}

export default async function QuotePage({ params }: Props) {
  const locale = await localeOf(params);
  const [site, options, t] = await Promise.all([
    getSite(),
    getQuoteOptions(),
    getTranslations({ locale, namespace: "site.quote" }),
  ]);
  // Every label the form needs, translated here so the client component carries no message files.
  const keys = [
    "calculator",
    "service",
    "quantity",
    "extras",
    "options",
    "estimateLabel",
    "estimateRange",
    "estimateNote",
    "estimateUnavailable",
    "toman",
    "details",
    "detailsIntro",
    "name",
    "brand",
    "phone",
    "whatsapp",
    "telegram",
    "email",
    "message",
    "messageHint",
    "attachments",
    "attachmentsHint",
    "selectedFiles",
    "remove",
    "submit",
    "sending",
    "thanksTitle",
    "thanksBody",
    "errorGeneric",
    "errorRate",
    "errorTooLarge",
    "errorRequired",
    "errorQuantity",
    "errorFileCount",
    "errorFileSize",
    "errorFileType",
    "errorsTitle",
  ] as const; // fmt: skip
  const labels = Object.fromEntries(keys.map((key) => [key, t.raw(key) as string])) as QuoteLabels;

  return (
    <SitePage site={site} locale={locale} path="/quote">
      <PageTitle
        title={block(site, locale, "quote.title") || t("title")}
        intro={block(site, locale, "quote.intro") || t("intro")}
      />
      <Section>
        <QuoteForm options={options} locale={locale} labels={labels} />
      </Section>
    </SitePage>
  );
}
