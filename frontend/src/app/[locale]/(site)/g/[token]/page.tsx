import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GalleryClient } from "@/components/site/gallery/GalleryClient";
import { Section } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { getGallery } from "@/lib/site/gallery-api";
import { GALLERY_LABEL_KEYS, type GalleryLabels } from "@/lib/site/gallery-labels";
import { localeOf, pageMetadata } from "@/lib/site/page";

type Props = { params: Promise<{ locale: string; token: string }> };

/** A private link: never indexed, never cached, and nothing about the gallery in its metadata. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await localeOf(params);
  const [site, t] = await Promise.all([getSite(), getTranslations({ locale, namespace: "site.gallery" })]);
  return pageMetadata(site, locale, "/", t("title"), undefined, null, {
    noindex: true,
    languages: { [locale]: "/" },
  });
}

export default async function GalleryPage({ params }: Props) {
  const locale = await localeOf(params);
  const { token } = await params;
  const [site, gallery, t] = await Promise.all([
    getSite(),
    getGallery(token),
    getTranslations({ locale, namespace: "site.gallery" }),
  ]);
  if (!gallery) notFound();
  const labels = Object.fromEntries(
    GALLERY_LABEL_KEYS.map((key) => [key, t.raw(key) as string]),
  ) as GalleryLabels;
  return (
    <SitePage site={site} locale={locale} path="/" switchPath="/">
      <Section>
        <GalleryClient initial={gallery} linkToken={token} locale={locale} labels={labels} />
      </Section>
    </SitePage>
  );
}
