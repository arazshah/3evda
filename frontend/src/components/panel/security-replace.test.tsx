import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { SecuritySettings } from "./SecuritySettings";

afterEach(() => vi.unstubAllGlobals());

const setup = {
  otpauth_uri: "otpauth://totp/x",
  secret: "JBSWY3DPEHPK3PXP",
  qr_data_uri: "data:image/svg+xml;base64,AAAA",
};

describe("replacing the authenticator", () => {
  it("asks for the password, shows the new QR, then takes a code and shows fresh recovery codes", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/auth/two-factor", body: { enabled: true } },
      { method: "POST", path: "/api/auth/totp/replace/start", body: setup },
      {
        method: "POST",
        path: "/api/auth/totp/replace/confirm",
        body: { recovery_codes: ["AAAA1111", "BBBB2222"] },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<SecuritySettings />);

    const card = screen.getByRole("heading", { name: "ثبت دوباره‌ی ورود دومرحله‌ای" }).closest("section")!;
    const password = card.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(password, { target: { value: "a-long-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "شروع" }));

    expect(await screen.findByAltText("کد QR برای اپ احراز هویت")).toHaveAttribute("src", setup.qr_data_uri);
    expect(screen.getByText(setup.secret)).toBeInTheDocument();
    expect(api.calls[1]?.body).toEqual({ password: "a-long-password-123" });

    fireEvent.change(screen.getByLabelText("کد ۶ رقمی از اپ"), { target: { value: "123 456" } });
    fireEvent.click(screen.getByRole("button", { name: "تأیید و جایگزینی" }));

    expect(await screen.findByText(/اپ جدید ثبت شد/)).toBeInTheDocument();
    expect(api.calls[2]?.body).toEqual({ code: "123456" });
    expect(screen.getByRole("list", { name: "کدهای بازیابی" })).toHaveTextContent("AAAA1111");
  });

  it("shows the server's message for a wrong password and stays on the first step", async () => {
    vi.stubGlobal(
      "fetch",
      fakeApi([
        {
          method: "POST",
          path: "/api/auth/totp/replace/start",
          status: 400,
          body: { code: "invalid_credentials", detail: "رمز عبور درست نیست." },
        },
      ]).fetchImpl,
    );
    renderWithQuery(<SecuritySettings />);
    const card = screen.getByRole("heading", { name: "ثبت دوباره‌ی ورود دومرحله‌ای" }).closest("section")!;
    fireEvent.change(card.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: "wrong-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "شروع" }));
    expect(await screen.findByText("رمز عبور درست نیست.")).toBeInTheDocument();
    expect(screen.queryByAltText("کد QR برای اپ احراز هویت")).not.toBeInTheDocument();
  });
});

describe("two-step sign-in switch", () => {
  it("shows it as off and turns it on with the password", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/auth/two-factor", body: { enabled: false } },
      { method: "POST", path: "/api/auth/two-factor", body: { enabled: true } },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<SecuritySettings />);

    expect(await screen.findByText(/غیرفعال است/)).toBeInTheDocument();
    const card = screen.getByRole("heading", { name: "ورود دومرحله‌ای" }).closest("section")!;
    fireEvent.change(card.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: "a-long-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "فعال‌سازی" }));

    expect(await screen.findByText(/فعال است/)).toBeInTheDocument();
    expect(api.calls[1]?.body).toEqual({ enabled: true, password: "a-long-password-123" });
  });
});
