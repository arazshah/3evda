import type { Locale } from "@/i18n/config";
import {
  block,
  href,
  instagramUrl,
  localized,
  pick,
  telHref,
  telegramUrl,
  whatsappUrl,
} from "@/lib/site/text";
import type { SiteData } from "@/lib/site/types";
import type { ReactNode } from "react";
import { WIDE } from "./Section";

export function SiteFooter({
  site,
  locale,
  labels,
  children,
}: {
  site: SiteData;
  locale: Locale;
  labels: Record<string, string>;
  /** Shown above the columns (the closing call to action on the home page). */
  children?: ReactNode;
}) {
  const s = site.settings;
  const brand = pick(locale, s.brand_name_fa, s.brand_name_en);
  const about = block(site, locale, "footer.about");
  const address = localized(locale, s, "address");
  const footerText = localized(locale, s, "footer_text");
  const socials = [
    { label: labels.instagram!, url: instagramUrl(s.instagram) },
    { label: labels.telegram!, url: telegramUrl(s.telegram) },
    { label: labels.whatsapp!, url: whatsappUrl(s.whatsapp) },
  ].filter((x) => x.url);

  return (
    <footer className="mt-[clamp(4rem,9vw,8.5rem)] bg-ink text-on-ink">
      {children}
      <div className={`${WIDE} grid gap-10 py-14 md:grid-cols-3`}>
        <div className="space-y-3">
          <p className="font-display text-3xl">{brand}</p>
          {about ? <p className="max-w-[40ch] text-on-ink/70">{about}</p> : null}
        </div>
        <ul className="space-y-1 text-on-ink/70">
          {s.phone ? (
            <li>
              <a className="link-line hover:text-on-ink" dir="ltr" href={telHref(s.phone)}>
                {s.phone}
              </a>
            </li>
          ) : null}
          {s.email ? (
            <li>
              <a className="link-line hover:text-on-ink" href={`mailto:${s.email}`}>
                {s.email}
              </a>
            </li>
          ) : null}
          {address ? <li>{address}</li> : null}
          {/* Not in the header menu: one more item there re-wraps the menu when the web font loads and shifts the page. */}
          <li>
            <a
              className="link-line inline-flex min-h-11 items-center hover:text-on-ink"
              href={href(locale, "/book")}
            >
              {labels.book}
            </a>
          </li>
        </ul>
        {socials.length ? (
          <ul className="flex flex-wrap gap-6 md:justify-end">
            {socials.map((x) => (
              <li key={x.label}>
                <a
                  className="link-line inline-flex min-h-11 items-center text-on-ink/70 hover:text-accent-on-ink"
                  href={x.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {x.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="border-t border-on-ink/20 px-4 py-5 text-center text-sm text-on-ink/60">
        {footerText || `© ${new Date().getFullYear()} ${brand}`}
      </p>
    </footer>
  );
}
