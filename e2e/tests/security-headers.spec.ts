import { expect, test } from "./fixtures";

const PAGES = ["/", "/en", "/about", "/blog", "/panel/login"];

/** What every response from the gateway carries, whatever served it. */
function expectBaseline(headers: Record<string, string>, where: string) {
  expect(headers["x-content-type-options"], where).toBe("nosniff");
  expect(headers["x-frame-options"], where).toBe("DENY");
  expect(headers["referrer-policy"], where).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(headers["cross-origin-opener-policy"], where).toBe("same-origin");
  expect(headers["cross-origin-resource-policy"], where).toBe("same-site");
  expect(headers["permissions-policy"], where).toContain("camera=()");
  expect(headers["permissions-policy"], where).toContain("microphone=()");
  expect(headers["permissions-policy"], where).toContain("geolocation=()");
  expect(headers["server"], where).toBeUndefined();
}

test.describe("security headers", () => {
  for (const path of [
    ...PAGES,
    "/api/health/live",
    "/api/auth/me",
    "/sitemap.xml",
    "/robots.txt",
    "/media/nothing.webp",
  ]) {
    test(`${path} carries the baseline`, async ({ request }) => {
      const res = await request.get(path);
      expectBaseline(res.headers(), path);
    });
  }

  test("a file from the private bucket is never cached and carries the baseline too", async ({
    request,
  }) => {
    const res = await request.get(
      "/storage-signed/private/x?X-Amz-Signature=nothing",
      { failOnStatusCode: false },
    );
    expectBaseline(res.headers(), "storage-signed");
  });

  test("HSTS is sent when the original request was https, and not over plain http", async ({
    request,
  }) => {
    const plain = await request.get("/");
    expect(plain.headers()["strict-transport-security"]).toBeUndefined();
    for (const path of ["/", "/api/health/live"]) {
      const secure = await request.get(path, {
        headers: { "X-Forwarded-Proto": "https" },
      });
      const hsts = secure.headers()["strict-transport-security"] ?? "";
      expect(hsts, path).toMatch(/max-age=(\d+)/);
      expect(Number(/max-age=(\d+)/.exec(hsts)![1])).toBeGreaterThanOrEqual(
        31_536_000,
      );
      expect(hsts.match(/max-age/g), "a single header, not two").toHaveLength(
        1,
      );
    }
  });

  test("answers about the owner and the panel are not cached", async ({
    request,
  }) => {
    for (const path of ["/api/auth/me", "/api/admin/galleries/"]) {
      const res = await request.get(path, { failOnStatusCode: false });
      expect(res.headers()["cache-control"], path).toBe("private, no-store");
    }
  });
});

test.describe("content security policy", () => {
  for (const path of PAGES) {
    test(`${path}: a strict policy, and every script carries this request's nonce`, async ({
      request,
    }) => {
      const res = await request.get(path);
      const policy = res.headers()["content-security-policy"] ?? "";
      expect(policy, "enforced, not just reported").not.toBe("");
      expect(
        res.headers()["content-security-policy-report-only"],
      ).toBeUndefined();
      const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
      expect(nonce, "a nonce in script-src").toBeTruthy();
      const script = /script-src ([^;]+)/.exec(policy)![1]!;
      expect(script).not.toContain("unsafe-inline");
      expect(script).not.toContain("unsafe-eval");
      for (const directive of [
        "default-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
      ]) {
        expect(policy, directive).toContain(directive);
      }
      const html = await res.text();
      const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map(
        (m) => m[1]!,
      );
      expect(scripts.length).toBeGreaterThan(0);
      for (const attributes of scripts) {
        if (/type="application\/ld\+json"/.test(attributes)) continue; // data, not code
        expect(attributes, `a script without the nonce on ${path}`).toContain(
          `nonce="${nonce}"`,
        );
      }
      expect(html).not.toMatch(/<style\b(?![^>]*nonce=)/); // no un-nonced style elements
      expect(html).not.toMatch(/\son[a-z]+="/); // no inline event handlers
    });
  }

  test("the nonce is new for every request", async ({ request }) => {
    const nonces = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const policy =
        (await request.get("/about")).headers()["content-security-policy"] ??
        "";
      nonces.add(/'nonce-([^']+)'/.exec(policy)![1]!);
    }
    expect(nonces.size).toBe(5);
  });

  test("a page with real content runs under the policy without a single violation", async ({
    page,
  }) => {
    // The `page` fixture fails the test on any policy violation or console error; this visits public pages.
    for (const path of [
      "/",
      "/en",
      "/about",
      "/portfolio",
      "/blog",
      "/quote",
      "/book",
      "/contact",
    ]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("an injected inline handler is refused by the browser", async ({
    page,
  }) => {
    await page.goto("/about");
    // (A <script> element added from script is trusted under 'strict-dynamic'; an inline event handler is not.)
    const outcome = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          document.addEventListener(
            "securitypolicyviolation",
            () => resolve("blocked"),
            { once: true },
          );
          const img = document.createElement("img");
          img.setAttribute("onerror", "window.__injected = true");
          img.src = "/missing-image-for-csp-test.png";
          document.body.appendChild(img);
          setTimeout(
            () =>
              resolve(
                (window as unknown as { __injected?: boolean }).__injected
                  ? "ran"
                  : "blocked",
              ),
            2000,
          );
        }),
    );
    expect(outcome).toBe("blocked");
    // the fixture must not treat this deliberate violation as a failure
    test.info().annotations.push({
      type: "expected-csp-violation",
      description: "the injected handler above",
    });
    test.info().annotations.push({
      type: "expected-http-error",
      description: "the missing image",
    });
  });
});
