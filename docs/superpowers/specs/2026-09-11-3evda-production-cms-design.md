# 3evda Production CMS Design

**Date:** 2026-09-11

**Status:** Superseded on 2026-10-02 by `2026-10-02-photographer-platform-design.md` (stack changed to Django + Next.js). Security, accessibility, SEO, backup and Coolify requirements remain applicable.

**Source artifact:** `Sevda.html`

**Repository:** `arazshah/3evda` (private)

## 1. Objective

Rebuild the current single-file static portfolio as a production-ready, self-hosted application while preserving its visual identity. The finished system provides:

- a public Persian RTL portfolio website;
- a custom administration dashboard matching the current design language;
- durable PostgreSQL-backed content and inquiry storage;
- MinIO-backed media uploads;
- one secure administrator account with no public registration;
- SMS.ir notifications for new inquiries;
- a provider boundary for future WhatsApp notifications;
- Docker-based deployment to the owner's Coolify server.

Every public-facing content item must be editable from the administration dashboard, except security secrets and infrastructure credentials. Secrets remain in Coolify environment variables.

## 2. Confirmed Product Decisions

1. The GitHub repository is private.
2. The existing visual identity is preserved.
3. UI changes are limited to mobile usability, accessibility, performance, and technical quality.
4. The administration dashboard is custom-built and retains the current visual direction.
5. The application is a Next.js full-stack modular monolith.
6. PostgreSQL and MinIO run alongside the application on the same Coolify-managed server.
7. Only one administrator account exists. There are no user accounts, public registration, roles, or user-management screens.
8. Visitors can submit the existing project inquiry form and do not authenticate.
9. New inquiries trigger SMS.ir notifications. WhatsApp is implemented later through the same provider interface.
10. Non-secret notification settings are editable in the dashboard. API keys and secrets remain in Coolify and are only shown as configured/not configured.

## 3. Scope

### 3.1 Public website

The public website retains these sections and behaviors:

- header and responsive navigation;
- hero slider, headline, supporting copy, calls to action, and metrics;
- about section, portrait, biography, skills, and signature;
- services;
- filterable portfolio gallery and lightbox;
- before/after retouch comparison;
- collaboration process;
- equipment list;
- packages and pricing;
- client/brand marquee;
- testimonials carousel;
- magazine/article listing and article detail pages;
- frequently asked questions;
- project inquiry form;
- footer, contact information, social links, and copyright;
- light/dark presentation where supported by the current design.

### 3.2 Administration dashboard

The administrator can manage:

- global brand identity and contact settings;
- navigation items and calls to action;
- all section headings, descriptions, visibility, and ordering;
- hero slides and hero content;
- about content, portrait, skills, and signature;
- services and their display order;
- portfolio categories and portfolio items;
- before/after assets and labels;
- process steps and equipment;
- packages, included/excluded features, prices, and featured state;
- clients and testimonials;
- articles, article categories, slugs, full content, SEO, draft/published state, and publication time;
- FAQs;
- public inquiry-form project types and budget ranges;
- inquiries, statuses, internal notes, filters, search, and CSV export;
- footer content and social links;
- manually controlled public metrics;
- global and page-specific SEO;
- a constrained set of design tokens;
- SMS notification configuration that is safe to store outside secret storage.

The system does not include a generic drag-and-drop page builder. Content remains structured so validation, accessibility, SEO, and visual integrity can be enforced.

### 3.3 Explicit exclusions

- public registration or login;
- multiple administrators or role-based access control;
- customer portals;
- online payments;
- appointment calendar synchronization;
- WhatsApp delivery in the initial release;
- arbitrary executable HTML, JavaScript, or CSS entered through the dashboard;
- a fully unconstrained visual page builder;
- analytics implementation beyond storing validated integration identifiers.

## 4. Architecture

### 4.1 Runtime components

```text
Browser
  |-- Public Next.js routes
  |-- Protected /admin routes
  |-- Public inquiry endpoint
             |
             v
      Next.js Node.js container
        |-- domain modules
        |-- server actions/route handlers
        |-- Better Auth
        |-- notification outbox worker
        |-- image processing
             |          |
             v          v
        PostgreSQL    MinIO
             |
             v
      SMS.ir provider adapter
```

