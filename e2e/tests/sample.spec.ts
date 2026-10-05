import AxeBuilder from "@axe-core/playwright";
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { OWNER_TOTP_FILE } from "./owner";
import { totp } from "./totp";

const USERNAME = process.env.E2E_ADMIN_USER ?? "e2e-admin";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

// Sample content fills and then empties the whole public site, so this spec runs alone, after every other one
// (the `sample` project in playwright.config.ts depends on the desktop and mobile projects).
test.skip(!PASSWORD, "E2E_ADMIN_PASSWORD is not set");

test("one click fills the whole site with sample content and one click takes it away", async ({
  page,
}) => {
  test.setTimeout(600_000); // about 60 pictures are drawn and processed by the worker
  test.skip(
    !existsSync(OWNER_TOTP_FILE),
    "the panel journey did not enrol the owner",
  );
  const secret = readFileSync(OWNER_TOTP_FILE, "utf8").trim();

  await page.goto("/panel/login");
  await page.getByLabel("نام کاربری").fill(USERNAME);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.getByLabel("کد", { exact: true }).fill(totp(secret));
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByRole("heading", { name: "داشبورد" })).toBeVisible();

  await page.goto("/panel/sample-content");
  await expect(page.getByRole("status").first()).toHaveText("بارگذاری نشده");
  await page.getByRole("button", { name: "بارگذاری محتوای نمونه" }).click();
  await expect(page.getByRole("status").first()).toHaveText("بارگذاری‌شده", {
    timeout: 420_000,
  });

  // What visitors see.
  await page.goto("/portfolio");
  await expect(
    page.getByRole("link", { name: /منوی کافه‌ی گیلاس/ }),
  ).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "طعم را دیدنی می‌کنیم",
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `/ with sample content — ${v.id}: ${v.help}`),
  ).toEqual([]);
  await page.goto("/en/blog");
  await expect(
    page.getByText("Why window light is a food photo's best friend").first(),
  ).toBeVisible();

  // And away again: the panel page refreshes the public cache itself when the cleanup is done.
  await page.goto("/panel/sample-content");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "پاک‌کردن همه‌ی محتوای نمونه" })
    .click();
  await expect(page.getByRole("status").first()).toHaveText("بارگذاری نشده", {
    timeout: 180_000,
  });
  await page.goto("/portfolio");
  await expect(
    page.getByRole("link", { name: /منوی کافه‌ی گیلاس/ }),
  ).toHaveCount(0);
});
