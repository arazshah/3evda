import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteForm, type QuoteLabels } from "./QuoteForm";
import type { QuoteOptions } from "@/lib/site/types";

const labels = {
  calculator: "Price estimate",
  service: "Service",
  quantity: "Number of products",
  extras: "Add-ons",
  options: "Options",
  estimateLabel: "Approximate estimate",
  estimateRange: "From {low} to {high} {toman}",
  estimateNote: "Rough only.",
  estimateUnavailable: "No estimate.",
  toman: "toman",
  details: "Contact details",
  detailsIntro: "At least one.",
  name: "Full name",
  brand: "Brand",
  phone: "Phone",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  email: "Email",
  message: "Details",
  messageHint: "Tell me.",
  attachments: "Attachments",
  attachmentsHint: "Up to 3.",
  selectedFiles: "Selected files",
  remove: "Remove {name}",
  submit: "Send request",
  sending: "Sending…",
  thanksTitle: "Received",
  thanksBody: "I will reply.",
  errorGeneric: "Sending failed.",
  errorRate: "Too many requests.",
  errorTooLarge: "Too large.",
  errorRequired: "Required.",
  errorQuantity: "Between {min} and {max}.",
  errorFileCount: "At most 3 files.",
  errorFileSize: "Under 10 MB.",
  errorFileType: "Images or PDF only.",
  errorsTitle: "Please fix the following",
} satisfies QuoteLabels; // fmt: skip

const options: QuoteOptions = {
  services: [
    { key: "food", label_fa: "غذا", label_en: "Food" },
    { key: "product", label_fa: "محصول", label_en: "Product" },
  ],
  addons: [{ key: "video", label_fa: "ویدیو", label_en: "Video" }],
  multipliers: [{ key: "urgent", label_fa: "فوری", label_en: "Rush" }],
  min_quantity: 1,
  max_quantity: 50,
};

type Call = { url: string; method: string; body: unknown };
let calls: Call[];

function stubFetch(handlers: Record<string, () => Response>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body =
        init?.body instanceof FormData ? init.body : init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method: init?.method ?? "GET", body });
      return (handlers[url] ?? (() => new Response("{}", { status: 404 })))();
    }),
  );
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// shouldAdvanceTime lets findBy*/waitFor poll while the debounce is still under the test's control.
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const settle = async (ms = 400) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("QuoteForm calculator", () => {
  it("asks the server for an estimate once the choices settle and shows the range", async () => {
    stubFetch({ "/api/public/quote/estimate": () => json({ low: 850000, high: 1150000 }) });
    render(<QuoteForm options={options} locale="en" labels={labels} />);

    fireEvent.change(screen.getByLabelText("Number of products"), { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText("Video"));
    await settle();

    expect(screen.getByTestId("estimate")).toHaveTextContent(/^From 850,000 to 1,150,000 toman$/);
    const estimates = calls.filter((c) => c.url.endsWith("/estimate"));
    expect(estimates).toHaveLength(1); // the intermediate edits did not each send a request
    expect(estimates[0]!.body).toEqual({ service: "food", quantity: 3, addons: ["video"], multipliers: [] });
  });

  it("hides an estimate that no longer matches the choices", async () => {
    stubFetch({ "/api/public/quote/estimate": () => json({ low: 1, high: 2 }) });
    render(<QuoteForm options={options} locale="en" labels={labels} />);
    await settle();
    expect(screen.getByTestId("estimate")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Rush")); // new choices, new estimate pending
    expect(screen.queryByTestId("estimate")).not.toBeInTheDocument();
    expect(screen.getByText("No estimate.")).toBeInTheDocument();
  });

  it("does not ask for an estimate when the quantity is outside the allowed range", async () => {
    stubFetch({ "/api/public/quote/estimate": () => json({ low: 1, high: 2 }) });
    render(<QuoteForm options={options} locale="en" labels={labels} />);
    await settle();
    const before = calls.length;
    fireEvent.change(screen.getByLabelText("Number of products"), { target: { value: "500" } });
    await settle();
    expect(calls.length).toBe(before);
    expect(screen.queryByTestId("estimate")).not.toBeInTheDocument();
  });

  it("shows Persian labels in the Persian site", () => {
    stubFetch({});
    render(<QuoteForm options={options} locale="fa" labels={labels} />);
    expect(screen.getByRole("option", { name: "غذا" })).toBeInTheDocument();
    expect(screen.getByLabelText("ویدیو")).toBeInTheDocument();
  });

  it("is only the contact form when no services are configured", () => {
    stubFetch({});
    render(<QuoteForm options={{ ...options, services: [] }} locale="en" labels={labels} />);
    expect(screen.queryByText("Price estimate")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
  });
});

async function fillAndSubmit(extra?: () => void) {
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ali" } });
  fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "09120000000" } });
  extra?.();
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));
  await settle(0);
}

