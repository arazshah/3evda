import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProformaView } from "@/components/site/ProformaView";
import { Section } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { PROFORMA_LABEL_KEYS, type ProformaLabels } from "@/lib/site/proforma-labels";
import { getProforma } from "@/lib/site/proforma-api";

type Props = { params: Promise<{ locale: string; token: string }> };

/** A private link: never indexed, never cached, and it says nothing about the proforma in its metadata. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await localeOf(params);
  const [site, t] = await Promise.all([getSite(), getTranslations({ locale, namespace: "site.proforma" })]);
  return pageMetadata(site, locale, "/", t("title"), undefined, null, {
    noindex: true,
    languages: { [locale]: "/" },
  });
}

export default async function ProformaPage({ params }: Props) {
  const locale = await localeOf(params);
  const { token } = await params;
  const [site, proforma, t] = await Promise.all([
    getSite(),
    getProforma(token),
    getTranslations({ locale, namespace: "site.proforma" }),
  ]);
  if (!proforma) notFound();
  const labels = Object.fromEntries(
    PROFORMA_LABEL_KEYS.map((key) => [key, t.raw(key) as string]),
  ) as ProformaLabels;
  return (
    <SitePage site={site} locale={locale} path="/" switchPath="/">
      <Section>
        <ProformaView initial={proforma} token={token} locale={locale} labels={labels} />
      </Section>
    </SitePage>
  );
}