The application is deployed as a single Next.js Node.js container using standalone output. Coolify's reverse proxy terminates TLS and fronts the application. PostgreSQL is private to the Coolify network. MinIO's API is private; media delivery uses controlled public URLs or an application delivery route according to the final cache policy.

### 4.2 Technology baseline

- Node.js 24 runtime image;
- Next.js 16 App Router;
- React 19;
- TypeScript with `strict: true`;
- pnpm with a committed lockfile;
- Tailwind CSS backed by project design tokens;
- PostgreSQL;
- Drizzle ORM with generated, version-controlled SQL migrations;
- Better Auth with email/password enabled and public sign-up disabled;
- TOTP multi-factor authentication with single-use recovery codes;
- MinIO JavaScript SDK through a storage interface;
- Zod schemas at every untrusted input boundary;
- Vitest and Testing Library for unit/component tests;
- Playwright for end-to-end tests;
- axe integration for automated accessibility checks;
- Sharp for server-side image derivatives;
- structured application logging with sensitive-field redaction.

Dependencies are pinned by the lockfile and updated only through reviewed pull requests. Next.js receives current security patches within the selected major version.

### 4.3 Module boundaries

The codebase is organized by feature rather than one large technical layer:

- `auth`: administrator session, bootstrap, login throttling, password change;
- `content`: site settings, sections, navigation, and design tokens;
- `portfolio`: categories and portfolio items;
- `services`: services, process steps, and equipment;
- `packages`: packages and package features;
- `social-proof`: clients and testimonials;
- `articles`: categories, articles, publishing, slugs, redirects, and SEO;
- `faqs`: FAQ entries;
- `media`: object storage, validation, derivatives, references, and deletion;
- `inquiries`: public submission, status transitions, notes, search, and export;
- `notifications`: outbox, provider adapters, SMS.ir, retry policy, and delivery log;
- `seo`: metadata, sitemap, robots, and structured data;
- `audit`: security and content-change audit records.

Each module owns its validation schemas, server-side operations, database queries, and tests. Public and admin UI components consume module interfaces and do not query the database directly.

## 5. Data Model

All primary records use UUID identifiers, `created_at`, `updated_at`, and nullable `deleted_at` for soft deletion where deletion applies. Database columns use `TEXT` instead of arbitrary `VARCHAR` limits. Relationships are represented by UUID fields without database foreign-key constraints and are validated by repositories and transactional domain services. Partial indexes exclude soft-deleted records where relevant.

### 5.1 Identity and security

- Better Auth managed user, account, session, and verification tables;
- `admin_profile`: display name and security metadata for the single administrator;
- `login_attempt`: privacy-minimized throttle state;
- `audit_log`: actor, action, entity type/id, metadata, request correlation id, and timestamp.

The bootstrap process is an explicit, one-time command rather than automatic startup behavior. It creates exactly one administrator from environment-provided bootstrap credentials only when no administrator exists. Successful bootstrap records completion, requires enrollment of TOTP MFA, and requires removal of the bootstrap password from Coolify. Re-running bootstrap after completion is rejected. Password changes revoke all other sessions. Account recovery uses an authenticated server-side CLI/runbook procedure and never a public recovery endpoint. Public sign-up routes are disabled.

### 5.2 Global content

- `site_setting`: singleton brand, contact, locale, footer, and integration settings;
- `navigation_item`: label, target, order, visibility, and external-link state;
- `page_section`: stable section key, headings, body copy, visibility, and order;
- `social_link`: platform, URL, label, order, and visibility;
- `design_token_setting`: approved token key and validated value;
- `metric`: label, value, suffix, order, and visibility.

### 5.3 Portfolio and services

- `hero_slide`: media id, alt text, order, and visibility;
- `about_skill`: label, percentage, order, and visibility;
- `portfolio_category`: name, slug, order, and visibility;
- `portfolio_item`: category id, media id, title, description, alt, featured, order, and visibility;
- `before_after_item`: before media id, after media id, labels, alt text, and visibility;
- `service`: icon, title, description, order, and visibility;
- `service_feature`: service id, label, and order;
- `process_step`: number, title, description, order, and visibility;
- `equipment_item`: icon, title, order, and visibility;
- `package`: title, price, unit, subtitle, featured, order, and visibility;
- `package_feature`: package id, label, included state, and order.

