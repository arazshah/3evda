import type { Locale } from "@/i18n/config";
import { ButtonLink } from "@/components/ui/Button";
import { Photo } from "./Photo";
import { block, href, localized, pick } from "@/lib/site/text";
import type { SiteData } from "@/lib/site/types";

export type NavLabels = {
  home: string;
  portfolio: string;
  services: string;
  packages: string;
  about: string;
  contact: string;
  menu: string;
  switchLanguage: string;
  quote: string;
};

export function SiteHeader({
  site,
  locale,
  labels,
  currentPath,
}: {
  site: SiteData;
  locale: Locale;
  labels: NavLabels;
  currentPath: string;
}) {
  const brand = pick(locale, site.settings.brand_name_fa, site.settings.brand_name_en);
  const custom = site.collections.nav_link;
  const links = custom.length
    ? custom.map((l) => ({ label: localized(locale, l, "title"), to: l.link_url }))
    : [
        { label: labels.portfolio, to: "/portfolio" },
        { label: labels.services, to: "/services" },
        { label: labels.packages, to: "/packages" },
        { label: labels.about, to: "/about" },
        { label: labels.contact, to: "/contact" },
      ];
  const otherLocale: Locale = locale === "fa" ? "en" : "fa";

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <a href={href(locale, "/")} className="flex min-h-11 items-center gap-3 text-xl font-extrabold">
          {site.settings.logo ? (
            <Photo
              media={site.settings.logo}
              locale={locale}
              sizes="160px"
              alt={brand}
              priority
              className="h-9 w-auto"
            />
          ) : (
            <span>{brand}</span>
          )}
        </a>
        <nav aria-label={labels.menu} className="order-3 w-full md:order-none md:w-auto">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {links.map((l) => (
              <li key={l.to}>
                <a
                  href={href(locale, l.to)}
                  aria-current={currentPath === l.to ? "page" : undefined}
                  className="inline-flex min-h-11 items-center text-muted hover:text-text aria-[current=page]:text-accent"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={href(otherLocale, currentPath)}
            hrefLang={otherLocale}
            lang={otherLocale}
            className="inline-flex min-h-11 items-center px-2 text-muted hover:text-text"
          >
            {labels.switchLanguage}
          </a>
          <ButtonLink href={href(locale, "/contact")} className="hidden sm:inline-flex">
            {block(site, locale, "home.cta_primary") || labels.quote}
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
