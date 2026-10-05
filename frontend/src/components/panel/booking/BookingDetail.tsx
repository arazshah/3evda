"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { JalaliDateInput } from "@/components/calendar/JalaliDateInput";
import { formatDay } from "@/lib/calendar/format";
import { errorMessage } from "@/lib/api/client";
import { useBooking, useBookingAction, useSaveBookingNote, type Booking } from "@/lib/api/queries";
import { formatDate } from "@/lib/format";
import { telHref } from "@/lib/site/text";
import { telegramLink, whatsappLink } from "../inquiries/links";
import { Alert, Button, Card, Field, TextArea } from "../ui";
import { STATUS_LABELS, clock } from "./status";

type Message = { tone: "success" | "error"; text: string } | null;

export function BookingDetailPage({ id }: { id: number }) {
  const booking = useBooking(id);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/panel/booking" className="inline-flex min-h-11 items-center text-accent hover:underline">
        ← همه‌ی رزروها
      </Link>
      {booking.isError && <Alert>{errorMessage(booking.error)}</Alert>}
      {booking.isPending && <p className="text-muted">در حال بارگذاری…</p>}
      {booking.data && <BookingView key={booking.data.id} booking={booking.data} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <dt className="text-muted">{label}:</dt>
      <dd dir="auto">{children}</dd>
    </div>
  );
}

function ContactValue({ value, href }: { value: string; href: string | null }) {
  if (!href) return <span dir="ltr">{value}</span>;
  return (
    <a
      className="text-accent hover:underline"
      dir="ltr"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {value}
    </a>
  );
}

