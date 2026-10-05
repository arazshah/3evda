import type { Metadata } from "next";
import { Photo } from "@/components/site/Photo";
import { PageTitle, Section } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { block, localized } from "@/lib/site/text";

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
    "/services",
    block(site, locale, "services.title"),
    block(site, locale, "services.intro"),
  );
}

export default async function ServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const site = await getSite();
  const services = site.collections.service;
  const steps = site.collections.process_step;
  const number = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { minimumIntegerDigits: 2 });
  return (
    <SitePage site={site} locale={locale} path="/services">
      <PageTitle
        title={block(site, locale, "services.title")}
        intro={block(site, locale, "services.intro")}
      />
      <Section>
        <ul className="border-t border-text">
          {services.map((s, i) => (
            <li
              key={s.id}
              className="reveal grid gap-6 border-b border-line py-10 md:grid-cols-[4rem_1fr_1fr] md:gap-10 md:py-14"
            >
              <span className="eyebrow pt-3 text-muted">{number.format(i + 1)}</span>
              <div>
                <h2 className="font-display text-[clamp(1.75rem,3.4vw,3rem)] leading-[1.05]">
                  {localized(locale, s, "title")}
                </h2>
                {localized(locale, s, "subtitle") ? (
                  <p className="mt-3 text-accent">{localized(locale, s, "subtitle")}</p>
                ) : null}
                <p className="mt-5 max-w-[52ch] whitespace-pre-line text-muted">
                  {localized(locale, s, "body")}
                </p>
              </div>
              {s.media ? (
                <Photo
                  media={s.media}
                  locale={locale}
                  alt=""
                  sizes="(min-width: 768px) 40vw, 100vw"
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      </Section>
      {steps.length ? (
        <Section title={block(site, locale, "home.process_title")}>
          <ol className="grid gap-x-8 gap-y-10 md:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.id} className="reveal border-t border-text pt-5">
                <span className="font-display text-5xl text-accent">{number.format(i + 1)}</span>
                <h3 className="font-display mt-4 text-2xl leading-tight">{localized(locale, s, "title")}</h3>
                <p className="mt-2 text-muted">{localized(locale, s, "body")}</p>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
    </SitePage>
  );
}
