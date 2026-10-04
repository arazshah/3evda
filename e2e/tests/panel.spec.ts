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

test("owner enrols TOTP, uploads a photo and manages it", async ({ page, request, browser }) => {
  test.setTimeout(180_000); // one long journey: sign-in, media, site content, portfolio, enquiries, proformas
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

  // Inquiries: a visitor sends one with a PDF; the owner finds it, reads it, follows it up, exports it and removes it.
  const visitor = `بازدیدکننده‌ی آزمایشی ${Date.now()}`;
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const sent = await page.request.post("/api/public/inquiries", {
    multipart: {
      name: visitor,
      phone: "09123334455",
      message: "منوی جدید کافه را می‌خواهیم عکاسی کنیم.",
      language: "fa",
      service: "sample-food",
      quantity: "4",
      attachments: { name: "brief.pdf", mimeType: "application/pdf", buffer: pdf },
    },
  });
  expect(sent.status()).toBe(201);

  await page.goto("/panel/inquiries");
  await page.getByLabel("جست‌وجو", { exact: true }).fill(visitor);
  const found = page.getByRole("list", { name: "استعلام‌ها" }).getByRole("listitem");
  await expect(found).toHaveCount(1);
  await expect(found.getByText("خوانده‌نشده")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "منوی پنل" }).getByText(/استعلام خوانده‌نشده/)).toBeVisible();

  await found.getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: visitor })).toBeVisible();
  await expect(page.getByRole("link", { name: "09123334455" })).toHaveAttribute("href", "tel:09123334455");
  await expect(page.getByText("منوی جدید کافه را می‌خواهیم عکاسی کنیم.")).toBeVisible();
  await expect(page.getByText(/از .+ تا .+ تومان/)).toBeVisible(); // the range the visitor was shown
  await expectNoSeriousViolations(page, "inquiry detail");

  // The attachment is private: the owner gets a short signed redirect and a download, not a page.
  const attachment = await page.getByRole("link", { name: /brief\.pdf/ }).getAttribute("href");
  const redirect = await page.request.get(attachment!, { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  const signed = redirect.headers()["location"]!;
  expect(signed).toMatch(/^\/storage-signed\//);
  const file = await page.request.get(signed);
  expect(file.status()).toBe(200);
  expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect(file.headers()["content-disposition"]).toContain("attachment");
  expect((await request.get(attachment!, { maxRedirects: 0 })).status()).toBe(403); // not for anyone else

  // Follow-up survives a reload.
  await page.getByLabel("وضعیت", { exact: true }).selectOption("reviewing");
  await page.getByLabel("یادداشت داخلی", { exact: true }).fill("تماس گرفتم؛ فردا پیش‌فاکتور می‌فرستم.");
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("وضعیت", { exact: true })).toHaveValue("reviewing");
  await expect(page.getByLabel("یادداشت داخلی", { exact: true })).toHaveValue("تماس گرفتم؛ فردا پیش‌فاکتور می‌فرستم.");
  await expect(page.getByRole("list", { name: "تاریخچه‌ی وضعیت" })).toContainText("در بررسی");

  // It is no longer unread, and the CSV has it.
  await page.goto("/panel/inquiries");
  await page.getByLabel("جست‌وجو", { exact: true }).fill(visitor);
  await expect(found).toHaveCount(1);
  await expect(found.getByText("خوانده‌نشده")).toHaveCount(0);
  const csv = await page.request.get(`/api/admin/inquiries/export/?q=${encodeURIComponent(visitor)}`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain(visitor);

  // Proforma: from the enquiry to the customer's approval.
  await page.goto("/panel/proformas/settings");
  await page.getByLabel("نام صادرکننده (فارسی)", { exact: true }).fill("استودیو آزمایشی");
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();

  await page.goto("/panel/inquiries");
  await page.getByLabel("جست‌وجو", { exact: true }).fill(visitor);
  await found.getByRole("link").click();
  await page.getByRole("button", { name: "ساخت پیش‌فاکتور" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "پیش‌نویس پیش‌فاکتور" })).toBeVisible();
  await expect(page.getByLabel("نام مشتری", { exact: true })).toHaveValue(visitor); // prefilled from the enquiry
  await page.getByLabel("شرح آیتم ۱", { exact: true }).fill("عکاسی منوی کافه");
  await page.getByLabel("قیمت واحد آیتم ۱ (تومان)", { exact: true }).fill("250000");
  await page.getByLabel("نوع تخفیف", { exact: true }).selectOption("percent");
  await page.getByLabel("درصد تخفیف", { exact: true }).fill("10");
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.getByText("ذخیره شد.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "جمع‌ها" })).toBeVisible();
  await expect(page.getByText(/۹۰۰٬۰۰۰ تومان/)).toBeVisible(); // 4 × 250,000 less 10%
  const draftUrl = page.url();
  expect((await page.request.get(draftUrl.replace("/panel/proformas/", "/api/admin/proformas/") + "/pdf/")).status()).toBe(200);

  acceptNextDialog();
  await page.getByRole("button", { name: "صدور", exact: true }).click();
  const link = await page.getByLabel("لینک عمومی", { exact: true }).inputValue();
  expect(link).toMatch(/\/p\/[0-9a-f]{32}_/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("3E-");
  await expectNoSeriousViolations(page, "issued proforma");
  const path = new URL(link).pathname;

  // The customer opens the link without signing in: reading changes nothing, the page then reports «seen».
  const guest = await browser.newContext({ baseURL: page.url().split("/panel")[0] });
  const customer = await guest.newPage();
  const seen = customer.waitForResponse((r) => r.url().endsWith("/seen") && r.request().method() === "POST");
  await customer.goto(path);
  await expect(customer.getByRole("heading", { level: 1, name: "پیش‌فاکتور" })).toBeVisible();
  expect((await seen).status()).toBe(200);
  await expect(customer.getByText("عکاسی منوی کافه")).toBeVisible();
  await expect(customer.getByText("استودیو آزمایشی")).toBeVisible();
  await expectNoSeriousViolations(customer, "public proforma");
  expect(await customer.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
  const token = path.split("/p/")[1]!;
  const pdfResponse = await guest.request.get(`/api/public/proformas/${token}/pdf`);
  expect(pdfResponse.status()).toBe(200);
  expect(pdfResponse.headers()["content-type"]).toBe("application/pdf");
  expect((await pdfResponse.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await guest.request.get(`/api/public/proformas/${token.slice(0, -3)}abc`)).status()).toBe(404); // forged signature

  await page.reload();
  await expect(page.getByText(/دیده‌شده · /)).toBeVisible();

  await customer.getByRole("button", { name: "تأیید پیش‌فاکتور" }).click();
  await expect(customer.getByText("پیش‌فاکتور تأیید شد")).toBeVisible();
  await customer.reload();
  await expect(customer.getByText("پیش‌فاکتور تأیید شد")).toBeVisible();
  await expect(customer.getByRole("button", { name: "رد پیش‌فاکتور" })).toHaveCount(0); // answered once

  await page.reload();
  await expect(page.getByText(/تأییدشده · /)).toBeVisible();
  await expect(page.getByRole("button", { name: "ساخت نسخه‌ی اصلاحی" })).toHaveCount(0);

  // A new link cancels the old one at once.
  acceptNextDialog();
  await page.getByRole("button", { name: "لینک تازه" }).click();
  await expect(page.getByText("لینک تازه ساخته شد.")).toBeVisible();
  expect((await customer.request.get(`/api/public/proformas/${token}`)).status()).toBe(404);
  await customer.goto(path);
  await expect(customer.getByText("صفحه‌ای که دنبالش بودید پیدا نشد")).toBeVisible();
  await guest.close();

  // The enquiry moved on by itself.
  await page.goto("/panel/inquiries");
  await page.getByLabel("جست‌وجو", { exact: true }).fill(visitor);
  await found.getByRole("link").click();
  await expect(page.getByLabel("وضعیت", { exact: true })).toHaveValue("proforma_sent");

  // Bookings: a visitor books, the owner is told, confirms; a manual booking from the enquiry; the visitor cancels.
  test.info().annotations.push({ type: "expected-http-error", description: "the second manual booking at the same time is refused with 409" });
  const bookedName = `Booking E2E ${Date.now()}`;
  const from = new Date();
  const until = new Date(from.getTime() + 40 * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const free = await (await page.request.get(`/api/public/booking/availability?type=studio&from=${iso(from)}&to=${iso(until)}`)).json();
  expect(free.days.length).toBeGreaterThan(0);
  // The last free time of the last free day: the booking test in smoke.spec takes the first, and runs at the same time.
  const lastDay = free.days.at(-1) as { date: string; times: string[] };
  const lastTime = lastDay.times.at(-1)!;
  const made = await page.request.post("/api/public/bookings", {
    data: { type: "studio", date: lastDay.date, time: lastTime, name: bookedName, phone: "09127778899", language: "en" },
  });
  expect(made.status()).toBe(201);
  const bookingLink = new URL((await made.json()).link).pathname;
  const clash = await page.request.post("/api/public/bookings", {
    data: { type: "studio", date: lastDay.date, time: lastTime, name: "Late", phone: "09120000000", language: "en" },
  });
  expect(clash.status()).toBe(409);
  expect((await clash.json()).detail).toContain("no longer available");

  await page.goto("/panel/booking");
  await expect(page.getByRole("navigation", { name: "منوی پنل" }).getByText(/رزرو در انتظار تأیید/)).toBeVisible();
  await page.getByRole("tab", { name: "فهرست" }).click();
  await page.getByLabel("جست‌وجو", { exact: true }).fill(bookedName);
  const bookingRow = page.getByRole("list", { name: "رزروها" }).getByRole("listitem");
  await expect(bookingRow).toHaveCount(1);
  await expect(bookingRow.getByText("جدید", { exact: true })).toBeVisible();
  await bookingRow.getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: bookedName })).toBeVisible();
  await expect(page.getByRole("link", { name: "09127778899" })).toHaveAttribute("href", "tel:09127778899");
  await expectNoSeriousViolations(page, "booking detail");
  await page.getByRole("button", { name: "تأیید رزرو" }).click();
  await expect(page.getByText("رزرو تأیید شد.")).toBeVisible();

  const visitorContext = await browser.newContext({ baseURL: page.url().split("/panel")[0] });
  const visitorPage = await visitorContext.newPage();
  await visitorPage.goto(bookingLink);
  await expect(visitorPage.getByText("Booking confirmed")).toBeVisible();

  // A manual booking made from the enquiry is filled in from it and links back to it.
  await page.goto("/panel/inquiries");
  await page.getByLabel("جست‌وجو", { exact: true }).fill(visitor);
  await found.getByRole("link").click();
  await page.getByRole("link", { name: "ساخت رزرو" }).click();
  await expect(page.getByLabel("نام مشتری", { exact: true })).toHaveValue(visitor);
  await page.getByRole("button", { name: "ثبت رزرو" }).click();
  await expect(page.getByRole("heading", { level: 1, name: visitor })).toBeVisible();
  await expect(page.getByRole("link", { name: "مشاهده" }).first()).toHaveAttribute("href", /\/panel\/inquiries\/\d+/);
  const manualUrl = page.url();
  // the same time again is refused with the server's reason
  await page.goto("/panel/booking/new");
  await page.getByLabel("نام مشتری", { exact: true }).fill("Overlap");
  await page.getByRole("button", { name: "ثبت رزرو" }).click();
  await expect(page.getByText(/این ساعت دیگر آزاد نیست/)).toBeVisible();
  await page.goto(manualUrl);
  acceptNextDialog();
  await page.getByRole("button", { name: "لغو رزرو" }).click();
  await expect(page.getByText("رزرو لغو شد.")).toBeVisible();

  // The visitor cancels theirs from the link; the owner sees who cancelled, and the time is free again.
  visitorPage.once("dialog", (d) => d.accept());
  await visitorPage.getByRole("button", { name: "Cancel booking" }).click();
  await expect(visitorPage.getByText("You cancelled this booking")).toBeVisible();
  await visitorContext.close();
  const freeAgain = await (await page.request.get(`/api/public/booking/availability?type=studio&from=${lastDay.date}&to=${lastDay.date}`)).json();
  expect(freeAgain.days[0].times).toContain(lastTime);
  await page.goto("/panel/booking");
  await page.getByRole("tab", { name: "فهرست" }).click();
  await page.getByLabel("جست‌وجو", { exact: true }).fill(bookedName);
  await expect(bookingRow).toHaveCount(1);
  await bookingRow.getByRole("link").click();
  await expect(page.getByText("توسط مشتری")).toBeVisible();

  // The enquiry moved on when the manual booking was made.
  await page.goto("/panel/inquiries");
  await page.getByLabel("جست‌وجو", { exact: true }).fill(visitor);
  await found.getByRole("link").click();
  await expect(page.getByLabel("وضعیت", { exact: true })).toHaveValue("converted");
  await expect(page.getByRole("list", { name: "رزروهای وصل‌شده" })).toBeVisible();

  // Deleting it removes the row and the stored file.
  await page.goto("/panel/inquiries");
  await page.getByLabel("جست‌وجو", { exact: true }).fill(visitor);
  await found.getByRole("link").click();
  acceptNextDialog();
  await page.getByRole("button", { name: "حذف استعلام" }).click();
  await expect(page).toHaveURL(/\/panel\/inquiries$/);
  await page.getByLabel("جست‌وجو", { exact: true }).fill(visitor);
  await expect(page.getByText("استعلامی با این فیلترها پیدا نشد.")).toBeVisible();
  expect((await page.request.get(signed)).status()).toBeGreaterThanOrEqual(400);

  // Booking settings: the sample week is there; the owner closes a few days and changes the daily limit.
  await page.goto("/panel/booking/settings");
  await expect(page.getByRole("heading", { level: 1, name: "تنظیمات رزرو" })).toBeVisible();
  await expect(page.getByRole("list", { name: "انواع جلسه" }).getByRole("listitem").first()).toBeVisible();
  await expect(page.getByLabel("از (شنبه)", { exact: true }).first()).toHaveValue("10:00");
  await expect(page.getByText("تعطیل", { exact: true })).toHaveCount(1); // Friday only
  await page.getByLabel("از تاریخ — ماه", { exact: true }).selectOption("12");
  await page.getByLabel("دلیل (فقط برای خودتان)", { exact: true }).fill("مسافرت آزمایشی");
  await page.getByRole("button", { name: "افزودن", exact: true }).click();
  await expect(page.getByText("روز بسته اضافه شد.")).toBeVisible();
  await expect(page.getByRole("list", { name: "روزهای بسته" })).toContainText("مسافرت آزمایشی");
  await page.reload();
  const closedRow = page.getByRole("list", { name: "روزهای بسته" }).getByRole("listitem").filter({ hasText: "مسافرت آزمایشی" });
  await expect(closedRow).toHaveCount(1);
  acceptNextDialog();
  await closedRow.getByRole("button", { name: /حذف روز بسته/ }).click();
  await expect(closedRow).toHaveCount(0);
  await page.getByLabel("حداکثر رزرو در یک روز", { exact: true }).fill("4");
  await page.getByRole("button", { name: "ذخیره‌ی سقف‌ها" }).click();
  await expect(page.getByText("سقف‌ها ذخیره شد.")).toBeVisible();
  await page.getByLabel("حداکثر رزرو در یک روز", { exact: true }).fill("3");
  await page.getByRole("button", { name: "ذخیره‌ی سقف‌ها" }).click();
  await expect(page.getByText("سقف‌ها ذخیره شد.")).toBeVisible();

  // Galleries: make one, upload a photo (previews are made by the worker), publish, then remove it with its files.
  await page.goto("/panel/galleries");
  await expectNoSeriousViolations(page, "galleries list");
  await page.getByRole("link", { name: "گالری جدید" }).click();
  await page.getByLabel("عنوان گالری", { exact: true }).fill("گالری آزمایشی");
  await page.getByLabel("نام مشتری", { exact: true }).fill("مشتری آزمایشی");
  await page.getByLabel("رمز گالری (اختیاری)").fill("راز-آزمایشی");
  await page.getByRole("button", { name: "ساخت گالری" }).click();
  await expect(page).toHaveURL(/\/panel\/galleries\/\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: "گالری آزمایشی" })).toBeVisible();
  await expect(page.getByRole("button", { name: "انتشار" })).toBeVisible();
  await page.getByLabel("انتخاب عکس برای آپلود در گالری").setInputFiles(PHOTO);
  const galleryPhotos = page.getByRole("list", { name: "عکس‌های گالری" });
  await expect(galleryPhotos.getByRole("listitem")).toHaveCount(1);
  // The thumbnail comes from the worker; once it is there it loads through the signed, short-lived address.
  const thumb = galleryPhotos.getByRole("img");
  await expect(thumb).toBeVisible({ timeout: 60_000 });
  const thumbSrc = (await thumb.getAttribute("src")) ?? "";
  expect(thumbSrc).toMatch(/^\/storage-signed\//);
  expect((await page.request.get(thumbSrc)).status()).toBe(200);
  expect((await page.request.get(thumbSrc.split("?")[0]!)).status()).toBeGreaterThanOrEqual(400); // unsigned: refused
  await page.getByLabel("انتخاب عکس برای آپلود در گالری").setInputFiles(PHOTO); // the same photo again
  await expect(page.getByText(/قبلاً در همین گالری بارگذاری شده/)).toBeVisible();
  await expectNoSeriousViolations(page, "gallery detail");
  await page.getByRole("button", { name: "انتشار" }).click();
  await expect(page.getByText(/گالری منتشر شد/)).toBeVisible();
  const galleryLink = await page.getByLabel("لینک گالری برای مشتری", { exact: true }).inputValue();
  expect(galleryLink).toMatch(/\/g\/[0-9a-f]{32}_[A-Za-z0-9_-]+$/);
  const galleryToken = galleryLink.split("/g/")[1]!;
  // The client's API: the link alone shows nothing; the password gives a token; the owner has nothing selected yet.
  const gallery = await (await page.request.get(`/api/public/galleries/${galleryToken}`)).json();
  expect(gallery).toMatchObject({ title: "گالری آزمایشی", has_password: true, status: "published" });
  expect((await page.request.get(`/api/public/galleries/${galleryToken}/photos`)).status()).toBe(401);
  expect((await page.request.post(`/api/public/galleries/${galleryToken}/unlock`, { data: { password: "اشتباه" } })).status()).toBe(403);

  // The client, on a phone in another browser: password, the photo, a choice with a note, a ZIP, and sending.
  const clientContext = await browser.newContext({
    baseURL: page.url().split("/panel")[0],
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const client = await clientContext.newPage();
  await client.goto(new URL(galleryLink).pathname);
  await expect(client.getByRole("heading", { name: "این گالری رمز دارد" })).toBeVisible();
  await expectNoSeriousViolations(client, "gallery password gate");
  await client.getByLabel("رمز گالری", { exact: true }).fill("اشتباه");
  await client.getByRole("button", { name: "باز کردن گالری" }).click();
  await expect(client.getByRole("alert").filter({ hasText: "رمز درست نیست." })).toBeVisible(); // not the route announcer
  await client.getByLabel("رمز گالری", { exact: true }).fill("راز-آزمایشی");
  await client.getByRole("button", { name: "باز کردن گالری" }).click();
  const clientPhotos = client.getByRole("list", { name: "عکس‌های گالری" });
  await expect(clientPhotos.getByRole("listitem")).toHaveCount(1);
  const clientThumb = clientPhotos.getByRole("img");
  await expect.poll(() => clientThumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expectNoSeriousViolations(client, "client gallery");
  await expectNoHorizontalOverflow(client);

  await clientPhotos.getByRole("button", { name: /نمایش بزرگ/ }).click();
  const lightbox = client.getByRole("dialog", { name: "نمایش بزرگ عکس" });
  await expect(lightbox.getByRole("img")).toBeVisible();
  await lightbox.getByRole("button", { name: /^انتخاب / }).click();
  await expect(lightbox.getByRole("button", { name: /^برداشتن انتخاب / })).toBeVisible();
  await lightbox.getByLabel("توضیح برای این عکس").fill("رنگ‌ها گرم‌تر شود");
  await lightbox.getByRole("button", { name: "ذخیره‌ی توضیح" }).click();
  await expect(lightbox.getByText("توضیح ذخیره شد.")).toBeVisible();
  await expectNoSeriousViolations(client, "client lightbox");
  await client.keyboard.press("Escape");
  await expect(lightbox).toBeHidden();
  await expect(client.getByText("۱ عکس انتخاب شده")).toBeVisible();

  // The ZIP is made by the worker; what comes down is a real archive.
  const [archive] = await Promise.all([
    client.waitForEvent("download", { timeout: 90_000 }),
    client.getByRole("button", { name: "دانلود همه به‌صورت ZIP" }).click(),
  ]);
  expect(archive.suggestedFilename()).toMatch(/\.zip$/);
  expect(readFileSync((await archive.path())!).subarray(0, 2).toString()).toBe("PK");

  client.once("dialog", (d) => d.accept());
  await client.getByRole("button", { name: "ارسال انتخاب نهایی" }).click();
  await expect(client.getByText("انتخاب شما ارسال شد")).toBeVisible();
  await expect(client.getByRole("button", { name: /^برداشتن انتخاب / })).toBeDisabled();
  await client.reload(); // a reload keeps the unlocked session and shows the locked state
  await expect(client.getByText("انتخاب شما ارسال شد")).toBeVisible();
  await clientContext.close();

  // The owner sees the choice, the note and the file names to paste into Lightroom, and the download in the log.
  await page.goto("/panel/galleries");
  await expect(page.getByRole("list", { name: "گالری‌ها" }).getByText("نهایی‌شده")).toBeVisible();
  await page.getByRole("link", { name: /گالری آزمایشی/ }).click();
  await expect(page.getByText(/۱ انتخاب از ۱ عکس/)).toBeVisible();
  await expect(page.getByLabel("نام فایل‌های انتخاب‌شده برای Lightroom")).toHaveValue("photo-with-gps");
  await expect(page.getByRole("list", { name: "انتخاب‌ها" })).toContainText("رنگ‌ها گرم‌تر شود");
  await expect(page.getByRole("list", { name: "لاگ دانلود" })).toContainText("ZIP");
  await page.getByRole("button", { name: "بازکردن دوباره برای مشتری" }).click();
  await expect(page.getByText(/دوباره باز شد/)).toBeVisible();
  acceptNextDialog();
  await page.getByRole("button", { name: "حذف گالری" }).click();
  await expect(page).toHaveURL(/\/panel\/galleries$/);
  await expect(page.getByText("هنوز گالری‌ای نساخته‌اید.")).toBeVisible();
  expect((await page.request.get(`/api/public/galleries/${galleryToken}`)).status()).toBe(404);

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
  for (const path of ["/panel", "/panel/content", "/panel/items", "/panel/projects", "/panel/categories", "/panel/packages", "/panel/pricing", "/panel/inquiries", "/panel/proformas", "/panel/proformas/new", "/panel/proformas/settings", "/panel/booking", "/panel/booking/new", "/panel/booking/settings", "/panel/articles", "/panel/articles/new", "/panel/blog-taxonomy", "/panel/settings", "/panel/media"]) {
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
