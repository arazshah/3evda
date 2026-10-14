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
import { SocialIcon, type SocialKind } from "./SocialIcon";

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
  const socials: { kind: SocialKind; label: string; url: string }[] = [
    { kind: "instagram" as const, label: labels.instagram!, url: instagramUrl(s.instagram) },
    { kind: "telegram" as const, label: labels.telegram!, url: telegramUrl(s.telegram) },
    { kind: "whatsapp" as const, label: labels.whatsapp!, url: whatsappUrl(s.whatsapp) },
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
          <li>
            <a
              className="link-line inline-flex min-h-11 items-center hover:text-on-ink"
              href={href(locale, "/sitemap")}
            >
              {labels.sitemap}
            </a>
          </li>
        </ul>
        {socials.length ? (
          <ul className="flex flex-wrap gap-3 md:justify-end">
            {socials.map((x) => (
              <li key={x.kind}>
                <a
                  className="inline-flex size-11 items-center justify-center rounded-full border border-on-ink/30 text-on-ink/80 transition-colors hover:border-accent-on-ink hover:text-accent-on-ink"
                  href={x.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  aria-label={x.label}
                  title={x.label}
                >
                  <SocialIcon kind={x.kind} />
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
