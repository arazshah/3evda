import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fa from "../../../messages/fa.json";
import en from "../../../messages/en.json";
import { trackingCode } from "@/lib/site/tracking-code";
import { ErrorPanel } from "./ErrorPanel";

afterEach(cleanup);

const doc = (content?: string) => ({
  querySelector: () => (content === undefined ? null : { getAttribute: () => content }),
});

describe("tracking code", () => {
  it("is the gateway's request id from the page", () => {
    expect(trackingCode({ digest: "d1" }, doc("8f3e2c1a9b7d4e5f8a6b3c2d1e0f9a8b"))).toBe(
      "8f3e2c1a9b7d4e5f8a6b3c2d1e0f9a8b",
    );
  });

  it("falls back to the error's digest", () => {
    expect(trackingCode({ digest: "1234567890" }, doc())).toBe("1234567890");
    expect(trackingCode({ digest: "1234567890" }, null)).toBe("1234567890");
  });

  it("is empty when there is nothing to quote", () => {
    expect(trackingCode({}, doc())).toBe("");
  });

  it("never shows anything that is not a plain id", () => {
    expect(trackingCode({ digest: "ok" }, doc('"><script>alert(1)</script>'))).toBe("ok");
    expect(trackingCode({ digest: "bad id" }, doc("x".repeat(65)))).toBe("");
  });
});

describe("ErrorPanel", () => {
  const labels = (m: typeof fa) => m.errorPage;

  it("shows the code, offers a retry and a way home (Persian)", () => {
    const retry = vi.fn();
    render(<ErrorPanel labels={labels(fa)} code="abc123" onRetry={retry} />);
    expect(screen.getByRole("heading", { name: "مشکلی پیش آمد" })).toBeInTheDocument();
    expect(screen.getByText("abc123")).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("کد پیگیری:")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "بازگشت به خانه" })).toHaveAttribute("href", "/");
  });

  it("is available in English with its own home link", () => {
    render(<ErrorPanel labels={labels(en as unknown as typeof fa)} code="abc123" onRetry={() => {}} />);
    expect(screen.getByText("Tracking code:", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/en");
  });

  it("leaves out the code line when there is no code", () => {
    render(<ErrorPanel labels={labels(fa)} code="" onRetry={() => {}} />);
    expect(screen.queryByText("کد پیگیری:")).not.toBeInTheDocument();
  });
});
