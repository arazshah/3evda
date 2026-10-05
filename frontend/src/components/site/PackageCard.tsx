import type { Locale } from "@/i18n/config";
import { ButtonLink } from "@/components/ui/Button";
import { formatToman, href, localized } from "@/lib/site/text";
import type { Package } from "@/lib/site/types";

export type PackageLabels = {
  from: string;
  toman: string;
  inquiry: string;
  included: string;
  excluded: string;
  quote: string;
};

export function PackageCard({
  pkg,
  locale,
  labels,
}: {
  pkg: Package;
  locale: Locale;
  labels: PackageLabels;
}) {
  const badge = localized(locale, pkg, "badge");
  const unit = localized(locale, pkg, "price_unit");
  const summary = localized(locale, pkg, "summary");
  const price =
    pkg.price_mode === "inquiry" || pkg.price_amount === null
      ? labels.inquiry
      : `${pkg.price_mode === "from" ? `${labels.from} ` : ""}${formatToman(pkg.price_amount, locale)} ${labels.toman}`;

  const featured = pkg.is_featured;
  return (
    <article
      className={`flex h-full flex-col gap-5 p-6 ${featured ? "bg-ink text-on-ink" : "border-t border-text"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-3xl leading-tight">{localized(locale, pkg, "title")}</h3>
        {badge ? (
          <span
            className={`rounded-full border px-3 text-xs ${featured ? "border-accent-on-ink text-accent-on-ink" : "border-accent text-accent"}`}
          >
            {badge}
          </span>
        ) : null}
      </div>
      {summary ? <p className={featured ? "text-on-ink/75" : "text-muted"}>{summary}</p> : null}
      <p className={`font-display text-3xl ${featured ? "text-accent-on-ink" : "text-accent"}`}>
        {price}
        {unit ? (
          <span className={`ms-2 font-sans text-sm ${featured ? "text-on-ink/70" : "text-muted"}`}>
            {unit}
          </span>
        ) : null}
      </p>
      <ul className="flex-1 space-y-2 border-t border-current/20 pt-4">
        {pkg.features.map((f, i) => (
          <li
            key={i}
            className={`flex gap-2 ${f.included ? "" : featured ? "text-on-ink/60 line-through" : "text-muted line-through"}`}
          >
            <span
              aria-hidden
              className={f.included ? (featured ? "text-accent-on-ink" : "text-success") : "text-accent-2"}
            >
              {f.included ? "✓" : "✕"}
            </span>
            <span>
              <span className="sr-only">{f.included ? labels.included : labels.excluded}: </span>
              {localized(locale, f, "text")}
            </span>
          </li>
        ))}
      </ul>
      <ButtonLink
        href={href(locale, "/quote")}
        variant={featured ? "inverse" : "secondary"}
        className="rounded-full"
      >
        {labels.quote}
      </ButtonLink>
    </article>
  );
}
