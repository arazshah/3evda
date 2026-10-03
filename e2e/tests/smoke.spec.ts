import AxeBuilder from "@axe-core/playwright";
import { expect, expectNoHorizontalOverflow, test } from "./fixtures";

const pages = [
  { path: "/", lang: "fa", dir: "rtl", heading: "سودا رحیم‌پور" },
  { path: "/en", lang: "en", dir: "ltr", heading: "Sevda Rahimpour" },
] as const;

for (const p of pages) {
  test.describe(`home ${p.lang}`, () => {
    test("renders the localized document", async ({ page }) => {
      const response = await page.goto(p.path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", p.lang);
      await expect(page.locator("html")).toHaveAttribute("dir", p.dir);
      await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });

    test("has no serious accessibility violations", async ({ page }) => {
      await page.goto(p.path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  });
}

test("language switch links between Persian and English", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await page.getByRole("link", { name: "فارسی" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
});

test("the /fa prefix permanently redirects to the canonical unprefixed URL", async ({ request }) => {
  const response = await request.get("/fa", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers()["location"]).toBe("/");
});

test("unknown pages return a localized 404", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("صفحه‌ای که دنبالش بودید پیدا نشد");
});
