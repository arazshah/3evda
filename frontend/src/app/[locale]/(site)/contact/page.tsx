import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageTitle, Section } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { block, instagramUrl, localized, telHref, telegramUrl, whatsappUrl } from "@/lib/site/text";

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
    "/contact",
    block(site, locale, "contact.title"),
    block(site, locale, "contact.intro"),
  );
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const [site, t] = await Promise.all([getSite(), getTranslations({ locale, namespace: "site" })]);
  const s = site.settings;
  const address = localized(locale, s, "address");
  const channels = [
    { label: t("footer.instagram"), url: instagramUrl(s.instagram) },
    { label: t("footer.telegram"), url: telegramUrl(s.telegram) },
    { label: t("footer.whatsapp"), url: whatsappUrl(s.whatsapp) },
  ].filter((c) => c.url);

  return (
    <SitePage site={site} locale={locale} path="/contact">
      <PageTitle
        title={block(site, locale, "contact.title")}
        intro={block(site, locale, "contact.intro") || t("contact.soon")}
      />
      <Section>
        <Card className="max-w-2xl space-y-4">
          <dl className="space-y-3">
            {s.phone ? (
              <div>
                <dt className="text-sm text-muted">{t("contact.phone")}</dt>
                <dd>
                  <a className="text-lg hover:text-accent" dir="ltr" href={telHref(s.phone)}>
                    {s.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {s.email ? (
              <div>
                <dt className="text-sm text-muted">{t("contact.email")}</dt>
                <dd>
                  <a className="text-lg hover:text-accent" href={`mailto:${s.email}`}>
                    {s.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {address ? (
              <div>
                <dt className="text-sm text-muted">{t("contact.address")}</dt>
                <dd className="text-lg">{address}</dd>
              </div>
            ) : null}
          </dl>
          {channels.length ? (
            <div className="flex flex-wrap gap-3" role="group" aria-label={t("contact.channels")}>
              {channels.map((c) => (
                <ButtonLink
                  key={c.label}
                  href={c.url}
                  variant="secondary"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {c.label}
                </ButtonLink>
              ))}
            </div>
          ) : null}
          {s.map_url ? (
            <a
              className="inline-flex min-h-11 items-center text-accent hover:underline"
              href={s.map_url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("contact.map")}
            </a>
          ) : null}
        </Card>
      </Section>
    </SitePage>
  );
}
