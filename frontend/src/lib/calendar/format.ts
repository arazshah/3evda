/** A calendar day (`YYYY-MM-DD`) written out in the reader's calendar: Jalali for Persian, Gregorian for English. */
export function formatDay(
  iso: string,
  locale: "fa" | "en" = "fa",
  style: "long" | "full" | "medium" = "long",
): string {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    dateStyle: style,
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}
