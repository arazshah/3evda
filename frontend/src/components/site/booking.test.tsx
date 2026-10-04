import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import { BOOKING_LABEL_KEYS, type BookingLabels } from "@/lib/site/booking-labels";
import type { BookingOptions, PublicBooking } from "@/lib/site/booking-api";
import { addDays } from "@/lib/calendar/jalali";
import { BookingFlow, timeText } from "./BookingFlow";
import { BookingStatus } from "./BookingStatus";

afterEach(() => vi.unstubAllGlobals());

const enLabels = en.site.booking as BookingLabels;
const faLabels = fa.site.booking as BookingLabels;
const options: BookingOptions = {
  session_types: [
    { key: "studio", title_fa: "استودیو", title_en: "Studio", duration_minutes: 60 },
    { key: "on-site", title_fa: "در محل", title_en: "On site", duration_minutes: 120 },
  ],
  horizon_days: 60,
  min_notice_hours: 24,
};

type Call = { url: string; method: string; body?: Record<string, unknown> };

/** Free days: the 10th day of whatever month is asked for, at two times. */
function stub(post: { status: number; body: unknown } = { status: 201, body: {} }) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.startsWith("/api/public/booking/availability")) {
      const from = new URL(url, "http://x").searchParams.get("from")!;
      return new Response(
        JSON.stringify({ days: [{ date: addDays(from, 10), times: ["10:00", "11:30"] }] }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify(post.body), { status: post.status });
  });
  return calls;
}

const flow = (locale: "en" | "fa" = "en") =>
  render(<BookingFlow options={options} locale={locale} labels={locale === "en" ? enLabels : faLabels} />);

async function pickFirstFreeDay() {
  await waitFor(() => expect(screen.queryByText(enLabels.loading)).not.toBeInTheDocument());
  const enabled = screen
    .getAllByRole("button")
    .filter(
      (b) =>
        b.getAttribute("aria-label")?.includes("20") &&
        !(b as HTMLButtonElement).disabled &&
        b.getAttribute("aria-pressed") !== null,
    );
  expect(enabled).toHaveLength(1);
  fireEvent.click(enabled[0]!);
}

describe("labels", () => {
  it("exist in both languages with exactly the keys the pages read", () => {
    for (const messages of [fa, en])
      expect(Object.keys(messages.site.booking).sort()).toEqual([...BOOKING_LABEL_KEYS].sort());
  });
});

describe("timeText", () => {
  it("writes the time with the reader's digits", () => {
    expect(timeText("09:05", "en")).toBe("09:05");
    expect(timeText("10:30", "fa")).toBe("۱۰:۳۰");
  });
});

