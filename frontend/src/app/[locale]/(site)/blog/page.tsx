import type { Metadata } from "next";
import { Journal } from "@/components/site/Journal";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { block } from "@/lib/site/text";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string }> };

const pageNumber = (value?: string) => Math.max(1, Number.parseInt(value ?? "1", 10) || 1);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const locale = await localeOf(params);
  const page = pageNumber((await searchParams).page);
  const site = await getSite();
  return pageMetadata(
    site,
    locale,
    page > 1 ? `/blog?page=${page}` : "/blog",
    block(site, locale, "blog.title"),
    block(site, locale, "blog.intro"),
  );
}

export default async function BlogPage({ params, searchParams }: Props) {
  const locale = await localeOf(params);
  const page = pageNumber((await searchParams).page);
  const site = await getSite();
  return (
    <SitePage site={site} locale={locale} path="/blog">
      <Journal
        locale={locale}
        title={block(site, locale, "blog.title")}
        intro={block(site, locale, "blog.intro")}
        base="/blog"
        page={page}
      />
    </SitePage>
  );
}