### 5.4 Editorial and social proof

- `client`: name, initials, optional media id, URL, order, and visibility;
- `testimonial`: person, organization/role, rating, quote, media id, order, and visibility;
- `article_category`: name, slug, order, and visibility;
- `article`: category id, slug, title, excerpt, sanitized structured body, hero media id, reading time, publication state/time, and SEO fields;
- `slug_redirect`: entity type, previous path, destination path, and active state;
- `faq_item`: question, answer, order, and visibility.

### 5.5 Media

- `media_asset`: object key, original filename, MIME type, byte size, width, height, checksum, alt text, status, and timestamps;
- `media_variant`: asset id, variant name, object key, MIME type, width, height, and byte size;
- `media_reference`: asset id, entity type, entity id, and field key.

Media deletion is rejected while active references exist. Upload completion is transactional at the application level: a failed database write triggers object cleanup, and a failed object operation leaves a recoverable media status for reconciliation.

### 5.6 Inquiries and notifications

- `inquiry`: visitor fields, project type, proposed date, budget range, message, NDA flag, status, normalized contact data, keyed-HMAC abuse-control identifier, and timestamps;
- `inquiry_note`: inquiry id, note, and timestamp;
- `inquiry_status_history`: inquiry id, previous/new status, and timestamp;
- `form_option`: option group, label, value, order, active state;
- `notification_setting`: provider/channel, enabled state, recipient, template identifier/text, and safe provider options;
- `notification_outbox`: event type, payload, provider, state, attempt count, next attempt, and timestamps;
- `notification_delivery`: outbox id, provider request id, response class, redacted error, and timestamp.

Inquiry status transitions are:

```text
new -> viewed -> contacted -> quoted -> scheduled -> completed
                                  |          |
                                  +----------+-> cancelled
```

Invalid backward transitions are rejected except for an explicit administrator correction that is audit-logged.

## 6. Data Flow

### 6.1 Public content

Published content is rendered on the server. Content mutations issue targeted cache invalidation so the public site reflects approved changes without rebuilding the Docker image. Draft articles and hidden sections are never returned by public queries.

### 6.2 Content mutation

1. A protected admin action validates the full administrator session.
2. Zod validates and normalizes the request.
3. The domain service checks invariants and references.
4. The repository mutation and audit record run in one PostgreSQL transaction where multiple tables change.
5. Relevant cache tags/paths are invalidated after commit.
6. The response returns a Persian success or actionable error message.

### 6.3 Inquiry submission

1. The public form validates client-side for usability and server-side for trust.
2. A honeypot, rate limiter, payload-size limit, and normalized contact checks reject abuse.
3. The inquiry and notification outbox record are written in one transaction.
4. The visitor receives success after durable database commit, regardless of SMS availability.
5. The notification worker sends through SMS.ir and stores the redacted outcome.
6. Transient errors retry with bounded exponential backoff; permanent errors remain visible in the admin dashboard.
7. Notification payloads contain only the minimum information necessary to alert the administrator; full inquiry text remains in PostgreSQL.

### 6.4 Media upload

1. The server validates authenticated session, MIME signature, extension, byte size, dimensions, and total pixel count.
2. The image is decoded under resource limits to reject malformed content and decompression bombs.
3. Public derivatives are re-encoded, metadata/EXIF is stripped, and approved variants are written to MinIO under generated object keys.
4. Metadata is committed to PostgreSQL.
5. Admin UI receives a usable media asset; failed partial uploads are reconciled or removed.

## 7. Security Requirements

