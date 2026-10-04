import Link from "next/link";
import type { BookingListItem } from "@/lib/api/queries";
import { STATUS_LABELS, clock } from "./status";

/** One booking in a list: time, who, what, and where it stands. */
export function BookingRow({ booking, showDate = false }: { booking: BookingListItem; showDate?: boolean }) {
  return (
    <Link
      href={`/panel/booking/${booking.id}`}
      className="flex flex-wrap items-center gap-3 rounded-brand border border-line bg-surface p-3 hover:border-accent"
    >
      <span className="font-semibold" dir="ltr">
        {clock(booking.time)}–{clock(booking.end_time)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold" dir="auto">
          {booking.name}
          {booking.brand ? ` · ${booking.brand}` : ""}
        </p>
        <p className="truncate text-sm text-muted" dir="auto">
          {booking.session_label}
          {booking.package_label ? ` · ${booking.package_label}` : ""}
          {showDate
            ? ` · ${new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${booking.date}T00:00:00Z`))}`
            : ""}
        </p>
      </div>
      {booking.is_new && (
        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-bg">جدید</span>
      )}
      <span className="text-xs text-muted">{STATUS_LABELS[booking.status]}</span>
    </Link>
  );
}
