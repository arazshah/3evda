import type { Locale } from "@/i18n/config";
import { ButtonLink } from "@/components/ui/Button";
import { ThemeToggle, type ThemeLabels } from "@/components/ui/ThemeToggle";
import { Photo } from "./Photo";
import { block, href, localized, pick } from "@/lib/site/text";
import type { SiteData } from "@/lib/site/types";

export type NavLabels = {
  home: string;
  portfolio: string;
  blog: string;
  services: string;
  packages: string;
  about: string;
  contact: string;
  menu: string;
  menuOpen: string;
  switchLanguage: string;
  quote: string;
};

export function SiteHeader({
  site,
  locale,
  labels,
  themeLabels,
  currentPath,
  switchPath,
  overlay = false,
}: {
  site: SiteData;
  locale: Locale;
  labels: NavLabels;
  themeLabels: ThemeLabels;
  currentPath: string;
  /** The same page in the other language, when its address differs (e.g. a translated article). */
  switchPath?: string;
  /** Floats over the hero photo (home page): light text, no background. */
  overlay?: boolean;
}) {
  const brand = pick(locale, site.settings.brand_name_fa, site.settings.brand_name_en);
  const custom = site.collections.nav_link;
  const links = custom.length
    ? custom.map((l) => ({ label: localized(locale, l, "title"), to: l.link_url }))
    : [
        { label: labels.portfolio, to: "/portfolio" },
        { label: labels.services, to: "/services" },
        { label: labels.packages, to: "/packages" },
        { label: labels.blog, to: "/blog" },
        { label: labels.about, to: "/about" },
        { label: labels.contact, to: "/contact" },
      ];
  const otherLocale: Locale = locale === "fa" ? "en" : "fa";
  const isCurrent = (to: string) => currentPath === to || currentPath.startsWith(`${to}/`);
  const quote = block(site, locale, "home.cta_primary") || labels.quote;

  return (
    <header className={overlay ? "absolute inset-x-0 top-0 z-30 text-on-ink" : "border-b border-line"}>
      <div
        className={`mx-auto flex items-center justify-between gap-4 px-[clamp(1rem,4vw,3.5rem)] py-4 md:py-5 ${overlay ? "max-w-[96rem]" : "max-w-[84rem]"}`}
      >
        <a
          href={href(locale, "/")}
          className="font-display flex min-h-11 items-center gap-3 whitespace-nowrap text-xl md:text-2xl"
        >
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

        <nav aria-label={labels.menu} className="hidden md:block">
          <ul className="flex items-center gap-8">
            {links.map((l) => (
              <li key={l.to}>
                <a
                  href={href(locale, l.to)}
                  aria-current={isCurrent(l.to) ? "page" : undefined}
                  className={`link-line inline-flex min-h-11 items-center text-sm ${
                    overlay
                      ? "opacity-85 hover:opacity-100"
                      : "text-muted hover:text-text aria-[current=page]:text-text"
                  }`}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={href(otherLocale, switchPath ?? currentPath)}
            hrefLang={otherLocale}
            lang={otherLocale}
            className={`inline-flex min-h-11 items-center px-2 text-sm ${overlay ? "opacity-85 hover:opacity-100" : "text-muted hover:text-text"}`}
          >
            {labels.switchLanguage}
          </a>
          <ThemeToggle labels={themeLabels} tone={overlay ? "onInk" : "default"} />
          {/* A wrapper hides it on phones: `hidden` on the link itself loses to the button's own display class. */}
          <span className="hidden sm:inline-flex">
            <ButtonLink
              href={href(locale, "/quote")}
              variant={overlay ? "inverseOutline" : "primary"}
              className="rounded-full"
            >
              {quote}
            </ButtonLink>
          </span>
          {/* Small screens: the menu opens as a panel below the bar (native <details>, no script). */}
          <details className="group md:hidden">
            <summary
              aria-label={labels.menuOpen}
              className="inline-flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-current/40 [&::-webkit-details-marker]:hidden"
            >
              <span aria-hidden="true" className="grid gap-1.5">
                <span className="block h-px w-5 bg-current transition-transform group-open:translate-y-[3.5px] group-open:rotate-45" />
                <span className="block h-px w-5 bg-current transition-transform group-open:-translate-y-[3.5px] group-open:-rotate-45" />
              </span>
            </summary>
            <nav
              aria-label={labels.menu}
              className="absolute inset-x-0 top-full z-40 border-t border-line bg-bg px-[clamp(1rem,4vw,3.5rem)] pb-6 pt-2 text-text shadow-xl"
            >
              <ul>
                {links.map((l) => (
                  <li key={l.to} className="border-b border-line">
                    <a
                      href={href(locale, l.to)}
                      aria-current={isCurrent(l.to) ? "page" : undefined}
                      className="font-display flex min-h-14 items-center text-2xl aria-[current=page]:text-accent"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
              <ButtonLink href={href(locale, "/quote")} className="mt-5 w-full rounded-full">
                {quote}
              </ButtonLink>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
