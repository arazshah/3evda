import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
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
  return (
    <SitePage site={site} locale={locale} path="/services">
      <PageTitle
        title={block(site, locale, "services.title")}
        intro={block(site, locale, "services.intro")}
      />
      <Section>
        <ul className="grid gap-4 md:grid-cols-2">
          {services.map((s) => (
            <li key={s.id}>
              <Card className="flex h-full flex-col gap-3">
                {s.media ? (
                  <Photo
                    media={s.media}
                    locale={locale}
                    alt=""
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="aspect-[16/9] w-full rounded-brand object-cover"
                  />
                ) : null}
                <h2 className="text-xl font-bold">{localized(locale, s, "title")}</h2>
                {localized(locale, s, "subtitle") ? (
                  <p className="text-accent">{localized(locale, s, "subtitle")}</p>
                ) : null}
                <p className="whitespace-pre-line text-muted">{localized(locale, s, "body")}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Section>
      {steps.length ? (
        <Section title={block(site, locale, "home.process_title")}>
          <ol className="grid gap-4 md:grid-cols-4">
            {steps.map((s, i) => (
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
    </SitePage>
  );
}
