"use client";

import Link from "next/link";
import { errorMessage } from "@/lib/api/client";
import { useBookings } from "@/lib/api/queries";
import { formatNumber } from "@/lib/format";
import { Alert, Card } from "../ui";
import { BookingRow } from "./BookingRow";

/** The bookings made for an enquiry or a proforma, with a way to make another. */
export function LinkedBookings({ inquiry, proforma }: { inquiry?: number | null; proforma?: number | null }) {
  const bookings = useBookings(
    { inquiry: inquiry ?? undefined, proforma: proforma ?? undefined, page_size: 500 },
    Boolean(inquiry || proforma),
  );
  const list = bookings.data?.results ?? [];
  const total = bookings.data?.count ?? 0;
  const query = new URLSearchParams();
  if (inquiry) query.set("inquiry", String(inquiry));
  if (proforma) query.set("proforma", String(proforma));
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">رزروها</h2>
        <Link
          href={`/panel/booking/new?${query}`}
          className="inline-flex min-h-11 items-center rounded-brand border border-line px-5 hover:border-accent"
        >
          ساخت رزرو
        </Link>
      </div>
      {bookings.isError && <Alert>{errorMessage(bookings.error)}</Alert>}
      {bookings.isPending && !bookings.isError && <p className="text-sm text-muted">در حال بارگذاری…</p>}
      {bookings.isSuccess && list.length === 0 && (
        <p className="text-sm text-muted">هنوز رزروی وصل نشده است.</p>
      )}
      {list.length > 0 && (
        <ul aria-label="رزروهای وصل‌شده" className="flex flex-col gap-2">
          {list.map((b) => (
            <li key={b.id}>
              <BookingRow booking={b} showDate />
            </li>
          ))}
        </ul>
      )}
      {total > list.length && (
        <p className="text-sm text-muted">{`${formatNumber(list.length)} رزرو از ${formatNumber(total)} نشان داده شد؛ بقیه را از فهرست رزروها ببینید.`}</p>
      )}
    </Card>
  );
}
