import type { BookingStatus } from "@/lib/api/queries";

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "در انتظار تأیید",
  confirmed: "تأییدشده",
  completed: "انجام‌شده",
  cancelled: "لغو",
};

export const STATUS_ORDER = Object.keys(STATUS_LABELS) as BookingStatus[];

/** `10:00` with Persian digits. */
export function clock(hhmm: string): string {
  return hhmm
    .slice(0, 5)
    .split(":")
    .map((part) =>
      new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2, useGrouping: false }).format(Number(part)),
    )
    .join(":");
}
