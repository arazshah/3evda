export const STATUS_LABELS: Record<string, string> = {
  draft: "پیش‌نویس",
  sent: "ارسال‌شده",
  viewed: "دیده‌شده",
  approved: "تأییدشده",
  rejected: "ردشده",
  expired: "منقضی",
  superseded: "جایگزین‌شده",
  cancelled: "لغوشده",
};

export const STATUS_ORDER = Object.keys(STATUS_LABELS);

export const statusLabel = (status: string) => STATUS_LABELS[status] ?? status;

/** Where the open proformas can still be answered (so can be corrected or cancelled). */
export const isOpen = (status: string) => status === "sent" || status === "viewed";