function BookingView({ booking }: { booking: Booking }) {
  const act = useBookingAction();
  const saveNote = useSaveBookingNote();
  const [message, setMessage] = useState<Message>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(booking.internal_note ?? "");
  const [moveDate, setMoveDate] = useState(booking.date);
  const [moveTime, setMoveTime] = useState(booking.time.slice(0, 5));
  const [copied, setCopied] = useState(false);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setMessage(null);
    try {
      await work();
      setMessage({ tone: "success", text: done });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  const open = booking.status === "pending" || booking.status === "confirmed";
  const noteChanged = note !== (booking.internal_note ?? "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(booking.link);
      setCopied(true);
    } catch {
      setMessage({ tone: "error", text: "کپی خودکار ممکن نشد؛ لینک را از کادر انتخاب و کپی کنید." });
    }
  };

  return (
    <>
      <div>
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight" dir="auto">
          {booking.name}
          {booking.brand ? ` · ${booking.brand}` : ""}
        </h1>
        <p className="text-sm text-muted">
          {STATUS_LABELS[booking.status]} · {formatDay(booking.date, "fa", "full")} ·{" "}
          <span dir="ltr">
            {clock(booking.time)}–{clock(booking.end_time)}
          </span>
        </p>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card className="space-y-3">
        <h2 className="font-display text-2xl">جلسه</h2>
        <dl className="space-y-2">
          <Row label="نوع">{booking.session_label}</Row>
          {booking.package_label && <Row label="پکیج">{booking.package_label}</Row>}
          <Row label="ثبت">
            {formatDate(booking.created_at)}
            {booking.created_by_admin ? " (توسط شما)" : " (از سایت)"}
          </Row>
          {booking.status === "cancelled" && (
            <Row label="لغو">
              {booking.cancelled_by === "customer" ? "توسط مشتری" : "توسط شما"}
              {booking.cancel_reason ? ` — ${booking.cancel_reason}` : ""}
            </Row>
          )}
          {booking.notes && <Row label="توضیح مشتری">{booking.notes}</Row>}
        </dl>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-2xl">راه‌های تماس</h2>
        <dl className="space-y-2">
          {booking.phone && (
            <Row label="تلفن">
              <a className="text-accent hover:underline" dir="ltr" href={telHref(booking.phone)}>
                {booking.phone}
              </a>
            </Row>
          )}
          {booking.whatsapp && (
            <Row label="واتس‌اپ">
              <ContactValue value={booking.whatsapp} href={whatsappLink(booking.whatsapp)} />
            </Row>
          )}
          {booking.telegram && (
            <Row label="تلگرام">
              <ContactValue value={booking.telegram} href={telegramLink(booking.telegram)} />
            </Row>
          )}
          {booking.email && (
            <Row label="ایمیل">
              <a className="text-accent hover:underline" dir="ltr" href={`mailto:${booking.email}`}>
                {booking.email}
              </a>
            </Row>
          )}
        </dl>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-2xl">پیوندها</h2>
        {(booking.inquiry || booking.proforma) && (
          <dl className="space-y-2">
            {booking.inquiry && (
              <Row label="استعلام">
                <Link className="text-accent hover:underline" href={`/panel/inquiries/${booking.inquiry}`}>
                  مشاهده
                </Link>
              </Row>
            )}
            {booking.proforma && (
              <Row label="پیش‌فاکتور">
                <Link className="text-accent hover:underline" href={`/panel/proformas/${booking.proforma}`}>
                  مشاهده
                </Link>
              </Row>
            )}
          </dl>
        )}
        {!booking.inquiry && !booking.proforma && (
          <p className="text-sm text-muted">به استعلام یا پیش‌فاکتوری وصل نیست.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            readOnly
            aria-label="لینک وضعیت برای مشتری"
            dir="ltr"
            value={booking.link}
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-11 min-w-0 flex-1 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text"
          />
          <Button variant="ghost" onClick={copy}>
            {copied ? "کپی شد" : "کپی لینک"}
          </Button>
        </div>
        <p className="text-sm text-muted">مشتری از این لینک وضعیت رزرو را می‌بیند و می‌تواند لغو کند.</p>
      </Card>

      {open && (
        <Card className="space-y-4">
          <h2 className="font-display text-2xl">اقدام</h2>
          <div className="flex flex-wrap gap-3">
            {booking.status === "pending" && (
              <Button
                disabled={act.isPending}
                onClick={() =>
                  run(() => act.mutateAsync({ id: booking.id, action: "confirm" }), "رزرو تأیید شد.")
                }
              >
                تأیید رزرو
              </Button>
            )}
            {booking.status === "confirmed" && (
              <Button
                variant="ghost"
                disabled={act.isPending}
                onClick={() =>
                  run(() => act.mutateAsync({ id: booking.id, action: "complete" }), "جلسه انجام‌شده ثبت شد.")
                }
              >
                ثبت «انجام‌شده»
              </Button>
            )}
          </div>

          <form
            className="space-y-3 border-t border-line pt-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(
                () =>
                  act.mutateAsync({ id: booking.id, action: "reschedule", date: moveDate, time: moveTime }),
                "رزرو جابه‌جا شد.",
              );
            }}
          >
            <h3 className="font-semibold">جابه‌جایی</h3>
            <div className="flex flex-wrap items-end gap-4">
              <JalaliDateInput label="روز جدید" value={moveDate} onChange={setMoveDate} />
              <Field
                label="ساعت جدید"
                type="time"
                dir="ltr"
                value={moveTime}
                onChange={(e) => setMoveTime(e.target.value)}
              />
              <Button type="submit" variant="ghost" disabled={act.isPending}>
                جابه‌جا کن
              </Button>
            </div>
            <p className="text-xs text-muted">
              می‌توانید خارج از ساعت کاری هم بگذارید؛ فقط هم‌پوشانی با رزرو دیگر پذیرفته نمی‌شود.
            </p>
          </form>

          <div className="space-y-3 border-t border-line pt-4">
            <h3 className="font-semibold">{booking.status === "pending" ? "رد یا لغو" : "لغو"}</h3>
            <Field
              label="دلیل (اختیاری، برای ثبت در سابقه)"
              dir="auto"
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              variant="danger"
              disabled={act.isPending}
              onClick={() => {
                if (window.confirm("این رزرو لغو شود؟ ساعت آزاد می‌شود.")) {
                  void run(
                    () => act.mutateAsync({ id: booking.id, action: "cancel", reason: reason.trim() }),
                    "رزرو لغو شد.",
                  );
                }
              }}
            >
              {booking.status === "pending" ? "رد رزرو" : "لغو رزرو"}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run(
              () => saveNote.mutateAsync({ id: booking.id, internal_note: note }),
              "یادداشت ذخیره شد.",
            );
          }}
        >
          <TextArea
            label="یادداشت داخلی"
            dir="auto"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            hint="فقط خودتان می‌بینید؛ به مشتری نمی‌رسد."
          />
          <Button type="submit" disabled={saveNote.isPending || !noteChanged}>
            ذخیره‌ی یادداشت
          </Button>
        </form>
      </Card>
    </>
  );
}