- Public sign-up is disabled at configuration and route level.
- Only one enabled administrator is allowed by application invariant.
- Passwords use Better Auth's secure password hashing and are never logged.
- TOTP MFA is mandatory for the administrator after bootstrap; recovery codes are hashed, single-use, and regenerated only from an authenticated session or the server recovery runbook.
- Session cookies are `HttpOnly`, `Secure` in production, and use an appropriate `SameSite` policy.
- Every admin mutation verifies a complete server-side session; proxy redirects are not the authorization boundary.
- Login and public inquiry endpoints are rate-limited. Abuse identifiers are produced with keyed HMAC and a rotating server-side secret rather than an unsalted IP hash.
- Repeated login failures cause bounded temporary lockout without enabling permanent denial of service.
- CSRF protections cover cookie-authenticated mutations.
- Rich article content is sanitized against a strict allowlist.
- URL inputs allow only approved schemes.
- MinIO credentials, database credentials, auth secret, and SMS.ir API key exist only in Coolify environment variables.
- Admin settings show only configured/not-configured state for secrets.
- Uploads enforce a configurable maximum of 15 MiB and approved image MIME signatures.
- SVG uploads are disabled in the initial release.
- Original uploads are private and never served inline. Public derivatives use `nosniff`, explicit content types, controlled caching, and safe content disposition; temporary private access uses short-lived presigned URLs.
- CSV output prevents formula injection by escaping cells beginning with spreadsheet control characters.
- All ORM queries are parameterized. Raw SQL containing untrusted values is prohibited, and generated SQL is reviewed and committed as a migration before execution.
- SMS.ir endpoints are fixed in server configuration and cannot be edited in the dashboard. Provider requests require TLS, strict timeouts, disabled redirects, bounded response bodies, and an outbound-host allowlist.
- Logs redact passwords, tokens, cookies, API keys, full message bodies, and full contact values.
- Security headers include CSP, frame restrictions, MIME sniffing protection, referrer policy, and permissions policy.
- Production errors expose a correlation id, not stack traces or internal details.
- Admin and inquiry responses use `Cache-Control: no-store` and are excluded from shared caches.

### 7.1 Privacy and retention

- Inquiries are retained for 24 months by default. The administrator can reduce this period from a bounded settings control; increasing it beyond 24 months requires an explicit deployment configuration change.
- Expired inquiries are anonymized unless an active project status requires retention. Deletion/anonymization actions are audit-logged.
- Notification delivery payloads and provider responses are reduced to redacted operational metadata after 30 days.
- Audit records are retained for 24 months and do not contain full inquiry bodies or secrets.
- Viewing inquiry details and exporting CSV are audit-logged.
- Database and object-storage backups are encrypted, access-controlled, and expire according to the documented backup schedule.

## 8. Accessibility and Visual Requirements

- Persian RTL is the default document direction and language.
- The current dark/gold identity, typography hierarchy, gallery character, and motion style are preserved.
- The layout is usable at 320 px and has no unintended horizontal scrolling.
- Interactive targets are at least 44 by 44 CSS pixels where applicable.
- All functionality is keyboard operable with visible focus.
- Form controls have persistent labels, field-level errors, and a summary for failed submissions.
- Dialogs trap focus, restore focus on close, close through an explicit button and Escape, and expose correct accessible names.
- Images have meaningful alt text or empty alt for decorative use.
- Heading hierarchy is logical and landmarks are labeled.
- Color contrast meets WCAG 2.2 AA.
- Animations respect `prefers-reduced-motion`.
- Dynamic success/error notifications use appropriate live regions without stealing focus.

## 9. SEO and Performance

- Metadata is generated server-side from global and entity settings.
- The application provides canonical URLs, Open Graph metadata, social preview images, `robots.txt`, and XML sitemap.
- Structured data covers the professional/local business identity, portfolio-relevant image objects, breadcrumbs, and articles where applicable.
- Article drafts and admin routes are `noindex` and absent from sitemap.
- Slug changes create redirect records to avoid broken indexed URLs.
- Images use intrinsic dimensions, responsive sizes, lazy loading below the fold, and AVIF/WebP derivatives.
- Fonts are self-hosted and subset where licensing permits.
- Public pages avoid unnecessary client-side JavaScript; server components are the default.
- Production quality target is at least 90 in Lighthouse Performance, Accessibility, Best Practices, and SEO for the home page and article detail template under the agreed test environment.
- Core flows have no browser console errors, failed first-party requests, broken assets, or layout overflow at desktop and mobile test viewports.

## 10. Error Handling and Observability

- Domain errors have stable machine codes and Persian user-facing messages.
- Expected validation and conflict errors do not become generic 500 responses.
- Every request receives a correlation id propagated into structured logs and notification delivery records.
- `/api/health/live` proves process liveness without dependency calls.
- `/api/health/ready` verifies required PostgreSQL and MinIO connectivity with strict timeouts.
- Notification failures degrade gracefully and remain retryable.
- Media inconsistencies are represented explicitly and can be reconciled without database surgery.
- Coolify health checks use the liveness endpoint; deployment smoke tests also exercise readiness.

