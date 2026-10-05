"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Locale } from "@/i18n/config";
import { formatDay } from "@/lib/calendar/format";
import type { PublicBooking } from "@/lib/site/booking-api";
import type { BookingLabels } from "@/lib/site/booking-labels";
import { href } from "@/lib/site/text";
import { timeText } from "./BookingFlow";

export function BookingStatus({
  initial,
  token,
  locale,
  labels,
}: {
  initial: PublicBooking;
  token: string;
  locale: Locale;
  labels: BookingLabels;
}) {
  const [booking, setBooking] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = `/api/public/bookings/${encodeURIComponent(token)}`;

  const cancel = async () => {
    if (!window.confirm(labels.cancelConfirm)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${base}/cancel`, { method: "POST" });
      if (res.ok) setBooking((await res.json()) as PublicBooking);
      else if (res.status === 409) {
        const data = (await res.json().catch(() => null)) as { code?: string } | null;
        // Show the real state (it may already be cancelled or past) instead of guessing.
        const fresh = await fetch(base);
        if (fresh.ok) setBooking((await fresh.json()) as PublicBooking);
        setError(data?.code === "too_late" ? labels.errorTooLate : labels.errorCancel);
      } else setError(res.status === 429 ? labels.errorRate : labels.errorCancel);
    } catch {
      setError(labels.errorCancel);
    } finally {
      setBusy(false);
    }
  };

  const banner = (() => {
    switch (booking.status) {
      case "confirmed":
        return [labels.confirmedTitle, labels.confirmedBody, "border-success"] as const;
      case "completed":
        return [labels.completedTitle, labels.completedBody, "border-line"] as const;
      case "cancelled":
        return [
          booking.cancelled_by === "customer" ? labels.cancelledByYouTitle : labels.cancelledByAdminTitle,
          labels.cancelledBody,
          "border-line",
        ] as const;
      default:
        return [labels.pendingTitle, labels.pendingBody, "border-line"] as const;
    }
  })();

  return (
    <Card className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-display text-4xl">{labels.statusTitle}</h1>
      <section role="status" className={`rounded-brand border p-4 ${banner[2]}`}>
        <h2 className="font-bold">{banner[0]}</h2>
        <p className="text-muted">{banner[1]}</p>
      </section>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">{labels.when}</dt>
          <dd className="font-semibold">
            {formatDay(booking.date, locale, "full")} · {timeText(booking.time, locale)}–
            {timeText(booking.end_time, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{labels.type}</dt>
          <dd dir="auto">{booking.session_label}</dd>
        </div>
        {booking.package_label && (
          <div>
            <dt className="text-sm text-muted">{labels.package}</dt>
            <dd dir="auto">{booking.package_label}</dd>
          </div>
        )}
        <div>
          <dt className="text-sm text-muted">{labels.bookedBy}</dt>
          <dd dir="auto">{booking.name}</dd>
        </div>
      </dl>
      {error && (
        <p role="alert" className="rounded-brand border border-accent-2 px-3 py-2 text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {booking.can_cancel && (
          <Button variant="secondary" disabled={busy} onClick={cancel}>
            {busy ? labels.cancelling : labels.cancel}
          </Button>
        )}
        {booking.status === "cancelled" && (
          <ButtonLink href={href(locale, "/book")}>{labels.bookAgain}</ButtonLink>
        )}
      </div>
    </Card>
  );
}
