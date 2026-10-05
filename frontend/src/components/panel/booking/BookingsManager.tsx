"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { formatDay } from "@/lib/calendar/format";
import { addDays, todayIso, weekdayOf } from "@/lib/calendar/jalali";
import { errorMessage } from "@/lib/api/client";
import { useBookings, type BookingListItem, type BookingStatus } from "@/lib/api/queries";
import { formatNumber } from "@/lib/format";
import { Alert, Button } from "../ui";
import { BookingRow } from "./BookingRow";
import { STATUS_LABELS, STATUS_ORDER } from "./status";

type View = "month" | "week" | "list";
const VIEWS: { key: View; label: string }[] = [
  { key: "month", label: "ماه" },
  { key: "week", label: "هفته" },
  { key: "list", label: "فهرست" },
];
const LINK = "inline-flex min-h-11 items-center rounded-brand border border-line px-5 hover:border-accent";

export function BookingsManager() {
  const [view, setView] = useState<View>("month");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] leading-tight">رزروها</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/panel/booking/settings" className={LINK}>
            تنظیمات رزرو
          </Link>
          <Link
            href="/panel/booking/new"
            className="inline-flex min-h-11 items-center rounded-brand bg-accent px-5 font-semibold text-bg hover:opacity-90"
          >
            رزرو دستی
          </Link>
        </div>
      </div>
      <div role="tablist" aria-label="نمای رزروها" className="flex gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            onClick={() => setView(v.key)}
            className={`min-h-11 rounded-brand border px-5 ${view === v.key ? "border-accent bg-elevated text-accent" : "border-line"}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "month" && <MonthView />}
      {view === "week" && <WeekView />}
      {view === "list" && <ListView />}
    </div>
  );
}

const active = (b: BookingListItem) => b.status !== "cancelled";

function byDay(list: BookingListItem[]): Record<string, BookingListItem[]> {
  const days: Record<string, BookingListItem[]> = {};
  for (const b of list) (days[b.date] ??= []).push(b);
  return days;
}

function MonthView() {
  const [range, setRange] = useState<[string, string] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const bookings = useBookings({ from: range?.[0], to: range?.[1], page_size: 500 }, range !== null);
  const days = byDay((bookings.data?.results ?? []).filter(active));
  const chosen = day ? (days[day] ?? []) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
      <div>
        <MonthCalendar
          locale="fa"
          value={day}
          onSelect={setDay}
          onMonthChange={(first, last) => {
            setRange([first, last]);
            // The chosen day belongs to the month it was chosen in; showing it against another month's data
            // would claim «no bookings» for a day that was never fetched.
            setDay((chosen) => (chosen && chosen >= first && chosen <= last ? chosen : null));
          }}
          badge={(iso) =>
            days[iso] ? (
              <span className="text-xs font-bold text-accent">{formatNumber(days[iso]!.length)}</span>
            ) : null
          }
          labels={{ previous: "ماه قبل", next: "ماه بعد", grid: "تقویم رزروها" }}
        />
        {bookings.isError && <Alert>{errorMessage(bookings.error)}</Alert>}
      </div>
      <section aria-live="polite" className="flex flex-col gap-2">
        {day ? (
          <>
            <h2 className="font-bold">{formatDay(day, "fa", "full")}</h2>
            {chosen.length === 0 ? (
              <p className="text-muted">رزروی در این روز نیست.</p>
            ) : (
              <ul aria-label="رزروهای این روز" className="flex flex-col gap-2">
                {chosen.map((b) => (
                  <li key={b.id}>
                    <BookingRow booking={b} />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-muted">یک روز را انتخاب کنید. عدد زیر هر روز تعداد رزروهای آن است.</p>
        )}
      </section>
    </div>
  );
}

/** The Saturday on or before `iso` (the Persian week starts on Saturday; `weekdayOf`: Sunday is 0). */
function weekStartOf(iso: string): string {
  return addDays(iso, -((weekdayOf(iso) + 1) % 7));
}

function WeekView() {
  const [start, setStart] = useState(() => weekStartOf(todayIso()));
  const end = addDays(start, 6);
  const bookings = useBookings({ from: start, to: end, page_size: 500 });
  const days = byDay((bookings.data?.results ?? []).filter(active));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => setStart(addDays(start, -7))}>
          هفته‌ی قبل
        </Button>
        <p className="font-semibold">
          {formatDay(start, "fa", "medium")} تا {formatDay(end, "fa", "medium")}
        </p>
        <Button variant="ghost" onClick={() => setStart(addDays(start, 7))}>
          هفته‌ی بعد
        </Button>
      </div>
      {bookings.isError && <Alert>{errorMessage(bookings.error)}</Alert>}
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((iso) => (
        <section key={iso} aria-label={formatDay(iso, "fa", "full")} className="flex flex-col gap-2">
          <h2 className={`font-semibold ${iso === todayIso() ? "text-accent" : ""}`}>
            {formatDay(iso, "fa", "full")}
          </h2>
          {(days[iso] ?? []).length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {days[iso]!.map((b) => (
                <li key={b.id}>
                  <BookingRow booking={b} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

const PAGE_SIZE = 20;
const CONTROL =
  "min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text outline-none focus:border-text";

function ListView() {
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const bookings = useBookings({
    status: status || undefined,
    q: q || undefined,
    page: page > 1 ? page : undefined,
  });
  const list = bookings.data?.results ?? [];
  const total = bookings.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm text-muted">
          جست‌وجو
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="نام، برند یا تماس"
            className={CONTROL}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          وضعیت
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as BookingStatus | "");
              setPage(1);
            }}
            className={CONTROL}
          >
            <option value="">همه</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {bookings.isError && <Alert>{errorMessage(bookings.error)}</Alert>}
      {!bookings.isError && bookings.isSuccess && list.length === 0 && (
        <p className="text-muted">رزروی پیدا نشد.</p>
      )}
      {list.length > 0 && (
        <ul aria-label="رزروها" className="flex flex-col gap-2">
          {list.map((b) => (
            <li key={b.id}>
              <BookingRow booking={b} showDate />
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="صفحه‌بندی" className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            صفحه‌ی قبل
          </Button>
          <span className="text-sm text-muted">{`صفحه ${formatNumber(page)} از ${formatNumber(pages)} (${formatNumber(total)} رزرو)`}</span>
          <Button variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            صفحه‌ی بعد
          </Button>
        </nav>
      )}
    </div>
  );
}
