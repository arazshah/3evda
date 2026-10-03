import type { Locale } from "@/i18n/config";
import { Card } from "@/components/ui/Card";
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

  return (
    <Card className={`flex h-full flex-col gap-4 ${pkg.is_featured ? "border-accent" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xl font-extrabold">{localized(locale, pkg, "title")}</h3>
        {badge ? (
          <span className="rounded-full bg-accent px-3 text-sm font-semibold text-bg">{badge}</span>
        ) : null}
      </div>
      {summary ? <p className="text-muted">{summary}</p> : null}
      <p className="text-2xl font-extrabold text-accent">
        {price}
        {unit ? <span className="ms-2 text-sm font-normal text-muted">{unit}</span> : null}
      </p>
      <ul className="flex-1 space-y-2">
        {pkg.features.map((f, i) => (
          <li key={i} className={`flex gap-2 ${f.included ? "" : "text-muted line-through"}`}>
            <span aria-hidden className={f.included ? "text-success" : "text-accent-2"}>
              {f.included ? "✓" : "✕"}
            </span>
            <span>
              <span className="sr-only">{f.included ? labels.included : labels.excluded}: </span>
              {localized(locale, f, "text")}
            </span>
          </li>
        ))}
      </ul>
      <ButtonLink href={href(locale, "/quote")} variant={pkg.is_featured ? "primary" : "secondary"}>
        {labels.quote}
      </ButtonLink>
    </Card>
  );
}
