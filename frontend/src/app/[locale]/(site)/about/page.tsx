import type { Metadata } from "next";
import { Photo } from "@/components/site/Photo";
import { PageTitle } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { block, blockMedia } from "@/lib/site/text";

export const dynamic = "force-dynamic";

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
    "/about",
    block(site, locale, "about.title"),
    block(site, locale, "about.body").slice(0, 160),
    blockMedia(site, "about.photo"),
  );
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const site = await getSite();
  const photo = blockMedia(site, "about.photo");
  return (
    <SitePage site={site} locale={locale} path="/about">
      <PageTitle title={block(site, locale, "about.title")} />
      <div className="mx-auto mt-8 grid max-w-6xl items-start gap-10 px-4 md:grid-cols-2">
        <p className="whitespace-pre-line text-lg leading-loose">{block(site, locale, "about.body")}</p>
        {photo ? (
          <Photo
            media={photo}
            locale={locale}
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="w-full rounded-brand object-cover"
          />
        ) : null}
      </div>
    </SitePage>
  );
}
