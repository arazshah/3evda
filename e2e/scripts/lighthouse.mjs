// Lighthouse gate for the public pages: every category must score at least 90 on the mobile profile,
// and SEO at least 95 on the article page.
// Runs against the already-running stack (E2E_BASE_URL) with the Chromium that Playwright installed.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const LIGHTHOUSE = "lighthouse@13.5.0";
const MIN_SCORE = 0.9;
const MIN_SEO_ARTICLE = 0.95;
const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const ROUTES = ["/", "/portfolio", "/services", "/packages", "/about", "/contact", "/quote", "/blog", "/blog/sample-article"];
// Every public page in both languages (Persian is unprefixed, English lives under /en).
const PAGES = ROUTES.flatMap((route) => [route, route === "/" ? "/en" : `/en${route}`]);
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
// On the real site there may be no sample article yet: with this set, a page that does not exist is skipped
// (and said so), instead of failing the gate. Every page that does exist is still held to the same scores.
const SKIP_MISSING = process.env.LIGHTHOUSE_SKIP_MISSING === "true";

const outDir = mkdtempSync(join(tmpdir(), "lighthouse-"));
const chromePath = process.env.PW_CHROMIUM_PATH || chromium.executablePath();
const failures = [];

for (const [index, path] of PAGES.entries()) {
  // Warm the page first: the first request after start-up renders cold and skews the lab numbers.
  const warm = await fetch(BASE + path);
  if (SKIP_MISSING && warm.status === 404) {
    console.log(path.padEnd(16), "skipped (no such page on this site yet)");
    continue;
  }
  const file = join(outDir, `${index}.json`);
  execFileSync(
    "pnpm",
    [
      "dlx",
      LIGHTHOUSE,
      BASE + path,
      "--quiet",
      "--output=json",
      `--output-path=${file}`,
      `--only-categories=${CATEGORIES.join(",")}`,
      "--chrome-flags=--headless=new --no-sandbox",
    ],
    { env: { ...process.env, CHROME_PATH: chromePath }, stdio: ["ignore", "inherit", "inherit"] },
  );
  const report = JSON.parse(readFileSync(file, "utf8"));
  const scores = Object.fromEntries(CATEGORIES.map((c) => [c, report.categories[c].score]));
  console.log(path.padEnd(16), CATEGORIES.map((c) => `${c} ${Math.round(scores[c] * 100)}`).join("  "));
  for (const category of CATEGORIES) {
    const min = category === "seo" && path.endsWith("/blog/sample-article") ? MIN_SEO_ARTICLE : MIN_SCORE;
    if (scores[category] < min) {
      const audits = report.categories[category].auditRefs
        .map((ref) => report.audits[ref.id])
        .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode !== "informative")
        .map((a) => a.id);
      failures.push(`${path} ${category} ${Math.round(scores[category] * 100)} (${audits.join(", ")})`);
    }
  }
}

if (failures.length > 0) {
  console.error(`\nBelow the gate:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
