import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonthCalendar } from "./MonthCalendar";

const labels = { previous: "ماه قبل", next: "ماه بعد", grid: "تقویم" };

describe("MonthCalendar", () => {
  it("shows a Jalali month starting on Saturday, with the right number of days", () => {
    // 10 Oct 2026 = 18 Mehr 1405; Mehr has 30 days and 1 Mehr 1405 is a Wednesday (column 4 from Saturday)
    render(<MonthCalendar locale="fa" initial="2026-10-10" labels={labels} />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("مهر ۱۴۰۵");
    const grid = screen.getByRole("grid", { name: "تقویم" });
    expect(within(grid).getAllByRole("button")).toHaveLength(30);
    const firstRow = within(grid).getAllByRole("row")[1]!;
    const cells = Array.from(firstRow.querySelectorAll("td"));
    expect(cells.slice(0, 4).every((c) => c.querySelector("button") === null)).toBe(true);
    expect(cells[4]!.querySelector("button")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/مهر.*چهارشنبه|چهارشنبه.*مهر/),
    );
    expect(within(grid).getAllByRole("columnheader")[0]).toHaveTextContent("ش");
  });

  it("shows a Gregorian month starting on Monday for English", () => {
    render(
      <MonthCalendar
        locale="en"
        initial="2026-10-10"
        labels={{ previous: "Previous", next: "Next", grid: "Calendar" }}
      />,
    );
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("October 2026");
    const grid = screen.getByRole("grid", { name: "Calendar" });
    expect(within(grid).getAllByRole("button")).toHaveLength(31);
    expect(within(grid).getAllByRole("columnheader")[0]).toHaveTextContent("Mon");
    // 1 Oct 2026 is a Thursday: three empty cells before it
    const firstRow = within(grid).getAllByRole("row")[1]!;
    expect(
      Array.from(firstRow.querySelectorAll("td"))
        .slice(0, 3)
        .every((c) => c.querySelector("button") === null),
    ).toBe(true);
  });

  it("moves between months, across the end of the year, and reports the range on show", () => {
    const seen: [string, string][] = [];
    render(
      <MonthCalendar
        locale="fa"
        initial="2026-03-10"
        labels={labels}
        onMonthChange={(a, b) => seen.push([a, b])}
      />,
    );
    expect(seen.at(-1)).toEqual(["2026-02-20", "2026-03-20"]); // Esfand 1404 (29 days)
    fireEvent.click(screen.getByRole("button", { name: "ماه بعد" }));
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("فروردین ۱۴۰۵");
    expect(seen.at(-1)).toEqual(["2026-03-21", "2026-04-20"]);
    fireEvent.click(screen.getByRole("button", { name: "ماه قبل" }));
    fireEvent.click(screen.getByRole("button", { name: "ماه قبل" }));
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("بهمن ۱۴۰۴");
  });

  it("selects an enabled day and refuses a disabled one", () => {
    const onSelect = vi.fn();
    render(
      <MonthCalendar
        locale="en"
        initial="2026-10-10"
        value="2026-10-12"
        labels={{ previous: "Previous", next: "Next", grid: "Calendar" }}
        onSelect={onSelect}
        isDisabled={(iso) => iso < "2026-10-05"}
      />,
    );
    const days = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-label")?.includes("2026"));
    expect(days[0]).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /October 14, 2026/ }));
    expect(onSelect).toHaveBeenCalledWith("2026-10-14");
    expect(screen.getByRole("button", { name: /October 12, 2026/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("draws a badge under a day", () => {
    render(
      <MonthCalendar
        locale="en"
        initial="2026-10-10"
        labels={{ previous: "P", next: "N", grid: "C" }}
        badge={(iso) => (iso === "2026-10-10" ? <i>2</i> : null)}
      />,
    );
    expect(
      within(screen.getByRole("button", { name: /October 10, 2026/ })).getByText("2"),
    ).toBeInTheDocument();
  });
});
