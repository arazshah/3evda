import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Journal } from "@/components/site/Journal";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { getTaxonomy } from "@/lib/site/blog-api";
import { switchPathFor } from "@/lib/site/blog";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { localized } from "@/lib/site/text";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

const pageNumber = (value?: string) => Math.max(1, Number.parseInt(value ?? "1", 10) || 1);

/** The tag, if it has a published article in this language (an empty listing is a 404). */
async function find(locale: "fa" | "en", slug: string) {
  const taxonomy = await getTaxonomy(locale);
  const item = taxonomy.tags.find((entry) => entry.slug === slug);
  if (!item) notFound();
  return item;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const locale = await localeOf(params);
  const { slug } = await params;
  const page = pageNumber((await searchParams).page);
  const [site, item] = await Promise.all([getSite(), find(locale, slug)]);
  const base = `/blog/tag/${encodeURIComponent(slug)}`;
  return pageMetadata(
    site,
    locale,
    page > 1 ? `${base}?page=${page}` : base,
    localized(locale, item, "title"),
  );
}

export default async function Page({ params, searchParams }: Props) {
  const locale = await localeOf(params);
  const { slug } = await params;
  const page = pageNumber((await searchParams).page);
  const otherLocale = locale === "fa" ? "en" : "fa";
  const [site, item, other] = await Promise.all([getSite(), find(locale, slug), getTaxonomy(otherLocale)]);
  const base = `/blog/tag/${encodeURIComponent(slug)}`;
  return (
    <SitePage site={site} locale={locale} path="/blog" switchPath={switchPathFor(base, other.tags, slug)}>
      <Journal locale={locale} title={localized(locale, item, "title")} base={base} page={page} tag={slug} />
    </SitePage>
  );
}
