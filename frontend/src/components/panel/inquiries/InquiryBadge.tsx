"use client";

import { useInquirySummary } from "@/lib/api/queries";
import { formatNumber } from "@/lib/format";

/** The number of unopened enquiries, shown next to the menu item (nothing when there are none). */
export function InquiryBadge() {
  const summary = useInquirySummary();
  const count = summary.data?.new ?? 0;
  if (count <= 0) return null;
  return (
    <span className="ms-2 inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-bg">
      <span aria-hidden="true">{formatNumber(count)}</span>
      <span className="sr-only">{`${formatNumber(count)} استعلام خوانده‌نشده`}</span>
    </span>
  );
}
