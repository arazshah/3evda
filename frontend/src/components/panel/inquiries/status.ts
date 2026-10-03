import type { InquiryStatus } from "@/lib/api/queries";

export const STATUS_LABELS: Record<InquiryStatus, string> = {
  new: "جدید",
  reviewing: "در بررسی",
  proforma_sent: "پیش‌فاکتور ارسال شد",
  converted: "تبدیل شد (رزرو یا پروژه)",
  closed: "بسته",
};

export const STATUS_ORDER = Object.keys(STATUS_LABELS) as InquiryStatus[];

/** The range the visitor was shown, as text ("" when they sent only a message). */
export function rangeText(
  low: number | null | undefined,
  high: number | null | undefined,
  format: (n: number) => string,
): string {
  if (low == null || high == null) return "";
  return `از ${format(low)} تا ${format(high)} تومان`;
}
