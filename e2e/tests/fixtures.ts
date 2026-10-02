import { test as base, expect, type Page } from "@playwright/test";

/**
 * Fails the test if the page logs console errors, or a same-origin sub-resource fails or returns >= 400.
 * (The document itself may legitimately be a 404; tests assert that status explicitly.)
 */
export const test = base.extend<{ page: Page }>({
  page: async ({ page, baseURL }, use) => {
    const problems: string[] = [];
    page.on("console", (msg) => {
      // Resource errors are reported with their URL by the response listener below.
      if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) {
        problems.push(`console: ${msg.text()}`);
      }
    });
    page.on("response", (res) => {
      if (baseURL && res.url().startsWith(baseURL) && res.status() >= 400 && !res.request().isNavigationRequest()) {
        problems.push(`HTTP ${res.status()}: ${res.url()}`);
      }
    });
    page.on("requestfailed", (req) => {
      if (baseURL && req.url().startsWith(baseURL)) problems.push(`request failed: ${req.url()}`);
    });
    await use(page);
    expect(problems, problems.join("\n")).toEqual([]);
  },
});

export { expect };

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
