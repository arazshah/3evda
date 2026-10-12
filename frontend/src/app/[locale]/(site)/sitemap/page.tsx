import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle, Section } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { getArticles } from "@/lib/site/blog-api";
import { getPortfolio, getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { STATIC_PATHS } from "@/lib/site/seo";
import { href, localized } from "@/lib/site/text";

const NAV_KEY: Record<Exclude<(typeof STATIC_PATHS)[number], "/sitemap">, string> = {
  "/": "home",
  "/portfolio": "portfolio",
  "/services": "services",
  "/packages": "packages",
  "/about": "about",
  "/blog": "blog",
  "/quote": "quote",
  "/book": "book",
  "/contact": "contact",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await localeOf(params);
  const [site, t] = await Promise.all([getSite(), getTranslations({ locale, namespace: "site" })]);
  return pageMetadata(site, locale, "/sitemap", t("sitemap.title"), t("sitemap.intro"));
}

export default async function SitemapPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const [site, t, portfolio, articles] = await Promise.all([
    getSite(),
    getTranslations({ locale, namespace: "site" }),
    getPortfolio(),
    // A failed read of the journal must not hide the rest of the map.
    getArticles(locale).catch(() => null),
  ]);
  const link = "link-line inline-flex min-h-11 items-center hover:text-accent";

  return (
    <SitePage site={site} locale={locale} path="/sitemap">
      <PageTitle title={t("sitemap.title")} intro={t("sitemap.intro")} />
      <Section>
        <div className="grid gap-12 md:grid-cols-3">
          <nav aria-labelledby="map-pages">
            <h2 id="map-pages" className="eyebrow text-muted">
              {t("sitemap.pages")}
            </h2>
            <ul className="mt-3 border-t border-text">
              {STATIC_PATHS.map((path) => (
                <li key={path} className="border-b border-line">
                  <a className={link} href={href(locale, path)}>
                    {path === "/sitemap" ? t("sitemap.title") : t(`nav.${NAV_KEY[path]}`)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {portfolio.projects.length ? (
            <nav aria-labelledby="map-projects">
              <h2 id="map-projects" className="eyebrow text-muted">
                {t("sitemap.projects")}
              </h2>
              <ul className="mt-3 border-t border-text">
                {portfolio.projects.map((project) => (
                  <li key={project.slug} className="border-b border-line">
                    <a className={link} href={href(locale, `/portfolio/${encodeURIComponent(project.slug)}`)}>
                      {localized(locale, project, "title")}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {articles?.results.length ? (
            <nav aria-labelledby="map-articles">
              <h2 id="map-articles" className="eyebrow text-muted">
                {t("sitemap.articles")}
              </h2>
              <ul className="mt-3 border-t border-text">
                {articles.results.map((article) => (
                  <li key={article.slug} className="border-b border-line">
                    <a className={link} href={href(locale, `/blog/${encodeURIComponent(article.slug)}`)}>
                      {article.title}
                    </a>
                  </li>
                ))}
                {articles.pages > 1 ? (
                  <li className="border-b border-line">
                    <a className={`${link} text-accent`} href={href(locale, "/blog")}>
                      {t("sitemap.allArticles")}
                    </a>
                  </li>
                ) : null}
              </ul>
            </nav>
          ) : null}
        </div>
      </Section>
    </SitePage>
  );
}
