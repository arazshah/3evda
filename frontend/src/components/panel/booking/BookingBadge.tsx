"use client";

import { useBookingSummary } from "@/lib/api/queries";
import { formatNumber } from "@/lib/format";

/** The number of upcoming bookings still waiting for an answer, next to the menu item. */
export function BookingBadge() {
  const summary = useBookingSummary();
  const count = summary.data?.pending ?? 0;
  if (count <= 0) return null;
  return (
    <span className="ms-2 inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-bg">
      <span aria-hidden="true">{formatNumber(count)}</span>
      <span className="sr-only">{`${formatNumber(count)} رزرو در انتظار تأیید`}</span>
    </span>
  );
}
