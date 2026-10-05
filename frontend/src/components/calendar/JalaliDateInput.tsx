"use client";

import { useId } from "react";
import { isoOf, jalaliMonthLength, parseIso, todayIso, toGregorian, toJalali } from "@/lib/calendar/jalali";

const SELECT =
  "min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text outline-none focus:border-accent";

const monthName = (jy: number, jm: number) =>
  new Intl.DateTimeFormat("fa-IR", { month: "long", timeZone: "UTC" }).format(
    new Date(`${isoOf(toGregorian({ jy, jm, jd: 1 }))}T00:00:00Z`),
  );

/**
 * A day picked as year / month / day in the Jalali calendar. The value is the Gregorian `YYYY-MM-DD` the server
 * stores. Three plain selects: reachable from the keyboard and readable by a screen reader.
 */
export function JalaliDateInput({
  label,
  value,
  onChange,
  years = 3,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  /** How many years either side of the current one are offered. */
  years?: number;
}) {
  const id = useId();
  const { jy, jm, jd } = toJalali(parseIso(value));
  const nowYear = toJalali(parseIso(todayIso())).jy;
  const choices = Array.from({ length: years * 2 + 1 }, (_, i) => nowYear - years + i);
  if (!choices.includes(jy)) choices.push(jy);
  const length = jalaliMonthLength(jy, jm);
  const nf = new Intl.NumberFormat("fa-IR", { useGrouping: false });

  const change = (next: { jy?: number; jm?: number; jd?: number }) => {
    const y = next.jy ?? jy;
    const m = next.jm ?? jm;
    const d = Math.min(next.jd ?? jd, jalaliMonthLength(y, m));
    onChange(isoOf(toGregorian({ jy: y, jm: m, jd: d })));
  };

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label={`${label} — روز`}
          className={SELECT}
          value={jd}
          onChange={(e) => change({ jd: Number(e.target.value) })}
          id={`${id}-d`}
        >
          {Array.from({ length }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {nf.format(d)}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} — ماه`}
          className={SELECT}
          value={jm}
          onChange={(e) => change({ jm: Number(e.target.value) })}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {monthName(jy, m)}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} — سال`}
          className={SELECT}
          value={jy}
          onChange={(e) => change({ jy: Number(e.target.value) })}
        >
          {[...choices]
            .sort((a, b) => a - b)
            .map((y) => (
              <option key={y} value={y}>
                {nf.format(y)}
              </option>
            ))}
        </select>
      </div>
    </fieldset>
  );
}
