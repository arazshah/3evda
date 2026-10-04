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

export function SiteFooter({
  site,
  locale,
  labels,
}: {
  site: SiteData;
  locale: Locale;
  labels: Record<string, string>;
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
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
        <div className="space-y-2">
          <p className="text-lg font-extrabold">{brand}</p>
          {about ? <p className="text-muted">{about}</p> : null}
        </div>
        <ul className="space-y-1 text-muted">
          {s.phone ? (
            <li>
              <a className="hover:text-text" dir="ltr" href={telHref(s.phone)}>
                {s.phone}
              </a>
            </li>
          ) : null}
          {s.email ? (
            <li>
              <a className="hover:text-text" href={`mailto:${s.email}`}>
                {s.email}
              </a>
            </li>
          ) : null}
          {address ? <li>{address}</li> : null}
          {/* Not in the header menu: one more item there re-wraps the menu when the web font loads and shifts the page. */}
          <li>
            <a className="inline-flex min-h-11 items-center hover:text-text" href={href(locale, "/book")}>
              {labels.book}
            </a>
          </li>
        </ul>
        {socials.length ? (
          <ul className="flex flex-wrap gap-4 md:justify-end">
            {socials.map((x) => (
              <li key={x.label}>
                <a
                  className="inline-flex min-h-11 items-center text-muted hover:text-accent"
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
      <p className="border-t border-line px-4 py-4 text-center text-sm text-muted">
        {footerText || `© ${new Date().getFullYear()} ${brand}`}
      </p>
    </footer>
  );
}