describe("QuoteForm sending", () => {
  it("sends the choices and details as one multipart request and then thanks the visitor", async () => {
    stubFetch({
      "/api/public/quote/estimate": () => json({ low: 1, high: 2 }),
      "/api/public/inquiries": () => json({ received: true }, 201),
    });
    render(<QuoteForm options={options} locale="en" labels={labels} />);
    await fillAndSubmit(() => {
      fireEvent.change(screen.getByLabelText("Number of products"), { target: { value: "4" } });
      fireEvent.click(screen.getByLabelText("Video"));
      fireEvent.click(screen.getByLabelText("Rush"));
      fireEvent.change(screen.getByLabelText("Details"), { target: { value: "Hello" } });
    });

    const sent = calls.find((c) => c.url === "/api/public/inquiries")!;
    expect(sent.method).toBe("POST");
    const form = sent.body as FormData;
    expect(form.get("name")).toBe("Ali");
    expect(form.get("phone")).toBe("09120000000");
    expect(form.get("language")).toBe("en");
    expect(form.get("service")).toBe("food");
    expect(form.get("quantity")).toBe("4");
    expect(form.getAll("addons")).toEqual(["video"]);
    expect(form.getAll("multipliers")).toEqual(["urgent"]);
    expect(form.get("website")).toBe(""); // the honeypot stays empty for a person
    expect(await screen.findByText("Received")).toBeInTheDocument();
  });

  it("keeps the honeypot out of reach of keyboard and assistive technology users", () => {
    stubFetch({});
    const { container } = render(<QuoteForm options={options} locale="en" labels={labels} />);
    const trap = container.querySelector<HTMLInputElement>('input[name="website"]')!;
    expect(trap.tabIndex).toBe(-1);
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("asks for a name before sending anything", async () => {
    stubFetch({ "/api/public/quote/estimate": () => json({ low: 1, high: 2 }) });
    render(<QuoteForm options={options} locale="en" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await settle(0);
    expect(screen.getAllByText("Required.").length).toBeGreaterThan(0);
    expect(screen.getByText("Please fix the following").parentElement).toHaveFocus(); // the summary box
    expect(calls.some((c) => c.url === "/api/public/inquiries")).toBe(false);
  });

  it("shows what the server refused, next to the field", async () => {
    stubFetch({
      "/api/public/quote/estimate": () => json({ low: 1, high: 2 }),
      "/api/public/inquiries": () =>
        json(
          { code: "validation_error", detail: "bad", fields: { phone: ["Phone number is not valid."] } },
          400,
        ),
    });
    render(<QuoteForm options={options} locale="en" labels={labels} />);
    await fillAndSubmit();
    expect((await screen.findAllByText("Phone number is not valid.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Send request" })).toBeEnabled(); // can try again
  });

  it.each([
    [429, "Too many requests."],
    [413, "Too large."],
    [500, "Sending failed."],
  ])("explains a %s answer", async (status, message) => {
    stubFetch({
      "/api/public/quote/estimate": () => json({ low: 1, high: 2 }),
      "/api/public/inquiries": () => json({}, status),
    });
    render(<QuoteForm options={options} locale="en" labels={labels} />);
    await fillAndSubmit();
    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});

describe("QuoteForm attachments", () => {
  const input = () => screen.getByLabelText("Attachments") as HTMLInputElement;
  const pick = (...files: File[]) => fireEvent.change(input(), { target: { files } });
  const pdf = (name = "a.pdf") => new File(["%PDF-1.4"], name, { type: "application/pdf" });

  it("lists chosen files, lets one be removed, and sends them", async () => {
    stubFetch({
      "/api/public/quote/estimate": () => json({ low: 1, high: 2 }),
      "/api/public/inquiries": () => json({ received: true }, 201),
    });
    render(<QuoteForm options={options} locale="en" labels={labels} />);
    pick(pdf("one.pdf"), pdf("two.pdf"));
    expect(
      within(screen.getByRole("list", { name: "Selected files" })).getAllByRole("listitem"),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove one.pdf" }));
    await fillAndSubmit();

    const files = (calls.find((c) => c.url === "/api/public/inquiries")!.body as FormData).getAll(
      "attachments",
    );
    expect(files.map((f) => (f as File).name)).toEqual(["two.pdf"]);
  });

  it.each([
    ["too many", () => [pdf("1.pdf"), pdf("2.pdf"), pdf("3.pdf"), pdf("4.pdf")], "At most 3 files."],
    [
      "the wrong type",
      () => [new File(["x"], "a.exe", { type: "application/x-msdownload" })],
      "Images or PDF only.",
    ],
    [
      "too large",
      () => [new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" })],
      "Under 10 MB.",
    ],
  ])("refuses %s before anything is sent", async (_, make, message) => {
    stubFetch({ "/api/public/quote/estimate": () => json({ low: 1, high: 2 }) });
    render(<QuoteForm options={options} locale="en" labels={labels} />);
    pick(...make());
    expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);
    await fillAndSubmit();
    await waitFor(() => expect(calls.some((c) => c.url === "/api/public/inquiries")).toBe(false));
  });
});
