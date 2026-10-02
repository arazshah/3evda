import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fa from "../../messages/fa.json";
import { ComingSoon } from "./ComingSoon";

function renderIn(locale: "fa" | "en") {
  const messages = locale === "fa" ? fa : en;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ComingSoon />
    </NextIntlClientProvider>,
  );
}

describe("ComingSoon", () => {
  it("shows the photographer's name as the Persian page heading", () => {
    renderIn("fa");
    expect(screen.getByRole("heading", { level: 1, name: "سودا رحیم‌پور" })).toBeInTheDocument();
    expect(screen.getByText("نسخه جدید سایت به‌زودی منتشر می‌شود")).toBeInTheDocument();
  });

  it("shows the English heading and a link to the Instagram profile", () => {
    renderIn("en");
    expect(screen.getByRole("heading", { level: 1, name: "Sevda Rahimpour" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /instagram/i });
    expect(link).toHaveAttribute("href", "https://www.instagram.com/3evda.r/");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
