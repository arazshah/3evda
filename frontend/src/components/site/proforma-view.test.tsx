import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import { ProformaView } from "./ProformaView";
import { PROFORMA_LABEL_KEYS, type ProformaLabels } from "@/lib/site/proforma-labels";
import type { PublicProforma } from "@/lib/site/proforma-api";

afterEach(() => vi.unstubAllGlobals());

const labels = fa.site.proforma as ProformaLabels;

it("has every label in both languages", () => {
  for (const messages of [fa, en])
    expect(Object.keys(messages.site.proforma).sort()).toEqual([...PROFORMA_LABEL_KEYS].sort());
});
const TOKEN = "abc.def";
const BASE = `/api/public/proformas/${TOKEN}`;

const proforma = (extra: Partial<PublicProforma> = {}): PublicProforma => ({
  number: "3E-1405-0001",
  status: "sent",
  language: "fa",
  customer_name: "علی",
  customer_company: "کافه",
  items: [{ description: "عکاسی غذا", quantity: 2, unit_price: 1000000, line_total: 2000000 }],
  subtotal: 2000000,
  discount: 200000,
  discount_percent: "10.00",
  tax: 162000,
  tax_percent: "9.00",
  total: 1962000,
  terms: "پیش‌پرداخت ۵۰٪",
  issue_date: "2026-10-03",
  valid_until: "2026-10-17",
  issuer: { name: "سودا رحیم‌پور", phone: "0914", footer: "ارومیه" },
  rejection_reason: "",
  responded_at: null,
  ...extra,
});

type Call = { url: string; method: string; body?: unknown };
function stubFetch(answers: Record<string, { status?: number; body?: unknown }>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const answer = answers[`${method} ${url}`] ?? { status: 404 };
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status ?? 200,
    });
  });
  return calls;
}

const view = (p = proforma()) =>
  render(<ProformaView initial={p} token={TOKEN} locale="fa" labels={labels} />);

describe("ProformaView", () => {
  it("shows the lines, the totals and the terms", () => {
    stubFetch({ [`POST ${BASE}/seen`]: { body: proforma({ status: "viewed" }) } });
    view();
    expect(screen.getByRole("heading", { name: "پیش‌فاکتور" })).toBeInTheDocument();
    expect(screen.getByText("عکاسی غذا")).toBeInTheDocument();
    expect(screen.getByText(/۱٬۹۶۲٬۰۰۰ تومان/)).toBeInTheDocument();
    expect(screen.getByText("پیش‌پرداخت ۵۰٪")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "دانلود PDF" })).toHaveAttribute("href", `${BASE}/pdf`);
  });

  it("reports «seen» once, from the browser, only while the proforma is just sent", async () => {
    const calls = stubFetch({ [`POST ${BASE}/seen`]: { body: proforma({ status: "viewed" }) } });
    view();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "POST", url: `${BASE}/seen` });

    const again = stubFetch({});
    view(proforma({ status: "approved" }));
    expect(again).toHaveLength(0);
  });

  it("approves and then shows the confirmation instead of the buttons", async () => {
    const calls = stubFetch({
      [`POST ${BASE}/seen`]: { body: proforma({ status: "viewed" }) },
      [`POST ${BASE}/approve`]: { body: proforma({ status: "approved" }) },
    });
    view();
    fireEvent.click(screen.getByRole("button", { name: "تأیید پیش‌فاکتور" }));
    expect(await screen.findByText("پیش‌فاکتور تأیید شد")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تأیید پیش‌فاکتور" })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url === `${BASE}/approve`)).toBe(true);
  });

  it("rejects with a reason", async () => {
    const calls = stubFetch({
      [`POST ${BASE}/seen`]: { body: proforma({ status: "viewed" }) },
      [`POST ${BASE}/reject`]: { body: proforma({ status: "rejected", rejection_reason: "گران است" }) },
    });
    view();
    fireEvent.click(screen.getByRole("button", { name: "رد پیش‌فاکتور" }));
    fireEvent.change(screen.getByLabelText("دلیل (اختیاری)"), { target: { value: " گران است " } });
    fireEvent.click(screen.getByRole("button", { name: "ثبت رد" }));
    expect(await screen.findByText("پیش‌فاکتور رد شد")).toBeInTheDocument();
    expect(screen.getByText("گران است")).toBeInTheDocument();
    expect(calls.find((c) => c.url === `${BASE}/reject`)!.body).toEqual({ reason: "گران است" });
  });

  it("when the answer is refused (409) it shows the real state, e.g. expired", async () => {
    stubFetch({
      [`POST ${BASE}/seen`]: { body: proforma({ status: "viewed" }) },
      [`POST ${BASE}/approve`]: { status: 409, body: { code: "expired", detail: "x" } },
      [`GET ${BASE}`]: { body: proforma({ status: "expired" }) },
    });
    view();
    fireEvent.click(screen.getByRole("button", { name: "تأیید پیش‌فاکتور" }));
    expect(await screen.findByText("مهلت این پیش‌فاکتور تمام شده است")).toBeInTheDocument();
  });

  it("says so when the rate limit is hit or the network fails", async () => {
    stubFetch({ [`POST ${BASE}/seen`]: { status: 500 }, [`POST ${BASE}/approve`]: { status: 429 } });
    view();
    fireEvent.click(screen.getByRole("button", { name: "تأیید پیش‌فاکتور" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("درخواست‌ها زیاد بود");
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    fireEvent.click(screen.getByRole("button", { name: "تأیید پیش‌فاکتور" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ثبت پاسخ انجام نشد"));
  });

  it("offers no decision on a replaced, cancelled or expired proforma", () => {
    stubFetch({});
    for (const status of ["superseded", "cancelled", "expired"]) {
      const { unmount } = view(proforma({ status }));
      expect(screen.queryByRole("button", { name: "تأیید پیش‌فاکتور" })).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toBeInTheDocument();
      unmount();
    }
  });
});
