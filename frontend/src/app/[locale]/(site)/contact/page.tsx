import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { PageTitle, Section } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { block, href, instagramUrl, localized, telHref, telegramUrl, whatsappUrl } from "@/lib/site/text";

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
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr] md:gap-20">
          <dl className="min-w-0 border-t border-text">
            {s.phone ? (
              <div className="border-b border-line py-6">
                <dt className="eyebrow text-muted">{t("contact.phone")}</dt>
                <dd className="mt-2">
                  <a
                    className="font-display link-line text-[clamp(1.5rem,3vw,2.5rem)] [overflow-wrap:anywhere] hover:text-accent"
                    dir="ltr"
                    href={telHref(s.phone)}
                  >
                    {s.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {s.email ? (
              <div className="border-b border-line py-6">
                <dt className="eyebrow text-muted">{t("contact.email")}</dt>
                <dd className="mt-2">
                  <a
                    className="font-display link-line text-[clamp(1.25rem,2.4vw,2rem)] [overflow-wrap:anywhere] hover:text-accent"
                    href={`mailto:${s.email}`}
                  >
                    {s.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {address ? (
              <div className="border-b border-line py-6">
                <dt className="eyebrow text-muted">{t("contact.address")}</dt>
                <dd className="mt-2 text-xl [overflow-wrap:anywhere]">{address}</dd>
              </div>
            ) : null}
          </dl>
          <div className="space-y-8">
            <ButtonLink href={href(locale, "/quote")} className="rounded-full">
              {t("contact.quoteCta")}
            </ButtonLink>
            {channels.length ? (
              <div className="flex flex-wrap gap-x-6 gap-y-1" role="group" aria-label={t("contact.channels")}>
                {channels.map((c) => (
                  <a
                    key={c.label}
                    href={c.url}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="link-line inline-flex min-h-11 items-center text-lg"
                  >
                    {c.label}
                  </a>
                ))}
              </div>
            ) : null}
            {s.map_url ? (
              <a
                className="link-line inline-flex min-h-11 items-center text-accent"
                href={s.map_url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("contact.map")}
              </a>
            ) : null}
          </div>
        </div>
      </Section>
    </SitePage>
  );
}
