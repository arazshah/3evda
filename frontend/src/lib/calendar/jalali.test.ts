import { describe, expect, it } from "vitest";
import {
  addDays,
  gregorianMonthLength,
  isoOf,
  jalaliMonthLength,
  toGregorian,
  toJalali,
  weekdayOf,
} from "./jalali";
import { JALALI_TABLE, LEAP_YEARS } from "./jalali-table";

describe("Jalali conversion agrees with jdatetime", () => {
  it.each(JALALI_TABLE)("%i/%i/%i = %i-%i-%i", (jy, jm, jd, gy, gm, gd) => {
    expect(toGregorian({ jy, jm, jd })).toEqual({ gy, gm, gd });
    expect(toJalali({ gy, gm, gd })).toEqual({ jy, jm, jd });
  });

  it("knows the leap years in the table", () => {
    for (let jy = 1399; jy <= 1410; jy++) {
      expect(jalaliMonthLength(jy, 12)).toBe(LEAP_YEARS.includes(jy) ? 30 : 29);
    }
  });

  it("has 31, 30 and 29/30 days in the right months", () => {
    for (let jm = 1; jm <= 6; jm++) expect(jalaliMonthLength(1405, jm)).toBe(31);
    for (let jm = 7; jm <= 11; jm++) expect(jalaliMonthLength(1405, jm)).toBe(30);
  });

  it("round-trips every day of several years, including across New Year", () => {
    for (let jy = 1400; jy <= 1409; jy++) {
      for (let jm = 1; jm <= 12; jm++) {
        for (let jd = 1; jd <= jalaliMonthLength(jy, jm); jd++) {
          expect(toJalali(toGregorian({ jy, jm, jd }))).toEqual({ jy, jm, jd });
        }
      }
    }
  });

  it("rejects a day that does not exist", () => {
    expect(() => toGregorian({ jy: 1405, jm: 12, jd: 31 })).toThrow();
  });
});

describe("plain-day helpers", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("finds the weekday (0 = Sunday)", () => {
    expect(weekdayOf("2026-10-10")).toBe(6); // Saturday
    expect(weekdayOf("2026-10-11")).toBe(0);
  });
  it("knows Gregorian month lengths", () => {
    expect(gregorianMonthLength(2028, 2)).toBe(29);
    expect(gregorianMonthLength(2026, 2)).toBe(28);
    expect(gregorianMonthLength(2026, 12)).toBe(31);
  });
  it("formats ISO days with leading zeros", () => {
    expect(isoOf({ gy: 2026, gm: 3, gd: 5 })).toBe("2026-03-05");
  });
});
