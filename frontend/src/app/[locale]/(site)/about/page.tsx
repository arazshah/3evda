import type { Metadata } from "next";
import { Photo } from "@/components/site/Photo";
import { PageTitle, WIDE } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { block, blockMedia } from "@/lib/site/text";

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
      <div
        className={`${WIDE} grid items-start gap-10 pt-[clamp(2.5rem,6vw,5rem)] md:grid-cols-[1fr_1.1fr] md:gap-20`}
      >
        {photo ? (
          <Photo
            media={photo}
            locale={locale}
            priority
            sizes="(min-width: 768px) 45vw, 100vw"
            className="w-full object-cover md:sticky md:top-8"
          />
        ) : null}
        <p
          className={`reveal max-w-[58ch] whitespace-pre-line text-lg leading-[2] ${photo ? "" : "md:col-span-2"}`}
        >
          {block(site, locale, "about.body")}
        </p>
      </div>
    </SitePage>
  );
}
