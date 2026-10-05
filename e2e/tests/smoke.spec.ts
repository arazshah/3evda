import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  expectNoHorizontalOverflow,
  skipSplash,
  test,
} from "./fixtures";

// Headings are the seeded defaults of the editable text blocks (apps/cms/blocks.py).
const pages = [
  { path: "/", lang: "fa", dir: "rtl", heading: "طعم را دیدنی می‌کنیم" },
  { path: "/en", lang: "en", dir: "ltr", heading: "We make flavour visible" },
  { path: "/portfolio", lang: "fa", dir: "rtl", heading: "نمونه‌کارها" },
  { path: "/en/portfolio", lang: "en", dir: "ltr", heading: "Portfolio" },
  { path: "/services", lang: "fa", dir: "rtl", heading: "خدمات" },
  { path: "/en/services", lang: "en", dir: "ltr", heading: "Services" },
  { path: "/packages", lang: "fa", dir: "rtl", heading: "پکیج‌ها" },
  { path: "/en/packages", lang: "en", dir: "ltr", heading: "Packages" },
  { path: "/about", lang: "fa", dir: "rtl", heading: "درباره‌ی من" },
  { path: "/en/about", lang: "en", dir: "ltr", heading: "About me" },
  { path: "/contact", lang: "fa", dir: "rtl", heading: "تماس" },
  { path: "/en/contact", lang: "en", dir: "ltr", heading: "Contact" },
  { path: "/quote", lang: "fa", dir: "rtl", heading: "استعلام قیمت" },
  { path: "/en/quote", lang: "en", dir: "ltr", heading: "Get a quote" },
  { path: "/book", lang: "fa", dir: "rtl", heading: "رزرو وقت" },
  { path: "/en/book", lang: "en", dir: "ltr", heading: "Book a session" },
  // The journal pages; the articles come from `seed_blog_demo`, which CI runs before the tests.
  { path: "/blog", lang: "fa", dir: "rtl", heading: "مجله" },
  { path: "/en/blog", lang: "en", dir: "ltr", heading: "Journal" },
  {
    path: "/blog/sample-article",
    lang: "fa",
    dir: "rtl",
    heading: "مقاله‌ی نمونه",
  },
  {
    path: "/en/blog/sample-article",
    lang: "en",
    dir: "ltr",
    heading: "Sample article",
  },
  { path: "/blog/category/sample", lang: "fa", dir: "rtl", heading: "نمونه" },
  { path: "/en/blog/tag/sample", lang: "en", dir: "ltr", heading: "sample" },
] as const;

