"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addDays,
  gregorianMonthLength,
  isoOf,
  todayIso,
  jalaliMonthLength,
  parseIso,
  toGregorian,
  toJalali,
  weekdayOf,
} from "@/lib/calendar/jalali";

export type CalendarLabels = { previous: string; next: string; grid: string };

type Props = {
  /** Persian pages get the Jalali calendar with weeks starting on Saturday; English the Gregorian one, Monday first. */
  locale: "fa" | "en";
  /** The selected day, as `YYYY-MM-DD`. */
  value?: string | null;
  onSelect?: (iso: string) => void;
  isDisabled?: (iso: string) => boolean;
  /** Something small under the day number (a count, a dot). */
  badge?: (iso: string) => ReactNode;
  /** A day in the month to open on; today by default. */
  initial?: string;
  /** Called with the first and last day of the month on show, now and whenever it changes. */
  onMonthChange?: (first: string, last: string) => void;
  labels: CalendarLabels;
};

type Cursor = { year: number; month: number };

const LOCALE = { fa: "fa-IR", en: "en-US" } as const;

function cursorOf(iso: string, locale: "fa" | "en"): Cursor {
  const g = parseIso(iso);
  if (locale === "en") return { year: g.gy, month: g.gm };
  const j = toJalali(g);
  return { year: j.jy, month: j.jm };
}

function monthBounds(cursor: Cursor, locale: "fa" | "en"): { first: string; length: number } {
  if (locale === "en") {
    return {
      first: isoOf({ gy: cursor.year, gm: cursor.month, gd: 1 }),
      length: gregorianMonthLength(cursor.year, cursor.month),
    };
  }
  return {
    first: isoOf(toGregorian({ jy: cursor.year, jm: cursor.month, jd: 1 })),
    length: jalaliMonthLength(cursor.year, cursor.month),
  };
}

function shift(cursor: Cursor, by: number): Cursor {
  const index = cursor.year * 12 + (cursor.month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function MonthCalendar({
  locale,
  value,
  onSelect,
  isDisabled,
  badge,
  initial,
  onMonthChange,
  labels,
}: Props) {
  const [cursor, setCursor] = useState<Cursor>(() => cursorOf(initial ?? value ?? todayIso(), locale));
  const { first, length } = useMemo(() => monthBounds(cursor, locale), [cursor, locale]);
  const last = addDays(first, length - 1);

  const notify = useRef(onMonthChange);
  useEffect(() => {
    notify.current = onMonthChange;
  });
  useEffect(() => {
    notify.current?.(first, last);
  }, [first, last]);

  const tag = LOCALE[locale];
  // Month name, then year, whatever order the platform's own pattern uses.
  const titleParts = new Intl.DateTimeFormat(tag, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(new Date(`${first}T00:00:00Z`));
  const titlePart = (type: string) => titleParts.find((p) => p.type === type)?.value ?? "";
  const title = `${titlePart("month")} ${titlePart("year")}`;
  const longDay = new Intl.DateTimeFormat(tag, { dateStyle: "full", timeZone: "UTC" });
  const dayNumber = new Intl.NumberFormat(tag);

  // Column of the first day: Saturday-first for Persian, Monday-first for English (getUTCDay: Sunday is 0).
  const lead = locale === "fa" ? (weekdayOf(first) + 1) % 7 : (weekdayOf(first) + 6) % 7;
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length }, (_, i) => addDays(first, i)),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  // Header names come from a known week (Saturday 10 Oct 2026), so they follow the platform's own wording.
  const startOfWeek = locale === "fa" ? "2026-10-10" : "2026-10-05";
  const headers = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek, i)).map((iso) => ({
    short: new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    ),
    long: new Intl.DateTimeFormat(tag, { weekday: "long", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    ),
  }));

  const label = (iso: string) => {
    const g = parseIso(iso);
    return dayNumber.format(locale === "fa" ? toJalali(g).jd : g.gd);
  };

  const today = todayIso();
  const nav =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-brand border border-line hover:border-accent";

  return (
    <div className="w-full max-w-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className={nav}
          aria-label={labels.previous}
          onClick={() => setCursor(shift(cursor, -1))}
        >
          <span aria-hidden="true">{locale === "fa" ? "›" : "‹"}</span>
        </button>
        <h3 className="font-semibold" aria-live="polite">
          {title}
        </h3>
        <button
          type="button"
          className={nav}
          aria-label={labels.next}
          onClick={() => setCursor(shift(cursor, 1))}
        >
          <span aria-hidden="true">{locale === "fa" ? "‹" : "›"}</span>
        </button>
      </div>
      <table role="grid" aria-label={labels.grid} className="w-full table-fixed border-collapse text-center">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h.long} scope="col" className="py-1 text-xs font-medium text-muted">
                <abbr title={h.long} className="no-underline">
                  {h.short}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, w) => (
            <tr key={w}>
              {week.map((iso, c) => (
                <td key={c} className="p-0.5">
                  {iso && (
                    <button
                      type="button"
                      disabled={isDisabled?.(iso) ?? false}
                      aria-label={longDay.format(new Date(`${iso}T00:00:00Z`))}
                      aria-pressed={value === iso}
                      onClick={() => onSelect?.(iso)}
                      className={`flex min-h-11 w-full flex-col items-center justify-center rounded-brand border text-sm font-semibold disabled:cursor-not-allowed disabled:font-normal disabled:text-muted ${
                        value === iso
                          ? "border-accent bg-accent text-bg"
                          : iso === today
                            ? "border-accent hover:bg-elevated"
                            : "border-line hover:border-accent hover:bg-elevated disabled:border-transparent disabled:hover:bg-transparent"
                      }`}
                    >
                      <span>{label(iso)}</span>
                      {badge?.(iso)}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
