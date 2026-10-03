import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PackageCard } from "@/components/site/PackageCard";
import { JsonLd } from "@/components/site/JsonLd";
import { HeroSlides } from "@/components/site/HeroSlides";
import { Photo } from "@/components/site/Photo";
import { ProjectCard } from "@/components/site/ProjectCard";
import { Section } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { featuredPackages, getPackageGroups, getPortfolio, getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { photographerLd } from "@/lib/site/seo";
import { block, blockMedia, href, localized, pick } from "@/lib/site/text";

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
    "/",
    "",
    pick(locale, site.settings.tagline_fa, site.settings.tagline_en),
  );
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const [site, portfolio, groups, t] = await Promise.all([
    getSite(),
    getPortfolio(),
    getPackageGroups(),
    getTranslations({ locale, namespace: "site" }),
  ]);
  const b = (key: string) => block(site, locale, key);
  const c = site.collections;
  const featured = portfolio.projects.filter((p) => p.is_featured).slice(0, 6);
  const packages = featuredPackages(groups).slice(0, 3);
  const slides = c.hero_slide;
  const fallbackHero = {
    title: b("home.intro_title"),
    subtitle: b("home.intro_body"),
    media: blockMedia(site, "home.intro_image"),
  };
  // A slide with empty text falls back to the intro text, so the page always has an h1.
  const heroSlides = slides.length
    ? slides.map((s) => ({
        title: localized(locale, s, "title") || fallbackHero.title,
        subtitle: localized(locale, s, "subtitle") || fallbackHero.subtitle,
        media: s.media ?? fallbackHero.media,
      }))
    : [fallbackHero];
  const brand = pick(locale, site.settings.brand_name_fa, site.settings.brand_name_en);
  const packageLabels = {
    from: t("packages.from"),
    toman: t("packages.toman"),
    inquiry: t("packages.inquiry"),
    included: t("packages.included"),
    excluded: t("packages.excluded"),
    quote: t("packages.quote"),
  };

  return (
    <SitePage site={site} locale={locale} path="/">
      <JsonLd data={photographerLd(site, locale)} />
      <HeroSlides
        slides={heroSlides}
        locale={locale}
        eyebrow={pick(locale, site.settings.tagline_fa, site.settings.tagline_en) || brand}
        primary={{ href: href(locale, "/contact"), label: b("home.cta_primary") || t("nav.quote") }}
        secondary={{ href: href(locale, "/portfolio"), label: b("home.cta_secondary") || t("nav.portfolio") }}
        slideLabelTemplate={t.raw("common.slide") as string}
        groupLabel={t("common.slides")}
      />

      {portfolio.categories.length ? (
        <Section id="categories" title={b("home.categories_title")}>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {portfolio.categories.map((cat) => (
              <li key={cat.slug}>
                <a
                  href={href(locale, `/portfolio?category=${cat.slug}`)}
                  className="group relative block overflow-hidden rounded-brand border border-line bg-surface"
                >
                  {cat.cover ? (
                    <Photo
                      media={cat.cover}
                      locale={locale}
                      alt=""
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="aspect-[4/3]" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/90 to-transparent p-4 pt-10 text-lg font-bold">
                    {localized(locale, cat, "title")}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {featured.length ? (
        <Section
          id="featured"
          title={b("home.featured_title")}
          action={
            <ButtonLink href={href(locale, "/portfolio")} variant="ghost">
              {t("common.viewAll")}
            </ButtonLink>
          }
        >
          <ul className="flex flex-wrap gap-3 after:grow-[100] after:content-['']">
            {featured.map((p) => (
              <li key={p.slug} className="contents">
                <ProjectCard project={p} locale={locale} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {c.service.length ? (
        <Section id="services" title={b("home.services_title")}>
          <ul className="grid gap-4 md:grid-cols-3">
            {c.service.map((s) => (
              <li key={s.id}>
                <Card className="h-full space-y-2">
                  <h3 className="text-lg font-bold">{localized(locale, s, "title")}</h3>
                  <p className="text-muted">
                    {localized(locale, s, "body") || localized(locale, s, "subtitle")}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {c.process_step.length ? (
        <Section id="process" title={b("home.process_title")}>
          <ol className="grid gap-4 md:grid-cols-4">
            {c.process_step.map((s, i) => (
              <li key={s.id}>
                <Card className="h-full space-y-2">
                  <span className="font-display text-3xl font-extrabold text-accent">
                    {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(i + 1)}
                  </span>
                  <h3 className="font-bold">{localized(locale, s, "title")}</h3>
                  <p className="text-muted">{localized(locale, s, "body")}</p>
                </Card>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {packages.length ? (
        <Section id="packages" title={b("home.packages_title")}>
          <ul className="grid gap-4 md:grid-cols-3">
            {packages.map((p) => (
              <li key={p.id}>
                <PackageCard pkg={p} locale={locale} labels={packageLabels} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {c.client.length ? (
        <Section id="clients" title={b("home.clients_title")}>
          <ul className="flex flex-wrap items-center gap-x-10 gap-y-6">
            {c.client.map((cl) => (
              <li key={cl.id}>
                {cl.media ? (
                  <Photo
                    media={cl.media}
                    locale={locale}
                    alt={localized(locale, cl, "title")}
                    sizes="160px"
                    className="h-12 w-auto opacity-80"
                  />
                ) : (
                  <span className="text-muted">{localized(locale, cl, "title")}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {c.testimonial.length ? (
        <Section id="testimonials" title={b("home.testimonials_title")}>
          <ul className="grid gap-4 md:grid-cols-2">
            {c.testimonial.map((q) => (
              <li key={q.id}>
                <Card className="h-full space-y-3">
                  <blockquote className="text-lg">{localized(locale, q, "body")}</blockquote>
                  <p className="text-sm text-muted">
                    {localized(locale, q, "title")}
                    {localized(locale, q, "subtitle") ? ` · ${localized(locale, q, "subtitle")}` : ""}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {c.behind_scenes.length ? (
        <Section id="behind" title={b("home.behind_title")}>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {c.behind_scenes.map((m) =>
              m.media ? (
                <li key={m.id}>
                  <Photo
                    media={m.media}
                    locale={locale}
                    alt={localized(locale, m, "title")}
                    sizes="(min-width: 768px) 25vw, 50vw"
                    className="aspect-square w-full rounded-brand object-cover"
                  />
                </li>
              ) : null,
            )}
          </ul>
        </Section>
      ) : null}

      {c.faq.length ? (
        <Section id="faq" title={b("home.faq_title")}>
          <div className="max-w-3xl space-y-2">
            {c.faq.map((f) => (
              <details key={f.id} className="group rounded-brand border border-line bg-surface p-4">
                <summary className="min-h-11 cursor-pointer font-semibold marker:text-accent">
                  {localized(locale, f, "title")}
                </summary>
                <p className="mt-2 text-muted">{localized(locale, f, "body")}</p>
              </details>
            ))}
          </div>
        </Section>
      ) : null}

      <Section id="cta">
        <Card className="space-y-4 border-accent bg-elevated p-10 text-center">
          <h2 className="font-display text-3xl font-extrabold">{b("home.cta_title")}</h2>
          <p className="mx-auto max-w-prose text-muted">{b("home.cta_body")}</p>
          <ButtonLink href={href(locale, "/contact")}>{b("home.cta_primary") || t("nav.quote")}</ButtonLink>
        </Card>
      </Section>
    </SitePage>
  );
}