for (const p of pages) {
  test.describe(`${p.path} (${p.lang})`, () => {
    test("renders the localized document", async ({ page }) => {
      const response = await page.goto(p.path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", p.lang);
      await expect(page.locator("html")).toHaveAttribute("dir", p.dir);
      await expect(
        page.getByRole("heading", { level: 1, name: p.heading }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });

    test("has no serious accessibility violations", async ({ page }) => {
      await page.goto(p.path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });

    test("has no serious accessibility violations in the dark theme either", async ({
      page,
      baseURL,
    }) => {
      await page
        .context()
        .addCookies([{ name: "threevda_theme", value: "dark", url: baseURL! }]);
      await page.goto(p.path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  });
}

test.describe("colour theme", () => {
  test("follows the system until a choice is made, then keeps the choice across pages and reloads", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ baseURL, colorScheme: "dark" });
    await skipSplash(context, baseURL!);
    const page = await context.newPage();
    await page.goto("/");
    // No choice yet: nothing on <html>, the dark system preference decides.
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe("rgb(14, 14, 13)");

    const toggle = page
      .getByRole("banner")
      .getByRole("button", { name: /تم رنگی/ });
    await toggle.click(); // system -> light
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe("rgb(243, 238, 230)");

    // The server paints the chosen theme on the next request (no flash), on any page.
    await page.goto("/en/portfolio");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await context.close();
  });
});

test("language switch links between Persian and English", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await page.getByRole("banner").getByRole("link", { name: "فارسی" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
});

test("the /fa prefix permanently redirects to the canonical unprefixed URL", async ({
  request,
}) => {
  const response = await request.get("/fa", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers()["location"]).toBe("/");
});

test("unknown pages return a localized 404", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "صفحه‌ای که دنبالش بودید پیدا نشد",
  );
});

test.describe("journal", () => {
  test("an article lists itself in the journal, with its category and reading time", async ({
    page,
  }) => {
    await page.goto("/en/blog");
    const card = page
      .getByRole("article")
      .filter({ hasText: "Sample article" });
    await expect(
      card.getByRole("link", { name: "Sample article" }),
    ).toHaveAttribute("href", "/en/blog/sample-article");
    await expect(
      card.getByRole("link", { name: "Sample", exact: true }),
    ).toHaveAttribute("href", "/en/blog/category/sample");
    await expect(card).toContainText("min read");
  });

  test("the article page has absolute canonical and hreflang links to both languages", async ({
    page,
  }) => {
    await page.goto("/blog/sample-article");
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    expect(canonical).toMatch(/^https?:\/\/.+\/blog\/sample-article$/);
    const hreflang = async (lang: string) =>
      page
        .locator(`link[rel="alternate"][hreflang="${lang}"]`)
        .getAttribute("href");
    expect(await hreflang("fa")).toMatch(
      /^https?:\/\/.+\/blog\/sample-article$/,
    );
    expect(await hreflang("en")).toMatch(
      /^https?:\/\/.+\/en\/blog\/sample-article$/,
    );
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      "content",
      "article",
    );
  });

  test("the language switch opens the same article in the other language", async ({
    page,
  }) => {
    await page.goto("/blog/sample-article");
    await page
      .getByRole("banner")
      .getByRole("link", { name: "English" })
      .click();
    await expect(page).toHaveURL(/\/en\/blog\/sample-article$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Sample article",
    );
  });

  test("unknown articles, categories and preview links are 404s", async ({
    page,
  }) => {
    for (const path of [
      "/blog/does-not-exist",
      "/blog/category/nothing",
      "/blog/tag/nothing",
      "/blog/preview/garbage",
    ]) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
  });
});

test.describe("search engines", () => {
  test("robots.txt keeps the admin out and points at the sitemap", async ({
    request,
  }) => {
    const text = await (await request.get("/robots.txt")).text();
    expect(text).toContain("Disallow: /panel");
    expect(text).toContain("Disallow: /api/");
    expect(text).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });

  test("the sitemap lists pages and articles with language alternates, and nothing from /panel", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.headers()["content-type"]).toContain("xml");
    const xml = await response.text();
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/en\/portfolio<\/loc>/);
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/blog\/sample-article<\/loc>/);
    expect(xml).toMatch(
      /hreflang="en" href="https?:\/\/[^"]+\/en\/blog\/sample-article"/,
    );
    expect(xml).not.toContain("/panel");
  });

  for (const [path, title, link] of [
    ["/rss.xml", "مقاله‌ی نمونه", "/blog/sample-article"],
    ["/en/rss.xml", "Sample article", "/en/blog/sample-article"],
  ] as const) {
    test(`${path} is a valid feed with the published articles`, async ({
      request,
    }) => {
      const response = await request.get(path);
      expect(response.headers()["content-type"]).toContain(
        "application/rss+xml",
      );
      const xml = await response.text();
      expect(xml).toContain('<rss version="2.0"');
      expect(xml).toContain(`<title>${title}</title>`);
      expect(xml).toMatch(new RegExp(`<link>https?://[^<]+${link}</link>`));
    });
  }

  test("pages carry structured data", async ({ page }) => {
    const ld = async (path: string) => {
      await page.goto(path);
      return (
        await page
          .locator('script[type="application/ld+json"]')
          .allTextContents()
      ).join("\n");
    };
    expect(await ld("/")).toContain('"ProfessionalService"');
    const article = await ld("/blog/sample-article");
    expect(article).toContain('"@type":"Article"');
    expect(article).toContain('"BreadcrumbList"');
  });
});

