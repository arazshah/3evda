# فاز ۰ — زیرساخت و CI/CD (برنامه‌ی تفصیلی)

**هدف:** یک اسکلت کامل که از Pull Request تا دیپلوی روی Coolify کار می‌کند: Django، Next.js، Postgres، Redis و storage در یک `docker-compose.yml`، با CI سبز و اولین دیپلوی روی `3evda.com`.
**سند طراحی:** `docs/superpowers/specs/2026-10-02-photographer-platform-design.md`
**نقشه‌ی راه:** `docs/superpowers/plans/2026-10-02-roadmap.md`

## قیود

- هیچ قابلیت محصولی (auth، مدل محتوا، آپلود) در این فاز پیاده نمی‌شود.
- نسخه‌ها دقیق پین می‌شوند: `uv.lock` و `pnpm-lock.yaml` commit می‌شوند، ایمیج‌های پایه با tag دقیق و actionها با SHA.
- هیچ رمز یا `.env` واقعی commit نمی‌شود و compose برای متغیرهای ضروری از `${VAR:?}` استفاده می‌کند.
- همه‌ی کانتینرهای اپلیکیشن با کاربر غیر root (UID ‏10001) و بدون پورت باز به بیرون اجرا می‌شوند، به‌جز gateway در compose توسعه.

---

### Task 1 — اسکلت مخزن
**فایل‌ها:** `README.md` (فارسی)، `.gitignore`، `.editorconfig`، `.gitattributes`، `.env.example`، `docs/adr/0000-template.md`

- [ ] ساختار پوشه‌ها مطابق بخش ۶.۳ طراحی
- [ ] `.env.example` با همه‌ی متغیرها و توضیح: `DJANGO_SECRET_KEY`، `DJANGO_ALLOWED_HOSTS`، `PUBLIC_URL`، `POSTGRES_*`، `REDIS_URL`، `S3_*`، `PIP_INDEX_URL`، `NPM_CONFIG_REGISTRY`، `BASE_REGISTRY`، `APP_VERSION`
- [ ] commit: `chore: scaffold monorepo`

### Task 2 — Backend: Django
**فایل‌ها:** `backend/pyproject.toml`، `uv.lock`، `config/settings/{base,dev,test,prod}.py`، `config/urls.py`، `config/wsgi.py`، `config/celery.py`، `apps/core/{views,urls,checks}.py`، `apps/core/tests/test_health.py`، `conftest.py`

- [ ] **تست اول:**
  - `GET /api/health/live` ← ۲۰۰، `{"status":"ok","version":<APP_VERSION>}`، `Cache-Control: no-store`، بدون تماس با دیتابیس
  - `GET /api/health/ready` ← ۲۰۰ وقتی Postgres، Redis و storage سالم‌اند؛ ۵۰۳ با نام وابستگی خراب (بدون جزئیات داخلی) وقتی یکی در دسترس نیست (با mock و timeout کوتاه)
  - تنظیمات prod بدون `DJANGO_SECRET_KEY` اجرا نمی‌شود
- [ ] پیاده‌سازی: تنظیمات از env با django-environ، `LANGUAGE_CODE=fa`، `LANGUAGES=[fa,en]`، `TIME_ZONE=Asia/Tehran`، `USE_TZ=True`، WhiteNoise برای static، DRF، drf-spectacular (`/api/schema/`)، Django admin در `/django-admin/`، و تنظیمات امنیتی prod (`SECURE_PROXY_SSL_HEADER`، کوکی‌های Secure، HSTS، `CSRF_TRUSTED_ORIGINS`)
- [ ] Celery با Redis و یک task `core.ping` همراه تست
- [ ] لاگ JSON ساخت‌یافته با correlation id (middleware `X-Request-ID`)
- [ ] ابزارها: ruff (lint و format)، mypy با django-stubs، pytest-django و pytest-cov
- [ ] commit: `feat(backend): django skeleton with health checks`

