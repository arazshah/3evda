"use client";

import Link from "next/link";
import { useBookings } from "@/lib/api/queries";
import { Card } from "../ui";
import { BookingRow } from "./BookingRow";

/** The bookings made for an enquiry or a proforma, with a way to make another. */
export function LinkedBookings({ inquiry, proforma }: { inquiry?: number | null; proforma?: number | null }) {
  const bookings = useBookings(
    { inquiry: inquiry ?? undefined, proforma: proforma ?? undefined, page_size: 50 },
    Boolean(inquiry || proforma),
  );
  const list = bookings.data?.results ?? [];
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
      {list.length === 0 ? (
        <p className="text-sm text-muted">هنوز رزروی وصل نشده است.</p>
      ) : (
        <ul aria-label="رزروهای وصل‌شده" className="flex flex-col gap-2">
          {list.map((b) => (
            <li key={b.id}>
              <BookingRow booking={b} showDate />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
