import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, expectNoHorizontalOverflow, test } from "./fixtures";
import { totp } from "./totp";

const USERNAME = process.env.E2E_ADMIN_USER ?? "e2e-admin";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const PHOTO = new URL("../fixtures/photo-with-gps.jpg", import.meta.url).pathname;
const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

async function expectNoSeriousViolations(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where} — ${v.id}: ${v.help}`)).toEqual([]);
}

// The owner account is enrolled once, so the whole journey runs serially in one project.
test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "the sign-in journey runs once, on desktop");
test.skip(!PASSWORD, "E2E_ADMIN_PASSWORD is not set");

test("panel requires sign-in", async ({ page }) => {
  await page.goto("/panel/media");
  await expect(page).toHaveURL(/\/panel\/login$/);
  await expect(page.getByRole("heading", { name: "ورود به پنل" })).toBeVisible();
});

test("admin APIs refuse anonymous visitors", async ({ request }) => {
  expect((await request.get("/api/admin/media/")).status()).toBe(403);
  expect((await request.get("/api/schema/")).status()).toBe(403);
});

test("owner enrols TOTP, uploads a photo and manages it", async ({ page, request }) => {
  test.setTimeout(120_000); // one long journey: sign-in, media, site content, portfolio
  await page.goto("/panel/login");
  await page.getByLabel("نام کاربری").fill(USERNAME);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ادامه" }).click();

  // First sign-in: enrol the authenticator.
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await expect(page.getByRole("img", { name: "کد QR برای اپ احراز هویت" })).toBeVisible();
  await page.getByLabel("کد ۶ رقمی").fill(totp(secret));
  await page.getByRole("button", { name: "فعال‌سازی" }).click();
  await expect(page.getByRole("list", { name: "کدهای بازیابی" }).getByRole("listitem")).toHaveCount(10);
  await page.getByRole("button", { name: "کدها را ذخیره کردم، ادامه" }).click();
  await expect(page.getByRole("heading", { name: "داشبورد" })).toBeVisible();

  // Upload through the library.
  await page.getByRole("link", { name: "کتابخانه رسانه" }).click();
  await page.getByLabel("انتخاب فایل برای آپلود").setInputFiles(PHOTO);
  await expect(page.getByRole("list", { name: "صف آپلود" })).toContainText("آپلود شد");
  const tile = page.getByRole("list", { name: "فایل‌ها" }).getByRole("button", { name: /photo-with-gps\.jpg/ });
  await expect(tile).toBeVisible();
  await expect(tile.locator("img")).toBeVisible({ timeout: 30_000 }); // processed by the worker
  await expectNoHorizontalOverflow(page);

  // Public variant: WebP, cacheable, and stripped of the camera's metadata.
  const listing = await (await page.request.get("/api/admin/media/?q=photo-with-gps")).json();
  const asset = listing.results[0];
  expect(asset.status).toBe("ready");
  const variant = asset.variants.find((v: { format: string }) => v.format === "webp");
  const served = await request.get(variant.url);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/webp");
  expect(served.headers()["cache-control"]).toContain("immutable");
  expect((await served.body()).includes("TestCamera")).toBe(false);

  // Edit alt texts in the detail dialog.
  await tile.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("متن جایگزین فارسی").fill("قهوه در فنجان سفالی");
  await dialog.getByLabel("متن جایگزین انگلیسی").fill("Coffee in a clay cup");
  await dialog.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(dialog.getByText("ذخیره شد.")).toBeVisible();

  // The private original downloads unchanged for the owner only.
  const download = await page.request.get(`/api/admin/media/${asset.id}/original/`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain("attachment");
  expect(sha256(await download.body())).toBe(sha256(readFileSync(PHOTO)));
  expect((await request.get(`/api/admin/media/${asset.id}/original/`)).status()).toBe(403);

  // Delete it again.
  page.once("dialog", (confirm) => confirm.accept());
  await dialog.getByRole("button", { name: "حذف" }).click();
  await expect(tile).toHaveCount(0);

  // Edit a text block in the panel and see it on the public site at once (the panel revalidates the cache).
  const original = "پروژه‌ی بعدی‌تان را شروع کنیم";
  const edited = "عنوان ویرایش‌شده از پنل";
  await page.goto("/panel/content");
  const block = page.getByRole("form", { name: "دعوت پایانی: عنوان" });
  await block.getByLabel("فارسی").fill(edited);
  await block.getByRole("button", { name: "ذخیره" }).click();
  await expect(block.getByText("ذخیره شد.")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: edited })).toBeVisible();

  // Put the default back so other specs see the seeded text.
  await page.goto("/panel/content");
  await block.getByLabel("فارسی").fill(original);
  await block.getByRole("button", { name: "ذخیره" }).click();
  await expect(block.getByText("ذخیره شد.")).toBeVisible();

  // Portfolio journey: create a category and a project in the panel, see them on the site,
  // rename the project, then delete both again.
  const acceptNextDialog = () => page.once("dialog", (d) => d.accept());
  await page.goto("/panel/categories");
  await page.getByRole("button", { name: "افزودن دسته" }).click();
  await page.getByLabel("نام دسته (فارسی)").fill("دسته‌ی آزمایشی");
  await page.getByLabel("نام دسته (English)").fill("E2E category");
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  // The editor closes only after the save finished and the public cache was refreshed.
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("list", { name: "دسته‌ها" })).toContainText("دسته‌ی آزمایشی");

  await page.goto("/panel/projects");
  await page.getByRole("button", { name: "افزودن پروژه" }).click();
  await page.getByLabel("عنوان (فارسی)").fill("پروژه‌ی آزمایشی");
  await page.getByLabel("عنوان (English)").fill("E2E project");
  await page.getByRole("combobox", { name: /^دسته/ }).selectOption({ label: "دسته‌ی آزمایشی" });
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  // The editor closes only after the save finished and the public cache was refreshed.
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("list", { name: "پروژه‌ها" })).toContainText("پروژه‌ی آزمایشی");

  await page.goto("/portfolio");
  await expect(page.getByRole("button", { name: "دسته‌ی آزمایشی" })).toBeVisible();
  await page.getByRole("link", { name: "پروژه‌ی آزمایشی" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "پروژه‌ی آزمایشی" })).toBeVisible();

  await page.goto("/panel/projects");
  await page.getByRole("button", { name: "ویرایش پروژه‌ی آزمایشی" }).click();
  await page.getByLabel("عنوان (فارسی)").fill("پروژه‌ی ویرایش‌شده");
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  // The editor closes only after the save finished and the public cache was refreshed.
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("list", { name: "پروژه‌ها" })).toContainText("پروژه‌ی ویرایش‌شده");
  await page.goto("/portfolio");
  await expect(page.getByRole("link", { name: "پروژه‌ی ویرایش‌شده" })).toBeVisible();

  await page.goto("/panel/projects");
  acceptNextDialog();
  await page.getByRole("button", { name: "حذف پروژه‌ی ویرایش‌شده" }).click();
  await expect(page.getByRole("list", { name: "پروژه‌ها" })).toHaveCount(0);
  await page.goto("/panel/categories");
  acceptNextDialog();
  await page.getByRole("button", { name: "حذف دسته‌ی آزمایشی" }).click();
  await expect(page.getByRole("list", { name: "دسته‌ها" })).toHaveCount(0);
  await page.goto("/portfolio");
  await expect(page.getByRole("link", { name: "پروژه‌ی ویرایش‌شده" })).toHaveCount(0);

  // Packages journey: a group with a package in the panel, then on the public page, then removed.
  await page.goto("/panel/packages");
  await page.getByRole("button", { name: "افزودن گروه" }).click();
  await page.getByLabel("نام گروه (فارسی)").fill("گروه آزمایشی");
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("list", { name: "گروه‌های پکیج" })).toContainText("گروه آزمایشی");

  await page.getByRole("button", { name: "افزودن پکیج" }).click();
  await page.getByLabel("نام پکیج (فارسی)").fill("پکیج آزمایشی");
  await page.getByLabel("مبلغ (تومان)").fill("1500000");
  await page.getByRole("button", { name: "افزودن ویژگی" }).click();
  await page.getByLabel("ویژگی 1 (فارسی)").fill("پنج عکس");
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("list", { name: "پکیج‌ها" })).toContainText("پکیج آزمایشی");

  await page.goto("/packages");
  await expect(page.getByRole("heading", { level: 2, name: "گروه آزمایشی" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "پکیج آزمایشی" })).toBeVisible();
  await expect(page.getByText(/^از .+ تومان$/)).toBeVisible();
  await expect(page.getByText("پنج عکس")).toBeVisible();

  // Switch it to quote-only: the amount disappears from the public page.
  await page.goto("/panel/packages");
  await page.getByRole("button", { name: "ویرایش پکیج آزمایشی" }).click();
  await page.getByLabel("نوع قیمت").selectOption("inquiry");
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/packages");
  await expect(page.getByText(/^از .+ تومان$/)).toHaveCount(0);
  await expect(page.getByText("استعلام بگیرید", { exact: true })).toBeVisible();

  await page.goto("/panel/packages");
  acceptNextDialog();
  await page.getByRole("button", { name: "حذف پکیج آزمایشی" }).click();
  await expect(page.getByRole("list", { name: "پکیج‌ها" })).toHaveCount(0);
  acceptNextDialog();
  await page.getByRole("button", { name: "حذف گروه آزمایشی" }).click();
  await expect(page.getByRole("list", { name: "گروه‌های پکیج" })).toHaveCount(0);
  await page.goto("/packages");
  await expect(page.getByRole("heading", { level: 2, name: "گروه آزمایشی" })).toHaveCount(0);

  // Price calculator: a base-price rule drives the public estimate, which is a range and never shows the rule.
  await page.goto("/panel/pricing");
  await page.getByRole("button", { name: "افزودن قاعده" }).click();
  const ruleDialog = page.getByRole("dialog");
  await ruleDialog.getByLabel("عنوان در سایت (فارسی)").fill("خدمت آزمایشی");
  await ruleDialog.getByLabel("شناسه (انگلیسی)").fill("e2e-service");
  await ruleDialog.getByLabel("مبلغ (تومان)").fill("1000000");
  await ruleDialog.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.getByRole("list", { name: "قواعد قیمت" })).toContainText("خدمت آزمایشی");
  await page.getByLabel("تعداد محصول", { exact: true }).fill("2");
  await page.getByRole("button", { name: "محاسبه" }).click();
  await expect(page.getByLabel("نتیجه‌ی برآورد")).toContainText("مبلغ دقیق محاسبه‌شده");
  const estimate = await page.request.post("/api/public/quote/estimate", {
    data: { service: "e2e-service", quantity: 2 },
  });
  expect(await estimate.json()).toEqual({ low: 1_700_000, high: 2_300_000, currency: "toman", approximate: true });
  const options = await (await page.request.get("/api/public/quote/options")).text();
  expect(options).toContain("e2e-service");
  expect(options).not.toContain("1000000");
  acceptNextDialog();
  await page.getByRole("button", { name: "حذف خدمت آزمایشی" }).click();
  // The sample rules seeded for CI stay, so only this test's rule has to be gone.
  await expect(page.getByRole("list", { name: "قواعد قیمت" })).not.toContainText("خدمت آزمایشی");

  // Journal: write an article in the rich-text editor, prove it was saved, preview it, translate it, remove it.
  await page.goto("/panel/articles/new?language=fa");
  await page.getByLabel("عنوان", { exact: true }).fill("مقاله‌ی آزمایشی");
  const editor = page.getByRole("textbox", { name: "متن مقاله" });
  await editor.click();
  await page.getByRole("button", { name: "تیتر 2" }).click();
  await page.keyboard.type("تیتر آزمایشی");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "پررنگ" }).click();
  await page.keyboard.type("متن پررنگ");
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.getByText("مقاله ساخته شد.")).toBeVisible();
  await page.reload();
  await expect(editor.locator("h2")).toHaveText("تیتر آزمایشی");
  await expect(editor.locator("strong")).toHaveText("متن پررنگ");

  // A draft is only visible through its preview link.
  const publicTitles = async () =>
    ((await (await page.request.get("/api/public/blog/articles?lang=fa")).json()).results as { title: string }[]).map(
      (a) => a.title,
    );
  expect(await publicTitles()).not.toContain("مقاله‌ی آزمایشی");
  await page.getByRole("button", { name: "لینک پیش‌نمایش" }).click();
  const previewUrl = await page.getByLabel("لینک پیش‌نمایش", { exact: true }).inputValue();
  const preview = await page.request.get(`/api/public/blog/preview/${previewUrl.split("/").pop()}`);
  expect(preview.status()).toBe(200);
  expect((await preview.json()).body_html).toContain("<h2>تیتر آزمایشی</h2>");

  // Publishing puts the article in the sitemap and the feed; renaming it keeps the old address working.
  const text = async (path: string) => (await page.request.get(path)).text();
  expect(await text("/sitemap.xml")).not.toContain("mazmoon-azmayeshi");
  await page.getByLabel("وضعیت").selectOption("published");
  await page.getByLabel("نشانی مقاله (اختیاری)").fill("mazmoon-azmayeshi");
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();
  expect(await text("/sitemap.xml")).toMatch(/<loc>[^<]+\/blog\/mazmoon-azmayeshi<\/loc>/);
  expect(await text("/rss.xml")).toContain("<title>مقاله‌ی آزمایشی</title>");

  await page.getByLabel("نشانی مقاله (اختیاری)").fill("mazmoon-jadid");
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();
  const moved = await page.request.get("/blog/mazmoon-azmayeshi", { maxRedirects: 0 });
  expect([301, 308]).toContain(moved.status());
  expect(moved.headers()["location"]).toContain("/blog/mazmoon-jadid");
  expect(await text("/sitemap.xml")).not.toContain("mazmoon-azmayeshi");
  expect(await text("/sitemap.xml")).toContain("/blog/mazmoon-jadid");

  await page.getByRole("button", { name: "ساخت نسخه‌ی English" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("English");
  await expect(page.getByRole("link", { name: "ویرایش نسخه‌ی فارسی" })).toBeVisible();

  await page.goto("/panel/articles");
  // Only this test's two articles: the sample articles seeded for CI stay.
  const mine = page.getByRole("list", { name: "مقاله‌ها" }).getByRole("listitem").filter({ hasText: "مقاله‌ی آزمایشی" });
  await expect(mine).toHaveCount(2);
  for (let remaining = 2; remaining > 0; remaining--) {
    acceptNextDialog();
    await page.getByRole("button", { name: "حذف مقاله‌ی آزمایشی" }).first().click();
    await expect(mine).toHaveCount(remaining - 1);
  }

  // The panel itself meets the same accessibility bar as the public site.
  for (const path of ["/panel", "/panel/content", "/panel/items", "/panel/projects", "/panel/categories", "/panel/packages", "/panel/pricing", "/panel/articles", "/panel/articles/new", "/panel/blog-taxonomy", "/panel/settings", "/panel/media"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expectNoSeriousViolations(page, path);
  }

  // Sign out (the button lives in the panel, and the journey above ended on a public page).
  await page.goto("/panel");
  await page.getByRole("button", { name: "خروج" }).first().click();
  await expect(page).toHaveURL(/\/panel\/login$/);
  expect((await page.request.get("/api/admin/media/")).status()).toBe(403);
});
