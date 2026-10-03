// Lighthouse gate for the public pages: every category must score at least 90 on the mobile profile.
// Runs against the already-running stack (E2E_BASE_URL) with the Chromium that Playwright installed.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const LIGHTHOUSE = "lighthouse@13.5.0";
const MIN_SCORE = 0.9;
const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const ROUTES = ["/", "/portfolio", "/services", "/packages", "/about", "/contact", "/blog", "/blog/sample-article"];
// Every public page in both languages (Persian is unprefixed, English lives under /en).
const PAGES = ROUTES.flatMap((route) => [route, route === "/" ? "/en" : `/en${route}`]);
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

const outDir = mkdtempSync(join(tmpdir(), "lighthouse-"));
const chromePath = process.env.PW_CHROMIUM_PATH || chromium.executablePath();
const failures = [];

for (const [index, path] of PAGES.entries()) {
  // Warm the page first: the first request after start-up renders cold and skews the lab numbers.
  await fetch(BASE + path);
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
    if (scores[category] < MIN_SCORE) {
      const audits = report.categories[category].auditRefs
        .map((ref) => report.audits[ref.id])
        .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode !== "informative")
        .map((a) => a.id);
      failures.push(`${path} ${category} ${Math.round(scores[category] * 100)} (${audits.join(", ")})`);
    }
  }
}

if (failures.length > 0) {
  console.error(`\nBelow ${MIN_SCORE * 100}:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