## 11. Testing and Quality Gates

Each implementation phase follows red-green-refactor and closes only after its gate is green.

- Unit tests: schemas, state transitions, slug rules, sanitization, message rendering, and provider error mapping.
- Repository integration tests: PostgreSQL constraints, soft deletion, ordering, transactions, filtering, and migrations.
- Storage integration tests: upload, derivative generation, retrieval, invalid file rejection, reference-safe deletion, and failure cleanup.
- Authentication integration tests: bootstrap, sign-in, sign-out, session expiry, disabled sign-up, password change, and throttling.
- Notification integration tests: mocked HTTP boundary for success, transient failure, permanent failure, redaction, retry, and idempotency.
- Component tests: admin forms, dialogs, tables, validation feedback, and keyboard behavior.
- Playwright E2E: public navigation, responsive layouts, inquiry submission, admin login, all content CRUD flows, publishing, media upload, and logout.
- Accessibility: automated axe checks plus manual keyboard and reduced-motion review.
- Security: dependency audit, secret scan, authorization checks, upload abuse cases, CSV injection, XSS payloads, and CSRF verification.
- CI: formatting, lint, typecheck, unit/component tests, integration tests, production build, E2E smoke tests, and Docker image build.

No phase advances with a failing required check. Tests must assert observable behavior rather than implementation details.

## 12. Delivery Phases

### Phase 0: Repository and engineering foundation

Deliver a private GitHub repository, protected `main`, feature-branch workflow, project README, contribution/development commands, Next.js scaffold, strict TypeScript, formatting/linting, Vitest, Playwright, baseline GitHub Actions, and a sanitized legacy HTML reference under `docs/legacy/`. The executable legacy file is excluded from application build/deploy roots; demo credentials and synthetic personal data are removed before it is committed.

Gate: clean install from lockfile, lint, typecheck, baseline tests, production build, and Docker build all pass in CI.

### Phase 1: Infrastructure and persistence

Deliver local Docker Compose for PostgreSQL and MinIO, validated environment configuration, database connection, schema/migration infrastructure, storage client boundary, liveness/readiness routes, and deterministic test infrastructure.

Gate: containers become healthy; migrations run from an empty database; PostgreSQL and MinIO integration tests pass; readiness changes correctly when a dependency is unavailable.

### Phase 2: Single-administrator authentication

Deliver Better Auth integration, explicit one-time admin bootstrap, disabled sign-up, mandatory TOTP MFA with recovery codes, protected admin layout/actions, login/logout/password-change flows, throttling, session policy, audit events, and secure server-side recovery runbook.

Gate: authentication integration and E2E tests pass; public sign-up is impossible; unauthenticated access cannot read or mutate admin resources.

### Phase 3: Public visual migration

Deliver the current site's public UI as accessible, responsive components using seed-backed repositories, with visual tokens, public navigation, hero, about, gallery, services, process, equipment, packages, clients, testimonials, FAQs, contact, and footer.

Gate: desktop/mobile E2E and accessibility checks pass; visual review confirms preserved identity; no console errors, broken first-party assets, or horizontal overflow.

### Phase 4: Content management

Deliver custom admin CRUD for all structured content, ordering, visibility, settings, design token controls, validation, audit records, and targeted public cache invalidation.

Gate: every approved public content field is editable; mutations persist across sessions and appear publicly; invalid changes are rejected; CRUD E2E matrix passes.

### Phase 5: Media library

Deliver MinIO uploads, derivatives, metadata/alt editing, media picker, search, reference tracking, and safe deletion.

Gate: happy path and abuse/failure integration tests pass; public pages use optimized variants; referenced assets cannot be deleted.

### Phase 6: Articles and SEO

Deliver article editor, categories, draft/publish scheduling, article pages, slug redirects, reading time, metadata, sitemap, robots, and structured data.

Gate: draft isolation, publish/unpublish, redirects, metadata snapshots, sitemap, structured data, and article E2E tests pass.

### Phase 7: Inquiries

Deliver the public project form, durable inquiry storage, spam/rate controls, admin list/detail, status history, internal notes, filtering/search, form-option management, and safe CSV export.

