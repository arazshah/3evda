import { expect, test } from "./fixtures";

// The intro is for first-time visitors only, so this spec asks the fixture not to pre-set the "seen" cookie.
test.beforeEach(() => {
  test.info().annotations.push({ type: "show-splash" });
});

test("a first visit plays the intro once, then the site shows and it does not come back", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const intro = page.locator(".splash");
  await expect(intro).toBeVisible();
  // It is decorative: hidden from assistive technology, and the page behind it is already in the document.
  await expect(intro).toHaveAttribute("aria-hidden", "true");
  await expect(intro).toContainText("سودا رحیم‌پور");
  await expect(page.getByRole("heading", { level: 1 })).toBeAttached();

  // The curtain lifts by itself (the keyframes end in visibility: hidden).
  await expect(intro).toBeHidden({ timeout: 8_000 });

  // The script's only job: remember it. A reload and another page start without the intro.
  await expect
    .poll(async () =>
      (await context.cookies()).some((c) => c.name === "threevda_splash"),
    )
    .toBe(true);
  await page.reload();
  await expect(page.locator(".splash")).toHaveCount(0);
  await page.goto("/portfolio");
  await expect(page.locator(".splash")).toHaveCount(0);
});

test("with reduced motion the intro is skipped", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".splash")).toBeHidden();
});
