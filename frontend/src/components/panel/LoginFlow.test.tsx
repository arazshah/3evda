import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { LoginFlow } from "./LoginFlow";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const user = { username: "owner", display_name: "" };
let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  replace.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

async function renderFlow(routes: Parameters<typeof fakeApi>[0]) {
  api = fakeApi([{ method: "GET", path: "/api/auth/csrf", status: 204 }, ...routes]);
  vi.stubGlobal("fetch", api.fetchImpl);
  renderWithQuery(<LoginFlow />);
}

describe("LoginFlow", () => {
  it("signs in with password and then a TOTP code", async () => {
    await renderFlow([
      { method: "GET", path: "/api/auth/me", body: { state: "anonymous", user: null } },
      { method: "POST", path: "/api/auth/login", body: { state: "otp_required", user } },
      { method: "POST", path: "/api/auth/verify", body: { state: "verified", user } },
    ]);

    fireEvent.change(await screen.findByLabelText("نام کاربری"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("رمز عبور"), { target: { value: "secret-password" } });
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));

    fireEvent.change(await screen.findByLabelText("کد"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "ورود" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/panel"));
    expect(api.calls.find((c) => c.path === "/api/auth/login")?.body).toEqual({
      username: "owner",
      password: "secret-password",
    });
    expect(api.calls.find((c) => c.path === "/api/auth/verify")?.body).toEqual({ code: "123456" });
  });

  it("shows the server's message when the password is wrong", async () => {
    await renderFlow([
      { method: "GET", path: "/api/auth/me", body: { state: "anonymous", user: null } },
      {
        method: "POST",
        path: "/api/auth/login",
        status: 400,
        body: { code: "invalid_credentials", detail: "نام کاربری یا رمز عبور درست نیست." },
      },
    ]);

    fireEvent.change(await screen.findByLabelText("نام کاربری"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("رمز عبور"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("نام کاربری یا رمز عبور درست نیست.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("enrols TOTP on first sign-in and shows the recovery codes once", async () => {
    const codes = Array.from({ length: 10 }, (_, i) => `code${i}abc`);
    await renderFlow([
      { method: "GET", path: "/api/auth/me", body: { state: "enrollment_required", user } },
      {
        method: "GET",
        path: "/api/auth/totp/setup",
        body: {
          otpauth_uri: "otpauth://totp/x",
          secret: "JBSWY3DPEHPK3PXP",
          qr_data_uri: "data:image/svg+xml,%3Csvg%2F%3E",
        },
      },
      { method: "POST", path: "/api/auth/totp/confirm", body: { recovery_codes: codes } },
      { method: "GET", path: "/api/auth/me", body: { state: "verified", user } },
    ]);

    expect(await screen.findByTestId("totp-secret")).toHaveTextContent("JBSWY3DPEHPK3PXP");
    expect(screen.getByRole("img", { name: "کد QR برای اپ احراز هویت" })).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/svg\+xml/),
    );
    fireEvent.change(screen.getByLabelText("کد ۶ رقمی"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "فعال‌سازی" }));

    const list = await screen.findByRole("list", { name: "کدهای بازیابی" });
    expect(list.querySelectorAll("li")).toHaveLength(10);
    expect(replace).not.toHaveBeenCalled(); // stays until the codes are acknowledged
    fireEvent.click(screen.getByRole("button", { name: "کدها را ذخیره کردم، ادامه" }));
    expect(replace).toHaveBeenCalledWith("/panel");
  });
});
