import { describe, expect, it } from "vitest";
import { absoluteUrl, buildRss, buildSitemap, escapeXml, jsonLdScript } from "./seo";
import type { BlogArticle, SiteData } from "./types";

// Set before anything runs: buildSitemap is evaluated while the tests are being collected.
process.env.PUBLIC_URL = "https://3evda.com/";

describe("absoluteUrl", () => {
  it("prefixes English and leaves Persian bare", () => {
    expect(absoluteUrl("fa", "/blog")).toBe("https://3evda.com/blog");
    expect(absoluteUrl("en", "/blog")).toBe("https://3evda.com/en/blog");
    expect(absoluteUrl("fa", "/")).toBe("https://3evda.com");
    expect(absoluteUrl("en", "/")).toBe("https://3evda.com/en");
  });
});

describe("buildSitemap", () => {
  const entries = buildSitemap({
    projects: [{ slug: "tea", updated_at: "2026-10-01T10:00:00Z" }],
    articles: [
      {
        language: "fa",
        slug: "کباب",
        updated_at: "2026-10-02T10:00:00Z",
        alternates: [{ language: "en", slug: "kebab" }],
      },
      { language: "en", slug: "only-english", updated_at: "2026-10-02T10:00:00Z", alternates: [] },
    ],
  });
  const byUrl = Object.fromEntries(entries.map((e) => [e.url, e]));

  it("lists every static page and project in both languages with alternates", () => {
    expect(byUrl["https://3evda.com/portfolio/tea"]?.alternates?.languages).toEqual({
      fa: "https://3evda.com/portfolio/tea",
      en: "https://3evda.com/en/portfolio/tea",
    });
    expect(byUrl["https://3evda.com/en/contact"]).toBeDefined();
  });

  it("points articles only at the languages they exist in", () => {
    const fa = byUrl[`https://3evda.com/blog/${encodeURIComponent("کباب")}`];
    expect(fa?.alternates?.languages.en).toBe("https://3evda.com/en/blog/kebab");
    const only = byUrl["https://3evda.com/en/blog/only-english"];
    expect(only?.alternates).toBeUndefined();
    expect(byUrl["https://3evda.com/blog/only-english"]).toBeUndefined();
  });
});

describe("buildRss", () => {
  const site = {
    settings: { brand_name_fa: "سودا", brand_name_en: "Sevda", description_fa: "", description_en: "Photos" },
  } as unknown as SiteData;
  const article = {
    slug: "a&b",
    title: "Tea <b>& cake",
    summary: "Fine",
    published_at: "2026-10-02T10:00:00Z",
    cover: null,
  } as unknown as BlogArticle;

  it("escapes markup and uses absolute links", () => {
    const xml = buildRss(site, "en", [article]);
    expect(xml).toContain("<title>Tea &lt;b&gt;&amp; cake</title>");
    expect(xml).toContain("<link>https://3evda.com/en/blog/a%26b</link>");
    expect(xml).toContain("<language>en</language>");
    expect(xml).toContain("Fri, 02 Oct 2026 10:00:00 GMT");
    expect(xml).toContain('href="https://3evda.com/en/rss.xml"');
  });
});

describe("helpers", () => {
  it("escapes xml", () =>
    expect(escapeXml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;"));
  it("keeps json-ld from closing its script tag", () => {
    expect(jsonLdScript({ name: "</script><script>alert(1)" })).not.toContain("</script>");
  });
});
