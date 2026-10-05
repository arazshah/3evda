import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/**
 * The first-visit intro covers the page for about three seconds. Every context starts with the "already seen"
 * cookie, so clicks and accessibility scans never land in the middle of it; splash.spec.ts opts out.
 */
export async function skipSplash(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: "threevda_splash", value: "1", url: baseURL },
  ]);
}

/**
 * Collects what the browser itself reports when the Content-Security-Policy refuses something (script, style,
 * image, connection…). Installed before any page script runs, so nothing is missed.
 */
const CSP_WATCH = () => {
  const seen: string[] = [];
  (window as unknown as { __csp: string[] }).__csp = seen;
  document.addEventListener("securitypolicyviolation", (event) => {
    seen.push(
      `${event.violatedDirective}: ${event.blockedURI || "inline"} (${event.sourceFile || "page"})`,
    );
  });
};

/** Starts watching a page opened by hand (a second browser context) for policy violations. */
export async function watchCsp(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(CSP_WATCH);
  return async () => {
    const found = await page
      .evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
      .catch(() => []);
    return found;
  };
}

/**
 * Fails the test if the page logs console errors, or a same-origin sub-resource fails or returns >= 400.
 * (The document itself may legitimately be a 404; tests assert that status explicitly.)
 */
export const test = base.extend<{ page: Page }>({
  page: async ({ page, baseURL }, use) => {
    const problems: string[] = [];
    const wantsSplash = base
      .info()
      .annotations.some((a) => a.type === "show-splash");
    if (baseURL && !wantsSplash) await skipSplash(page.context(), baseURL);
    const violations = await watchCsp(page);
    page.on("console", (msg) => {
      // Resource errors are reported with their URL by the response listener below.
      // Chrome words a policy refusal as "Refused to …" or "<Doing x> violates the following Content Security Policy …".
      const refusal =
        msg.text().startsWith("Refused to") ||
        msg.text().includes("violates the following Content Security Policy");
      const expectsViolation =
        refusal &&
        base
          .info()
          .annotations.some((a) => a.type === "expected-csp-violation");
      if (
        msg.type() === "error" &&
        !msg.text().startsWith("Failed to load resource") &&
        !expectsViolation
      ) {
        problems.push(`console: ${msg.text()}`);
      }
    });
    page.on("response", (res) => {
      // A test that provokes an error answer on purpose says so with an "expected-http-error" annotation.
      const expected = base
        .info()
        .annotations.some((a) => a.type === "expected-http-error");
      if (
        baseURL &&
        res.url().startsWith(baseURL) &&
        res.status() >= 400 &&
        !res.request().isNavigationRequest() &&
        !expected
      ) {
        problems.push(`HTTP ${res.status()}: ${res.url()}`);
      }
    });
    page.on("requestfailed", (req) => {
      // Requests cancelled by a client-side navigation (e.g. a redirect to the login page) are not failures.
      if (req.failure()?.errorText === "net::ERR_ABORTED") return;
      if (baseURL && req.url().startsWith(baseURL))
        problems.push(`request failed: ${req.url()}`);
    });
    await use(page);
    const expectsViolation = base
      .info()
      .annotations.some((a) => a.type === "expected-csp-violation");
    if (!expectsViolation)
      problems.push(...(await violations()).map((v) => `CSP violation: ${v}`));
    expect(problems, problems.join("\n")).toEqual([]);
  },
});

export { expect };

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
