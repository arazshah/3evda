# Phase 0 Repository and Engineering Foundation Implementation Plan

> **Superseded (2026-10-02):** replaced by `2026-10-02-phase-0-foundation.md` and `2026-10-02-roadmap.md` after the stack changed to Django + Next.js. Kept for history only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a private GitHub repository and a reproducible, tested, Docker-buildable Next.js foundation without shipping unsafe legacy code.

**Architecture:** Phase 0 creates the Next.js application shell, quality toolchain, health endpoint, CI workflow, and production container boundary. The current HTML is retained only as a sanitized design reference outside application build roots.

**Tech Stack:** Node.js 24, pnpm 10, Next.js 16.3.x, React 19.2.x, TypeScript strict mode, Tailwind CSS 4, Vitest, Testing Library, Playwright, ESLint, Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-11-3evda-production-cms-design.md`

## Global Constraints

- Preserve the Persian RTL dark/gold identity; Phase 0 does not redesign public sections.
- The private repository is `arazshah/3evda`; `main` is production and work uses `feature/phase-0-foundation`.
- Use Node.js 24, Next.js 16.3.x, exact dependency versions, and a committed pnpm lockfile.
- TypeScript uses `strict`, `noUncheckedIndexedAccess`, and `noImplicitOverride`.
- No authentication, database, storage, or notification behavior is implemented before its phase.
- No secret, credential, personal-looking fixture, `.env`, or executable legacy authentication is committed.
- The sanitized legacy file lives only at `docs/legacy/Sevda.html` and is excluded from Docker context.
- Behavior is implemented through red-green-refactor; each commit receives security review.
- Completion requires install, lint, typecheck, unit tests, production build, Docker build, and CI to pass.

---

### Task 1: Connect the private GitHub repository

**Files:** Git metadata only.

**Interfaces:** Consumes local commit `788e665`; produces private `origin` and branch `feature/phase-0-foundation`.

- [ ] Verify `git log -1 --oneline` shows `788e665` and `git status --short` shows only untracked `Sevda.html` and this plan.
- [ ] Run `gh auth login -h github.com -p https -w`, then require `gh auth status` to identify `arazshah`.
- [ ] Run `gh repo create 3evda --private --source=. --remote=origin --push`.
- [ ] Verify `gh repo view arazshah/3evda --json nameWithOwner,visibility,url` reports `PRIVATE`.
- [ ] Run `git switch -c feature/phase-0-foundation` and `git push -u origin feature/phase-0-foundation`.

---

### Task 2: Sanitize and archive the legacy reference

**Files:** Create `docs/legacy/Sevda.html`, `scripts/legacy-safety.mjs`, `scripts/legacy-safety.test.mjs`, `scripts/check-legacy.mjs`, `.gitignore`; remove root `Sevda.html` after safe move.

**Interfaces:** Consumes the untracked legacy HTML; produces a non-runtime visual reference and `pnpm check:legacy` safety gate.

- [ ] Create `scripts/legacy-safety.test.mjs` first with Node's built-in test runner. It must assert that `findLegacyViolations()` rejects `admin / 1234`, `user: admin | pass: 1234`, every 11-digit Iranian-looking `09xxxxxxxxx` number, the known names `مهدی کریمی`, `سارا افشار`, `رضا نیک‌پور`, `الهام موسوی`, `حسین راد`, `نگار شریفی`, `پیمان اکبری`, `مریم دادگر`, `شرکت زرین`, `آرش بهرامی`, and every non-`example.invalid` email anywhere in the archived HTML. It must accept `کاربر نمونه ۱`, `برند نمونه ۱`, `00000000001`, and `user1@example.invalid`.

- [ ] Run `node --test scripts/legacy-safety.test.mjs` and observe failure because `scripts/legacy-safety.mjs` is absent.

- [ ] Create `scripts/legacy-safety.mjs` exporting `findLegacyViolations(source)` from these minimum deny rules:

```js
export const forbiddenLegacyPatterns = [
  /admin\s*\/\s*1234/i,
  /pass\s*:\s*1234/i,
  /p\s*===\s*["']1234["']/,
  /localStorage\.setItem\(AUTH_K/,
  /sessionStorage\.getItem\(AUTH_K/,
  /09\d{9}/,
  /[\w.+-]+@(?!example\.invalid\b)[\w.-]+\.[a-z]{2,}/i,
  /مهدی کریمی|سارا افشار|رضا نیک‌پور|الهام موسوی|حسین راد|نگار شریفی|پیمان اکبری|مریم دادگر|شرکت زرین|آرش بهرامی/,
];

export function findLegacyViolations(source) {
  return forbiddenLegacyPatterns.filter((pattern) => pattern.test(source));
}
```

- [ ] Create the file checker at `scripts/check-legacy.mjs`:

```js
import { readFile } from "node:fs/promises";
import { findLegacyViolations } from "./legacy-safety.mjs";

const source = await readFile(new URL("../docs/legacy/Sevda.html", import.meta.url), "utf8");
const violations = findLegacyViolations(source);
if (violations.length) {
  console.error(`Legacy safety check failed: ${violations.length} forbidden pattern(s)`);
  process.exit(1);
}
console.log("Legacy safety check passed");
```

- [ ] Run the unit test and require pass. Then move the file with `mkdir -p docs/legacy && mv Sevda.html docs/legacy/Sevda.html`, run the file checker, and observe the expected failure.
- [ ] Replace the visible demo credential with `نسخه آرشیوی — ورود غیرفعال است`; remove `AUTH_K`, `isAuth`, the credential comparison, client auth storage mutation, and console credential banner; make archived admin access impossible.
- [ ] Replace fixture identities with `کاربر نمونه N`, `برند نمونه N`, `0000000000N`, and `userN@example.invalid`. Replace every other email in the archive, including public contact examples, with an `example.invalid` address so the global guard passes without weakening it.
- [ ] Run `node scripts/check-legacy.mjs`, `test ! -e Sevda.html`, and `test -f docs/legacy/Sevda.html`; require exit 0.
- [ ] Create `.gitignore` covering `node_modules/`, `.next/`, `coverage/`, Playwright artifacts, `.env*` except `.env.example`, logs, and OS files.
- [ ] After security approval, stage only `.gitignore`, both checker modules, their test, and sanitized legacy file; run `git diff --cached --check`; commit `chore: archive sanitized legacy site`.

---

### Task 3: Scaffold the strict Next.js shell

**Files:** Create `package.json`, lockfile, `.npmrc`, TypeScript/Next/Tailwind/ESLint/Vitest configs, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/page.test.tsx`, `src/test/setup.ts`, and `public/favicon.svg`.

**Interfaces:** Produces `RootLayout`, `/`, and scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:run`, `check:legacy`, and `verify`.

- [ ] Resolve the newest pnpm 10 patch from the official npm registry, install that exact patch, run `pnpm init`, set `save-exact=true`, set package `private: true`, engine `>=24 <25`, and package manager to the exact resolved `pnpm@10.x.y` value. Record Corepack's integrity suffix when supported and reject an unversioned package-manager declaration.
- [ ] Install exact `next@16.3.3`, `react@19.2.0`, `react-dom@19.2.0`; install latest stable exact Zod, TypeScript, type packages, ESLint/Next config, Tailwind/PostCSS, Vitest/jsdom/React plugin, and Testing Library packages.
- [ ] Add scripts exactly:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint . --max-warnings=0",
  "typecheck": "tsc --noEmit",
  "test": "vitest",
  "test:run": "vitest run",
  "check:legacy": "node scripts/check-legacy.mjs",
  "verify": "pnpm check:legacy && pnpm lint && pnpm typecheck && pnpm test:run && pnpm build"
}
```

- [ ] Configure `next.config.ts` with `output: "standalone"` and `poweredByHeader: false`; configure strict TypeScript, Tailwind PostCSS, Next core-web-vitals ESLint, Vitest jsdom, and `@/* -> src/*`.
- [ ] Create `src/test/setup.ts` importing `@testing-library/jest-dom/vitest`.
- [ ] Write `src/app/page.test.tsx` first, asserting an H1 named `سودا رحیم‌پور` and text `نسخه جدید در حال آماده‌سازی است`; run it and observe failure because `page.tsx` is absent.
- [ ] Implement minimal Persian RTL `RootLayout` and home page using dark `#09090b`, gold `#d9a441`, `<html lang="fa" dir="rtl">`, correct metadata, and reduced-motion CSS.
- [ ] Run focused test, lint, typecheck, and build; require exit 0.
- [ ] After security review, commit only scaffold paths as `feat: establish Next.js application shell`.

---

### Task 4: Add health and browser-test foundations

**Files:** Create `src/app/api/health/live/route.test.ts`, `route.ts`, `playwright.config.ts`, `tests/e2e/smoke.spec.ts`; modify package metadata and lockfile.

**Interfaces:** Produces `GET /api/health/live -> { status: "ok" }` with `Cache-Control: no-store`, plus desktop/mobile Playwright projects.

- [ ] Write the route test first:

```ts
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health/live", () => {
  it("returns a non-cacheable liveness response", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
```

- [ ] Run it and observe failure because `route.ts` is absent.
- [ ] Implement `GET()` with `Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } })`; rerun and require pass.
- [ ] Install exact stable `@playwright/test`; configure base URL `http://127.0.0.1:3000`, Chromium desktop, 375x812 touch mobile, trace on first retry, screenshot on failure, and a `pnpm dev` web server watched through the health route.
- [ ] Write `tests/e2e/smoke.spec.ts` to load `/`, assert the Persian H1 is visible, call `/api/health/live` and assert 200 plus `{ status: "ok" }`, and assert no horizontal overflow in both configured projects.
- [ ] Add `e2e` and `e2e:install` scripts, install Chromium, and run real `pnpm e2e`, full unit tests, lint, typecheck, and build.
- [ ] After security review, commit as `test: add health and browser test foundations`.

---

### Task 5: Add production Docker and CI gates

**Files:** Create `.dockerignore`, `.env.example`, `Dockerfile`, `.github/workflows/ci.yml`, `.github/dependabot.yml`, and `README.md`.

**Interfaces:** Consumes standalone output and health route; produces a non-root image on port 3000 and required GitHub checks.

- [ ] Create `.dockerignore` excluding Git data, dependencies, builds, test reports, `.env*`, logs, and all `docs/`, which prevents legacy HTML entering the image.
- [ ] Resolve `node:24-bookworm-slim` to its current official immutable digest and pin every Docker stage as `node:24-bookworm-slim@sha256:<resolved-digest>` before commit. Create a multi-stage Dockerfile: frozen pnpm install, one production build, copy standalone/static/public, `NODE_ENV=production`, numeric UID/GID 10001, non-root runtime, port 3000, exec-form `CMD`, and Node health check against `/api/health/live`. No secret may be an ARG or image-layer value.
- [ ] Create `.env.example` containing only `NODE_ENV=development`, `APP_URL=http://localhost:3000`, and `LOG_LEVEL=info`.
- [ ] Resolve the current official gitleaks release image digest, add a `secret:scan` package script that scans full Git history with that immutable digest and `--redact`, and run it successfully before commit.
- [ ] Create CI for `pull_request` and pushes to `main`—never `pull_request_target`: full-history checkout with `persist-credentials: false`, `pnpm secret:scan`, Node 24/pnpm cache, frozen install, `pnpm audit --audit-level high`, legacy tests/check, lint, typecheck, unit tests, Playwright Chromium installation and real smoke E2E, production build, and Docker build. Pin every official action to a full immutable commit SHA with a version comment, set `timeout-minutes`, permissions to `contents: read`, cancel superseded runs, and never print environment, GitHub contexts, or detected values.
- [ ] Configure weekly Dependabot updates for npm, GitHub Actions, and Docker with at most five open PRs per ecosystem. Any audit exception requires a documented, time-bounded security review.
- [ ] Write Persian README with prerequisites, frozen install, dev/verify commands, Docker commands, health endpoint, sanitized legacy warning, branch workflow, secret prohibition, and links to Spec/Plan.
- [ ] Run `pnpm verify`, build `3evda:phase-0`, inspect the image and require runtime UID 10001 and absence of `/app/docs`, legacy HTML, and `.env` files. Start with `--read-only --cap-drop=ALL --security-opt=no-new-privileges --tmpfs /tmp` on `127.0.0.1:3000`, curl health, and stop it; require `{"status":"ok"}`. Coolify runtime equivalents are enforced again in Phase 10.
- [ ] After security review, commit as `ci: enforce production foundation gates` and push the feature branch.
- [ ] Wait for GitHub Actions and require success.
- [ ] Protect `main`: require pull requests, one approval, dismissal of stale approvals, conversation resolution, linear history, the exact CI check name with `strict: true`, `enforce_admins: true`, no normal push bypass, and disallow force pushes/deletion; verify via `gh api repos/arazshah/3evda/branches/main/protection`.

---

## Phase 0 Completion Gate

Run from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm e2e
pnpm secret:scan
docker build --tag 3evda:phase-0 .
git status --short
```

Required evidence: every command exits 0; working tree is clean; legacy safety passes and legacy content is absent from Docker context; GitHub Actions is green; repository visibility is private; `main` protection is active; no secret or personal-looking fixture exists in history; security review approves the phase.

Only after this gate is satisfied may Phase 1 receive its detailed plan and implementation.