describe("BookingFlow", () => {
  beforeEach(() => stub());

  it("offers only the days the server says are free, and the times of the chosen day", async () => {
    flow();
    await pickFirstFreeDay();
    expect(await screen.findByRole("button", { name: "10:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "11:30" })).toBeInTheDocument();
  });

  it("asks for the month on screen only, for the chosen kind of session", async () => {
    const calls = stub();
    flow();
    await waitFor(() => expect(calls.some((c) => c.url.includes("availability"))).toBe(true));
    expect(calls[0]!.url).toContain("type=studio");
    fireEvent.click(screen.getByRole("radio", { name: /On site/ }));
    await waitFor(() => expect(calls.at(-1)!.url).toContain("type=on-site"));
    fireEvent.click(screen.getByRole("button", { name: enLabels.nextMonth }));
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));
    const range = new URL(calls.at(-1)!.url, "http://x").searchParams;
    expect(range.get("from")! < range.get("to")!).toBe(true);
  });

  it("refuses to send without a time, a name and a way to be reached", async () => {
    const calls = stub();
    flow();
    fireEvent.click(screen.getByRole("button", { name: enLabels.submit }));
    const summary = await screen.findByText(enLabels.errorsTitle);
    const list = summary.parentElement!;
    expect(within(list).getByText(enLabels.errorNeedTime)).toBeInTheDocument();
    expect(within(list).getByText(enLabels.errorRequired)).toBeInTheDocument();
    expect(within(list).getByText(enLabels.errorContact)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("sends the booking and shows the confirmation with the link to follow it", async () => {
    const calls = stub({
      status: 201,
      body: {
        status: "pending",
        date: "2026-10-20",
        time: "10:00",
        session_label: "Studio",
        link: "https://3evda.com/en/b/abc_def",
      },
    });
    flow();
    await pickFirstFreeDay();
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    fireEvent.change(screen.getByLabelText(enLabels.name), { target: { value: "  Sara " } });
    fireEvent.change(screen.getByLabelText(enLabels.phone), { target: { value: "0912" } });
    fireEvent.click(screen.getByRole("button", { name: enLabels.submit }));

    expect(await screen.findByText(enLabels.thanksTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: enLabels.statusLink })).toHaveAttribute("href", "/en/b/abc_def");
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({
      type: "studio",
      time: "10:00",
      language: "en",
      name: "Sara",
      phone: "0912",
      website: "",
    });
    expect(post.body!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("shows a plain thank-you, and does not fall over, when the answer has no details (a trapped bot)", async () => {
    stub({ status: 201, body: { status: "pending" } });
    flow();
    await pickFirstFreeDay();
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    fireEvent.change(screen.getByLabelText(enLabels.name), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText(enLabels.phone), { target: { value: "0912" } });
    fireEvent.click(screen.getByRole("button", { name: enLabels.submit }));
    expect(await screen.findByText(enLabels.thanksTitle)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: enLabels.statusLink })).not.toBeInTheDocument();
  });

  it("accepts a real email when the phone is only blanks", async () => {
    const calls = stub({ status: 201, body: { status: "pending" } });
    flow();
    await pickFirstFreeDay();
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    fireEvent.change(screen.getByLabelText(enLabels.name), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText(enLabels.phone), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText(enLabels.email), { target: { value: "s@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: enLabels.submit }));
    expect(await screen.findByText(enLabels.thanksTitle)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ phone: "", email: "s@example.com" });
  });

  it("when the time was taken meanwhile, says so, forgets the time and reloads what is free", async () => {
    const calls = stub({
      status: 409,
      body: { code: "slot_taken", detail: "That time is no longer available; please choose another." },
    });
    flow();
    await pickFirstFreeDay();
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    fireEvent.change(screen.getByLabelText(enLabels.name), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText(enLabels.email), { target: { value: "s@example.com" } });
    const before = calls.filter((c) => c.url.includes("availability")).length;
    fireEvent.click(screen.getByRole("button", { name: enLabels.submit }));
    expect((await screen.findAllByText(/no longer available/)).length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(calls.filter((c) => c.url.includes("availability")).length).toBeGreaterThan(before),
    );
    expect(screen.getByRole("button", { name: "10:00" })).toHaveAttribute("aria-pressed", "false");
  });

  it("says when it is too busy or the network fails", async () => {
    stub({ status: 429, body: {} });
    flow();
    await pickFirstFreeDay();
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    fireEvent.change(screen.getByLabelText(enLabels.name), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText(enLabels.phone), { target: { value: "0912" } });
    fireEvent.click(screen.getByRole("button", { name: enLabels.submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(enLabels.errorRate);
  });

  it("is Persian with Jalali months for fa", async () => {
    flow("fa");
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(/۱۴۰[۰-۹]/);
    expect(screen.getByRole("radio", { name: /استودیو/ })).toBeChecked();
  });
});

const booking = (extra: Partial<PublicBooking> = {}): PublicBooking => ({
  status: "pending",
  language: "en",
  session_label: "Studio",
  date: "2026-10-20",
  time: "10:00",
  end_time: "11:00",
  name: "Sara",
  package_label: "",
  cancelled_by: "",
  can_cancel: true,
  ...extra,
});

describe("BookingStatus", () => {
  beforeEach(() => vi.spyOn(window, "confirm").mockReturnValue(true));

  const view = (b = booking()) =>
    render(<BookingStatus initial={b} token="abc_def" locale="en" labels={enLabels} />);

  it("shows the state and the time, with a cancel button while it can be cancelled", () => {
    view();
    expect(screen.getByText(enLabels.pendingTitle)).toBeInTheDocument();
    expect(screen.getByText(/10:00–11:00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: enLabels.cancel })).toBeInTheDocument();
  });

  it("cancels once confirmed by the customer and then offers a new booking", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return new Response(
        JSON.stringify(booking({ status: "cancelled", cancelled_by: "customer", can_cancel: false })),
        { status: 200 },
      );
    });
    view(booking({ status: "confirmed" }));
    fireEvent.click(screen.getByRole("button", { name: enLabels.cancel }));
    expect(await screen.findByText(enLabels.cancelledByYouTitle)).toBeInTheDocument();
    expect(calls).toEqual(["POST /api/public/bookings/abc_def/cancel"]);
    expect(screen.queryByRole("button", { name: enLabels.cancel })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: enLabels.bookAgain })).toHaveAttribute("href", "/en/book");
  });

  it("does not cancel when the customer declines the question", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return new Response("{}");
    });
    view();
    fireEvent.click(screen.getByRole("button", { name: enLabels.cancel }));
    expect(calls).toHaveLength(0);
  });

  it("when it is too late, says so and shows the real state", async () => {
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ code: "too_late" }), { status: 409 })
        : new Response(JSON.stringify(booking({ can_cancel: false })), { status: 200 }),
    );
    view();
    fireEvent.click(screen.getByRole("button", { name: enLabels.cancel }));
    expect(await screen.findByRole("alert")).toHaveTextContent(enLabels.errorTooLate);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: enLabels.cancel })).not.toBeInTheDocument(),
    );
  });

  it("shows confirmed, completed and owner-cancelled states", () => {
    for (const [status, title, cancelled_by] of [
      ["confirmed", enLabels.confirmedTitle, ""],
      ["completed", enLabels.completedTitle, ""],
      ["cancelled", enLabels.cancelledByAdminTitle, "admin"],
    ] as const) {
      const { unmount } = view(booking({ status, cancelled_by, can_cancel: false }));
      expect(screen.getByText(title)).toBeInTheDocument();
      unmount();
    }
  });
});