### Task 3 — Frontend: Next.js
**فایل‌ها:** `frontend/package.json`، `pnpm-lock.yaml`، `next.config.ts`، `tsconfig.json`، `src/app/[locale]/layout.tsx`، `src/app/[locale]/page.tsx`، `src/i18n/*`، `messages/{fa,en}.json`، `src/app/api/health/route.ts`، `src/styles/tokens.css`، تست‌ها

- [ ] **تست اول (Vitest):**
  - صفحه‌ی `fa` دارای `lang="fa"` و `dir="rtl"` و تیتر «سودا رحیم‌پور» است
  - صفحه‌ی `en` دارای `dir="ltr"` است
  - `GET /api/health` (route داخلی Next) ← ۲۰۰
- [ ] پیاده‌سازی:
  - Next 16 با `output: "standalone"` و `poweredByHeader: false`
  - next-intl با fa پیش‌فرض بدون پیشوند و `/en`
  - صفحه‌ی «به‌زودی» با توکن‌های رنگ برند (`tokens.css` از پالت تأییدشده)
  - فونت‌های self-host (Vazirmatn) در `public/fonts`
  - `prefers-reduced-motion`
- [ ] ابزارها: TypeScript strict (`noUncheckedIndexedAccess`)، ESLint (next core-web-vitals)، Prettier، Vitest و Testing Library
- [ ] commit: `feat(frontend): next.js skeleton with fa/en`

### Task 4 — ADR ذخیره‌سازی
**فایل:** `docs/adr/0001-object-storage.md`

- [ ] مقایسه‌ی MinIO (نسخه‌ی پین‌شده)، SeaweedFS و Garage با این معیارها: در دسترس بودن ایمیج، نگهداری فعال، presigned URL، سادگی single-node، و بکاپ
- [ ] انتخاب و ثبت تصمیم. تست یکپارچه‌ی `put/get/presign` در backend با django-storages
- [ ] commit: `docs(adr): choose object storage`

### Task 5 — Dockerfileها
**فایل‌ها:** `backend/Dockerfile`، `backend/docker-entrypoint.sh`، `frontend/Dockerfile`، `.dockerignore`ها

- [ ] **backend (multi-stage):**
  - stage بیلد با uv و `--frozen`؛ stage اجرا با `python:3.13-slim` و کتابخانه‌های سیستمی لازم برای pyvips و WeasyPrint
  - کاربر 10001
  - entrypoint: `migrate --noinput`، `collectstatic`، `exec gunicorn`
  - حالت `worker`: `exec celery -A config worker -B`
- [ ] **frontend (multi-stage):** `node:24-slim` با pnpm و `--frozen-lockfile`، اجرای خروجی standalone، کاربر 10001
- [ ] آرگومان‌های `BASE_REGISTRY`، `PIP_INDEX_URL` و `NPM_CONFIG_REGISTRY` با پیش‌فرض‌های عمومی، و `APP_VERSION` برای نمایش در health
- [ ] بررسی: ایمیج‌ها بیلد می‌شوند، کاربر 10001 است، و `docs/` و `.env` و تست‌ها داخل ایمیج نیستند
- [ ] commit: `build: production dockerfiles`

### Task 6 — Compose و gateway
**فایل‌ها:** `docker-compose.yml`، `compose.dev.yml`، `infra/caddy/Caddyfile`، `infra/scripts/wait-healthy.sh`

- [ ] سرویس‌ها: gateway، web، api، worker، postgres، redis و storage، با healthcheck و `depends_on: condition: service_healthy`، volumeهای نام‌دار، شبکه‌ی داخلی، و `restart: unless-stopped`
- [ ] Caddy (بدون TLS، پشت Traefik Coolify):
  - `/api/*`، `/django-admin/*` و `/static/*` ← api
  - `/media/*` ← storage (bucket عمومی)
  - `/*` ← web
  - `/healthz`
  - هدرهای `X-Request-ID` و `X-Forwarded-*`
- [ ] برچسب‌ها و توضیحات لازم برای Coolify (اتصال دامنه به gateway:80)
- [ ] `compose.dev.yml`: پورت gateway ‏8080، mount سورس، `runserver` و `next dev`
- [ ] بررسی محلی: `docker compose up --build --wait`، سپس `curl localhost:8080/`، `/en` و `/api/health/ready` ← ۲۰۰
- [ ] commit: `build: docker compose stack with caddy gateway`