Gate: a real browser submission appears in admin after reload; duplicate/invalid/abusive payload cases behave correctly; status and CSV tests pass.

### Phase 8: Notifications

Deliver notification outbox processing, provider interface, SMS.ir adapter, admin-safe settings, delivery logs, retries, and future WhatsApp adapter seam.

Gate: inquiry persistence is independent of provider availability; notification success, permanent error, transient retry, idempotency, and redaction tests pass.

### Phase 9: Production hardening

Deliver CSP/security headers, dependency and secret checks, performance tuning, accessibility manual review, backup scripts/runbooks, observability, data-retention controls, and restore procedure.

Gate: full CI, security checklist, Lighthouse targets, backup creation, and restore rehearsal pass with recorded evidence.

### Phase 10: Coolify production release

Deliver standalone multi-stage Docker image, non-root runtime, Coolify resource configuration guide, PostgreSQL scheduled backup configuration, MinIO backup job, migration release command, health checks, deployment/rollback runbook, and production smoke tests.

Gate: HTTPS production deployment is healthy; schema is current; media persists across redeploy; inquiry-to-SMS flow succeeds; rollback and backup restore are verified.

## 13. Deployment and Operations

- GitHub `main` represents production and is protected by required CI checks.
- Work occurs on `feature/<ticket>-<slug>` and `fix/<ticket>-<slug>` branches.
- Coolify deploys only after required checks pass and the change reaches `main`.
- The application Docker image uses Next.js standalone output and a non-root runtime user. Where runtime compatibility permits, it uses a read-only root filesystem, drops Linux capabilities, enables `no-new-privileges`, mounts no Docker socket, exposes only the application port, and receives secrets only at runtime rather than through build arguments or image layers.
- PostgreSQL and MinIO are not exposed publicly unless an explicitly reviewed operational need arises.
- Coolify owns TLS termination and reverse proxying.
- Database migration is an explicit release step and fails deployment on error.
- Shutdown allows 10–30 seconds for in-flight work to finish.
- Database backups run daily with at least seven daily and four weekly recovery points. Backups are encrypted and restore credentials are separated from normal application credentials.
- MinIO objects are backed up daily to storage independent of the primary volume.
- A restore rehearsal is required before production acceptance and after material backup-process changes.
- Rollback restores the prior application image; backward-incompatible schema changes use expand/migrate/contract releases rather than destructive one-step migrations.

## 14. Acceptance Criteria

The project is production-ready only when all of the following are true:

1. A clean environment can build and run the documented stack from version-controlled files.
2. The public visual identity matches the approved existing site across desktop and mobile.
3. Every in-scope public content field is manageable from the dashboard.
4. Content survives browser clearing, device changes, app redeploys, and administrator logout.
5. Only the single administrator can enter or mutate the dashboard.
6. Public registration and user-management functionality do not exist.
7. Media uploads are validated, optimized, durable, and reference-safe.
8. Public inquiry submission is durable and visible in the dashboard.
9. SMS failure never loses an inquiry and is visible/retryable.
10. Secrets do not exist in source, client bundles, admin settings payloads, or logs.
11. Required automated tests and CI checks pass.
12. Lighthouse targets are met in the agreed production-like test environment.
13. Coolify health checks, HTTPS, deployment, rollback, backup, and restore are verified.
14. Operational and recovery steps are documented so the owner is not dependent on the original developer.
15. The administrator must complete MFA enrollment before normal dashboard access is granted.

## 15. Primary Documentation References

- Next.js App Router: https://nextjs.org/docs/app
- Next.js self-hosting: https://nextjs.org/docs/app/guides/self-hosting
- Next.js Docker deployment: https://nextjs.org/docs/app/getting-started/deploying
- Better Auth Next.js integration: https://better-auth.com/docs/integrations/next
- Better Auth email/password: https://better-auth.com/docs/authentication/email-password
- Drizzle migrations: https://orm.drizzle.team/docs/migrations
- MinIO JavaScript SDK: https://docs.min.io/aistor/developers/sdk/javascript/
- Coolify databases and persistence: https://next.coolify.io/docs/databases/

The SMS.ir adapter will be implemented against the authenticated account's current official API documentation. Its external request/response details are isolated behind the notification provider interface so API changes do not affect inquiry persistence or admin workflows.