test.describe("booking", () => {
  // The sample week comes from `seed_booking_demo`, which CI runs before the tests. One journey on desktop only:
  // both projects would otherwise reach for the same first free time.
  test.skip(
    ({ isMobile }) => isMobile,
    "the booking journey runs once, on desktop",
  );

  test("a visitor books a free time, follows it from the link and cancels", async ({
    page,
  }) => {
    await page.goto("/en/book");
    const freeDays = page.locator("table[role=grid] button:not([disabled])");
    await expect(page.getByText("Loading free times…")).toHaveCount(0);
    if ((await freeDays.count()) === 0) {
      await page.getByRole("button", { name: "Next month" }).click();
      await expect(page.getByText("Loading free times…")).toHaveCount(0);
    }
    await freeDays.first().click();
    const times = page.getByRole("group", { name: /Free times/ });
    await expect(times).toBeVisible();
    await times.getByRole("button").first().click();
    await expect(page.getByText(/Your chosen time:/)).toBeVisible();

    await page.getByLabel("Name", { exact: true }).fill("Booking Tester");
    await page.getByLabel("Phone", { exact: true }).fill("09125556677");
    await page.getByRole("button", { name: "Send booking request" }).click();
    await expect(page.getByText("Booking request received")).toBeVisible();

    await page.getByRole("link", { name: "See the booking status" }).click();
    await expect(page).toHaveURL(/\/en\/b\/[0-9a-f]{32}_/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Booking status" }),
    ).toBeVisible();
    await expect(page.getByText("Waiting for confirmation")).toBeVisible();
    expect(
      await page.locator('meta[name="robots"]').getAttribute("content"),
    ).toContain("noindex");

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByText("You cancelled this booking")).toBeVisible();
    await page.reload();
    await expect(page.getByText("You cancelled this booking")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel booking" }),
    ).toHaveCount(0);
  });

  test("a made-up booking link is a 404, not a hint", async ({
    page,
    request,
  }) => {
    const response = await page.goto(
      "/b/00000000000000000000000000000000_forged",
    );
    expect(response?.status()).toBe(404);
    const api = await request.get(
      "/api/public/bookings/00000000000000000000000000000000_forged",
    );
    expect(api.status()).toBe(404);
  });
});

test.describe("quote form", () => {
  // The sample price rules come from `seed_quote_demo`, which CI runs before the tests.
  test("the calculator shows an approximate range and a visitor can send an inquiry", async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== "desktop",
      "one submission is enough; each one counts against the rate limit",
    );
    await page.goto("/en/quote");
    await expect(page.getByTestId("estimate")).toHaveText(
      /^From .+ to .+ toman$/,
    );

    const estimate = await page.getByTestId("estimate").textContent();
    await page.getByLabel("Short video").check();
    await expect(page.getByTestId("estimate")).not.toHaveText(estimate ?? ""); // a new choice, a new range

    await page.getByLabel("Full name").fill("E2E Visitor");
    await page.getByLabel("Phone").fill("09120000000");
    await page
      .getByLabel("Details")
      .fill("Sent by the automated browser test.");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(
      page.getByRole("heading", { name: "Your request was received" }),
    ).toBeVisible();
  });

  test("the form refuses a missing name and shows the problem", async ({
    page,
  }) => {
    await page.goto("/en/quote");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(
      page.getByText("Please fix the following").locator(".."),
    ).toBeFocused(); // the summary box
    await expect(page.getByText("Required.").first()).toBeVisible();
  });

  for (const [path, name, button, message] of [
    [
      "/en/quote",
      "Full name",
      "Send request",
      /Enter at least one way to reach you/,
    ],
    [
      "/quote",
      "نام و نام خانوادگی",
      "ارسال استعلام",
      /دست‌کم یکی از راه‌های تماس/,
    ],
  ] as const) {
    test(`a missing way to reach the visitor is explained in the page's language (${path})`, async ({
      page,
    }, info) => {
      test.skip(
        info.project.name !== "desktop",
        "each submission counts against the rate limit",
      );
      info.annotations.push({
        type: "expected-http-error",
        description: "the server answers 400 with the message",
      });
      await page.goto(path);
      await page.getByLabel(name).fill("E2E Visitor");
      await page.getByRole("button", { name: button }).click(); // the server decides, in the visitor's language
      await expect(page.getByText(message).first()).toBeVisible();
    });
  }

  test("the API refuses a disguised file and a body beyond the gateway limit", async ({
    request,
  }, info) => {
    test.skip(
      info.project.name !== "desktop",
      "each request counts against the rate limit",
    );
    const fake = await request.post("/api/public/inquiries", {
      multipart: {
        name: "E2E",
        phone: "09120000000",
        attachments: {
          name: "photo.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("not really an image"),
        },
      },
    });
    expect(fake.status()).toBe(400);

    // The gateway cuts the body off at 32 MB before it reaches the API.
    const huge = await request.post("/api/public/inquiries", {
      multipart: {
        name: "E2E",
        phone: "09120000000",
        attachments: {
          name: "big.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.alloc(33 * 1024 * 1024, 0x25),
        },
      },
    });
    expect(huge.status()).toBe(413);
  });
});
