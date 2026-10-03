import type { Locale } from "@/i18n/config";
import { href } from "@/lib/site/text";

export type PaginationLabels = { navigation: string; previous: string; next: string; pageOf: string };

/** Previous/next links between journal pages; `base` is the locale-less path, pages go in `?page=`. */
export function Pagination({
  page,
  pages,
  base,
  locale,
  labels,
}: {
  page: number;
  pages: number;
  base: string;
  locale: Locale;
  labels: PaginationLabels;
}) {
  if (pages <= 1) return null;
  const to = (n: number) => href(locale, n <= 1 ? base : `${base}?page=${n}`);
  const format = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US");
  const link = "inline-flex min-h-11 items-center rounded-brand border border-line px-5 hover:border-accent";
  return (
    <nav aria-label={labels.navigation} className="mt-10 flex flex-wrap items-center justify-between gap-4">
      {page > 1 ? (
        <a className={link} href={to(page - 1)} rel="prev">
          {labels.previous}
        </a>
      ) : (
        <span />
      )}
      <span className="text-muted" aria-current="page">
        {labels.pageOf.replace("{page}", format.format(page)).replace("{pages}", format.format(pages))}
      </span>
      {page < pages ? (
        <a className={link} href={to(page + 1)} rel="next">
          {labels.next}
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}