### Task 7 — تست‌های E2E روی compose
**فایل‌ها:** `e2e/package.json`، `e2e/playwright.config.ts`، `e2e/tests/smoke.spec.ts`

- [ ] پروژه‌های Chromium دسکتاپ (1280) و موبایل (375x812)
- [ ] تست‌ها:
  - `/` فارسی RTL با تیتر قابل مشاهده
  - `/en` انگلیسی LTR
  - `/api/health/ready` ← ۲۰۰
  - بدون overflow افقی
  - بدون خطای console
  - axe بدون خطای serious یا critical
- [ ] commit: `test(e2e): smoke tests against compose stack`

### Task 8 — GitHub Actions
**فایل‌ها:** `.github/workflows/ci.yml`، `.github/workflows/deploy.yml`، `.github/dependabot.yml`، `.github/pull_request_template.md`، `.github/CODEOWNERS`

- [ ] `ci.yml` با jobهای `backend`، `frontend`، `e2e` و `security` (بخش ۲.۱ نقشه‌ی راه)؛ اجرا روی `pull_request` و `push: main`؛ actionها پین با SHA؛ `permissions: contents: read`؛ concurrency؛ timeout؛ کش uv و pnpm و Docker layers؛ آپلود trace و گزارش‌ها در صورت شکست
- [ ] `deploy.yml`: اجرا با `workflow_run` روی `ci.yml` (فقط وقتی `main` و `success` است)؛ environment `production`؛ صدا زدن وبهوک Coolify؛ صبر برای سلامت؛ smoke test روی `https://3evda.com` و تطبیق `version` با SHA
- [ ] قالب PR با چک‌لیست «تعریف انجام‌شده»
- [ ] Dependabot هفتگی (uv/pip، npm در frontend و e2e، github-actions و docker)
- [ ] commit: `ci: add ci and deploy workflows`

### Task 9 — PR، CI و Branch protection
- [ ] push branch و باز کردن PR «فاز ۰: زیرساخت و CI/CD»
- [ ] رفع هر شکست CI تا سبز شدن همه‌ی jobها
- [ ] (صاحب مخزن) فعال کردن Branch protection روی `main` با چک‌های `backend`، `frontend`، `e2e` و `security`
- [ ] (صاحب مخزن) افزودن Secrets: `COOLIFY_DEPLOY_URL` و `COOLIFY_TOKEN` در environment `production`

### Task 10 — اولین دیپلوی Coolify
**فایل:** `docs/runbooks/coolify.md` (فارسی، با تصویر مراحل)

- [ ] ران‌بوک: ساخت Resource از نوع Docker Compose با اتصال به مخزن و branch `main`، مقداردهی Environment Variables، دامنه‌ی `https://3evda.com` روی سرویس gateway پورت 80، ریدایرکت www، تنظیم میرورها در صورت نیاز، و وبهوک دیپلوی
- [ ] Merge PR ← اجرای `deploy.yml` ← بررسی `https://3evda.com`، `/en` و `/api/health/ready`
- [ ] ثبت نتیجه‌ی دسترسی سرور به Docker Hub، PyPI و npm، و دسترسی GitHub به وبهوک، در ران‌بوک

## گیت تکمیل فاز ۰

- [ ] همه‌ی jobهای `ci.yml` روی PR و روی `main` سبزند
- [ ] `docker compose up --build --wait` از یک clone تمیز موفق است و همه‌ی سرویس‌ها healthy می‌شوند
- [ ] E2E دسکتاپ و موبایل، و axe پاس می‌شوند
- [ ] gitleaks بدون یافته است
- [ ] دیپلوی Coolify سالم است و `https://3evda.com/api/health/live` نسخه‌ی SHA آخرین commit را گزارش می‌دهد
- [ ] Branch protection فعال است
- [ ] README و ران‌بوک به‌روزند

فقط بعد از این گیت، برنامه‌ی تفصیلی فاز ۱ نوشته و اجرا می‌شود.
