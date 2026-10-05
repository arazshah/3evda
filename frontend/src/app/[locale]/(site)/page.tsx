import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { PackageCard } from "@/components/site/PackageCard";
import { JsonLd } from "@/components/site/JsonLd";
import { Marquee } from "@/components/site/Marquee";
import { HeroSlides } from "@/components/site/HeroSlides";
import { Photo } from "@/components/site/Photo";
import { ProjectReel } from "@/components/site/ProjectReel";
import { ServiceIndex } from "@/components/site/ServiceIndex";
import { Section, WIDE } from "@/components/site/Section";
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
  const featured = portfolio.projects.filter((p) => p.is_featured).slice(0, 8);
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

  const number = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { minimumIntegerDigits: 2 });
  const statement = slides.length ? fallbackHero.subtitle : "";
  const ctaHref = href(locale, "/quote");

  return (
    <SitePage
      site={site}
      locale={locale}
      path="/"
      overlay
      footerTop={
        <section id="cta" aria-labelledby="cta-title" className={`${WIDE} py-[clamp(4rem,9vw,8rem)]`}>
          <h2 id="cta-title" className="font-display text-[clamp(1.75rem,3.6vw,3.25rem)]">
            <a href={ctaHref} className="transition-colors duration-500 hover:text-accent-on-ink">
              {b("home.cta_title")}
            </a>
          </h2>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            {b("home.cta_body") ? <p className="max-w-prose text-on-ink/75">{b("home.cta_body")}</p> : null}
            <ButtonLink href={ctaHref} variant="inverse" className="rounded-full">
              {b("home.cta_primary") || t("nav.quote")}
            </ButtonLink>
          </div>
        </section>
      }
    >
      <JsonLd data={photographerLd(site, locale)} />
      <HeroSlides
        slides={heroSlides}
        locale={locale}
        eyebrow={pick(locale, site.settings.tagline_fa, site.settings.tagline_en) || brand}
        primary={{ href: ctaHref, label: b("home.cta_primary") || t("nav.quote") }}
        secondary={{ href: href(locale, "/portfolio"), label: b("home.cta_secondary") || t("nav.portfolio") }}
        labels={{
          slideTemplate: t.raw("common.slide") as string,
          group: t("common.slides"),
          previous: t("common.prevSlide"),
          next: t("common.nextSlide"),
          pause: t("common.pause"),
          play: t("common.play"),
        }}
      />

      <Marquee
        label={pick(locale, "مشتری‌ها و خدمات", "Clients and services")}
        items={[...c.client, ...c.service].map((x) => localized(locale, x, "title"))}
      />

      {statement ? (
        <section className={`${WIDE} pt-[clamp(4rem,9vw,8.5rem)]`}>
          <p className="reveal font-display max-w-[28ch] text-[clamp(1.5rem,2.8vw,2.5rem)] leading-[1.25]">
            {statement}
          </p>
        </section>
      ) : null}

      {portfolio.categories.length ? (
        <Section id="categories" title={b("home.categories_title")}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {portfolio.categories.map((cat) => (
              <li key={cat.slug} className="reveal">
                <a
                  href={href(locale, `/portfolio?category=${cat.slug}`)}
                  className="group relative block aspect-[4/5] overflow-hidden bg-elevated"
                >
                  {cat.cover ? (
                    <Photo
                      media={cat.cover}
                      locale={locale}
                      alt=""
                      sizes="(min-width: 1024px) 28vw, (min-width: 640px) 45vw, 100vw"
                      className="size-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                    />
                  ) : null}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent p-5 pt-16">
                    <span className="font-display text-3xl text-on-ink">
                      {localized(locale, cat, "title")}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {featured.length ? (
        <section id="featured" aria-labelledby="featured-title" className="pt-[clamp(4rem,9vw,8.5rem)]">
          <div className={`${WIDE} reveal mb-10 flex flex-wrap items-end justify-between gap-4 md:mb-14`}>
            <h2 id="featured-title" className="font-display text-[clamp(1.75rem,3.4vw,3rem)] leading-[1.05]">
              {b("home.featured_title")}
            </h2>
            <ButtonLink href={href(locale, "/portfolio")} variant="secondary" className="rounded-full">
              {t("common.viewAll")}
            </ButtonLink>
          </div>
          <ProjectReel projects={featured} locale={locale} label={b("home.featured_title")} />
        </section>
      ) : null}

      {c.service.length ? (
        <Section id="services" title={b("home.services_title")}>
          <ServiceIndex
            locale={locale}
            rows={c.service.map((s) => ({
              id: s.id,
              title: localized(locale, s, "title"),
              body: localized(locale, s, "body") || localized(locale, s, "subtitle"),
              media: s.media,
            }))}
          />
        </Section>
      ) : null}

      {c.process_step.length ? (
        <Section id="process" title={b("home.process_title")}>
          <ol className="grid gap-x-8 gap-y-10 md:grid-cols-4">
            {c.process_step.map((s, i) => (
              <li key={s.id} className="reveal border-t border-text pt-5">
                <span className="font-display text-5xl text-accent">{number.format(i + 1)}</span>
                <h3 className="font-display mt-4 text-2xl leading-tight">{localized(locale, s, "title")}</h3>
                <p className="mt-2 text-muted">{localized(locale, s, "body")}</p>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {packages.length ? (
        <Section id="packages" title={b("home.packages_title")}>
          <ul className="grid gap-4 md:grid-cols-3">
            {packages.map((p) => (
              <li key={p.id} className="reveal">
                <PackageCard pkg={p} locale={locale} labels={packageLabels} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {c.client.length ? (
        <Section id="clients" title={b("home.clients_title")}>
          <ul className="flex flex-wrap items-center gap-x-12 gap-y-8">
            {c.client.map((cl) => (
              <li key={cl.id}>
                {cl.media ? (
                  <Photo
                    media={cl.media}
                    locale={locale}
                    alt={localized(locale, cl, "title")}
                    sizes="160px"
                    className="h-12 w-auto opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0"
                  />
                ) : (
                  <span className="font-display text-2xl text-muted">{localized(locale, cl, "title")}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {c.testimonial.length ? (
        <Section id="testimonials" title={b("home.testimonials_title")}>
          <ul className="grid gap-x-12 gap-y-12 md:grid-cols-2">
            {c.testimonial.map((q) => (
              <li key={q.id} className="reveal border-t border-line pt-6">
                <blockquote className="font-display text-[clamp(1.2rem,1.9vw,1.6rem)] leading-[1.4]">
                  {localized(locale, q, "body")}
                </blockquote>
                <p className="mt-4 text-sm text-muted">
                  {localized(locale, q, "title")}
                  {localized(locale, q, "subtitle") ? ` · ${localized(locale, q, "subtitle")}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {c.behind_scenes.length ? (
        <Section id="behind" title={b("home.behind_title")}>
          <ul className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
            {c.behind_scenes.map((m) =>
              m.media ? (
                <li key={m.id} className="reveal overflow-hidden bg-elevated">
                  <Photo
                    media={m.media}
                    locale={locale}
                    alt={localized(locale, m, "title")}
                    sizes="(min-width: 768px) 25vw, 50vw"
                    className="aspect-square w-full object-cover transition-transform duration-[1200ms] ease-out hover:scale-105"
                  />
                </li>
              ) : null,
            )}
          </ul>
        </Section>
      ) : null}

      {c.faq.length ? (
        <Section id="faq" title={b("home.faq_title")}>
          <div className="max-w-3xl border-t border-line">
            {c.faq.map((f) => (
              <details key={f.id} className="group border-b border-line py-1">
                <summary className="font-display flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 text-xl [&::-webkit-details-marker]:hidden">
                  {localized(locale, f, "title")}
                  <span
                    aria-hidden="true"
                    className="text-2xl transition-transform duration-300 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="pb-4 text-muted">{localized(locale, f, "body")}</p>
              </details>
            ))}
          </div>
        </Section>
      ) : null}
    </SitePage>
  );
}
