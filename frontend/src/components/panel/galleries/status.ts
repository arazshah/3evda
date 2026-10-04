import type { DownloadLevel } from "@/lib/api/gallery-queries";

export const STATUS_LABELS: Record<string, string> = {
  draft: "پیش‌نویس",
  published: "منتشرشده",
  submitted: "نهایی‌شده",
  archived: "بایگانی",
  expired: "منقضی",
};

export const LEVEL_LABELS: Record<DownloadLevel, string> = {
  none: "فقط دیدن (بدون دانلود)",
  selected: "انتخاب‌ها — اندازه‌ی نمایش",
  all_web: "همه — اندازه‌ی نمایش",
  selected_original: "انتخاب‌ها — با اصل فایل",
  all_original: "همه — با اصل فایل",
};

export const LEVELS = Object.keys(LEVEL_LABELS) as DownloadLevel[];

const TEHRAN_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" });

/** The Tehran calendar day (`YYYY-MM-DD`) of a stored instant. */
export function tehranDay(iso: string): string {
  return TEHRAN_DAY.format(new Date(iso));
}

/** The end of a Tehran calendar day as an instant: a gallery lasts through the whole last day. */
export function endOfTehranDay(day: string): string {
  return `${day}T23:59:59+03:30`;
}
