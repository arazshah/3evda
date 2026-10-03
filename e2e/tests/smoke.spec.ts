import AxeBuilder from "@axe-core/playwright";
import { expect, expectNoHorizontalOverflow, test } from "./fixtures";

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
  // The journal pages; the articles come from `seed_blog_demo`, which CI runs before the tests.
  { path: "/blog", lang: "fa", dir: "rtl", heading: "مجله" },
  { path: "/en/blog", lang: "en", dir: "ltr", heading: "Journal" },
  { path: "/blog/sample-article", lang: "fa", dir: "rtl", heading: "مقاله‌ی نمونه" },
  { path: "/en/blog/sample-article", lang: "en", dir: "ltr", heading: "Sample article" },
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
  await page.getByRole("banner").getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await page.getByRole("banner").getByRole("link", { name: "فارسی" }).click();
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

test.describe("journal", () => {
  test("an article lists itself in the journal, with its category and reading time", async ({ page }) => {
    await page.goto("/en/blog");
    const card = page.getByRole("article").filter({ hasText: "Sample article" });
    await expect(card.getByRole("link", { name: "Sample article" })).toHaveAttribute("href", "/en/blog/sample-article");
    await expect(card.getByRole("link", { name: "Sample", exact: true })).toHaveAttribute("href", "/en/blog/category/sample");
    await expect(card).toContainText("min read");
  });

  test("the article page has absolute canonical and hreflang links to both languages", async ({ page }) => {
    await page.goto("/blog/sample-article");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toMatch(/^https?:\/\/.+\/blog\/sample-article$/);
    const hreflang = async (lang: string) => page.locator(`link[rel="alternate"][hreflang="${lang}"]`).getAttribute("href");
    expect(await hreflang("fa")).toMatch(/^https?:\/\/.+\/blog\/sample-article$/);
    expect(await hreflang("en")).toMatch(/^https?:\/\/.+\/en\/blog\/sample-article$/);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  });

  test("the language switch opens the same article in the other language", async ({ page }) => {
    await page.goto("/blog/sample-article");
    await page.getByRole("banner").getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en\/blog\/sample-article$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sample article");
  });

  test("unknown articles, categories and preview links are 404s", async ({ page }) => {
    for (const path of ["/blog/does-not-exist", "/blog/category/nothing", "/blog/tag/nothing", "/blog/preview/garbage"]) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
  });
});

test.describe("search engines", () => {
  test("robots.txt keeps the admin out and points at the sitemap", async ({ request }) => {
    const text = await (await request.get("/robots.txt")).text();
    expect(text).toContain("Disallow: /panel");
    expect(text).toContain("Disallow: /api/");
    expect(text).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });

  test("the sitemap lists pages and articles with language alternates, and nothing from /panel", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.headers()["content-type"]).toContain("xml");
    const xml = await response.text();
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/en\/portfolio<\/loc>/);
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/blog\/sample-article<\/loc>/);
    expect(xml).toMatch(/hreflang="en" href="https?:\/\/[^"]+\/en\/blog\/sample-article"/);
    expect(xml).not.toContain("/panel");
  });

  for (const [path, title, link] of [
    ["/rss.xml", "مقاله‌ی نمونه", "/blog/sample-article"],
    ["/en/rss.xml", "Sample article", "/en/blog/sample-article"],
  ] as const) {
    test(`${path} is a valid feed with the published articles`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.headers()["content-type"]).toContain("application/rss+xml");
      const xml = await response.text();
      expect(xml).toContain("<rss version=\"2.0\"");
      expect(xml).toContain(`<title>${title}</title>`);
      expect(xml).toMatch(new RegExp(`<link>https?://[^<]+${link}</link>`));
    });
  }

  test("pages carry structured data", async ({ page }) => {
    const ld = async (path: string) => {
      await page.goto(path);
      return (await page.locator('script[type="application/ld+json"]').allTextContents()).join("\n");
    };
    expect(await ld("/")).toContain('"ProfessionalService"');
    const article = await ld("/blog/sample-article");
    expect(article).toContain('"@type":"Article"');
    expect(article).toContain('"BreadcrumbList"');
  });
});
