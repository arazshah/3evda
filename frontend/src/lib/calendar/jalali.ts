/**
 * Jalali ⇄ Gregorian conversion on top of the browser's own calendar (ICU), which is also what
 * `Intl.DateTimeFormat("fa-IR")` prints with, so a day in the calendar and the same day written in a sentence
 * can never disagree. The tests check it against the dates `jdatetime` gives on the server.
 * Everything is on plain calendar days (UTC midnight): no time zone enters the conversion.
 */

const DAY = 86_400_000;

const persian = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export type Jalali = { jy: number; jm: number; jd: number };
export type Gregorian = { gy: number; gm: number; gd: number };

export function toJalali({ gy, gm, gd }: Gregorian): Jalali {
  const parts = persian.formatToParts(new Date(Date.UTC(gy, gm - 1, gd)));
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { jy: pick("year"), jm: pick("month"), jd: pick("day") };
}

const same = (a: Jalali, b: Jalali) => a.jy === b.jy && a.jm === b.jm && a.jd === b.jd;

/** Days from the 1st of Farvardin to the 1st of month `jm`. */
const monthOffset = (jm: number) => (jm <= 7 ? (jm - 1) * 31 : 6 * 31 + (jm - 7) * 30);

export function toGregorian(target: Jalali): Gregorian {
  // Nowruz falls on 20–22 March; start from 21 March and move a day at a time until the calendars meet.
  let guess = Date.UTC(target.jy + 621, 2, 21) + (monthOffset(target.jm) + target.jd - 1) * DAY;
  for (let i = 0; i < 6; i++) {
    const date = new Date(guess);
    const gregorian = { gy: date.getUTCFullYear(), gm: date.getUTCMonth() + 1, gd: date.getUTCDate() };
    const found = toJalali(gregorian);
    if (same(found, target)) return gregorian;
    const delta = (found.jy - target.jy) * 372 + (found.jm - target.jm) * 31 + (found.jd - target.jd);
    guess -= Math.sign(delta) * DAY;
  }
  throw new Error(`Not a Jalali date: ${target.jy}/${target.jm}/${target.jd}`);
}

export function isoOf({ gy, gm, gd }: Gregorian): string {
  return `${String(gy).padStart(4, "0")}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

export function parseIso(iso: string): Gregorian {
  const [gy, gm, gd] = iso.split("-").map(Number) as [number, number, number];
  return { gy, gm, gd };
}

export function addDays(iso: string, days: number): string {
  const { gy, gm, gd } = parseIso(iso);
  const date = new Date(Date.UTC(gy, gm - 1, gd) + days * DAY);
  return isoOf({ gy: date.getUTCFullYear(), gm: date.getUTCMonth() + 1, gd: date.getUTCDate() });
}

/** 0 = Sunday … 6 = Saturday, like `Date.getUTCDay()`. */
export function weekdayOf(iso: string): number {
  const { gy, gm, gd } = parseIso(iso);
  return new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay();
}

export function jalaliMonthLength(jy: number, jm: number): number {
  const next = jm === 12 ? { jy: jy + 1, jm: 1 } : { jy, jm: jm + 1 };
  const a = toGregorian({ jy, jm, jd: 1 });
  const b = toGregorian({ ...next, jd: 1 });
  return Math.round((Date.UTC(b.gy, b.gm - 1, b.gd) - Date.UTC(a.gy, a.gm - 1, a.gd)) / DAY);
}

export function gregorianMonthLength(gy: number, gm: number): number {
  return new Date(Date.UTC(gy, gm, 0)).getUTCDate();
}

const tehranDay = new Intl.DateTimeFormat("en-u-nu-latn", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Today as `YYYY-MM-DD` in Tehran, the time zone the bookings are made in (the server decides days there too),
 * whatever the visitor's own clock says: near midnight the two can be on different days.
 */
export function todayIso(now: Date = new Date()): string {
  const parts = tehranDay.formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}
