# 3evda.com

وب‌سایت و پنل مدیریت سودا رحیم‌پور، عکاس غذا و محصول.
**استک:** Django و DRF، Next.js، PostgreSQL، Redis + Celery، SeaweedFS (S3)، Caddy، و همه در Docker Compose روی Coolify.

- سند طراحی: [`docs/superpowers/specs/2026-10-02-photographer-platform-design.md`](docs/superpowers/specs/2026-10-02-photographer-platform-design.md)
- نقشه‌ی راه و روند فازها: [`docs/superpowers/plans/2026-10-02-roadmap.md`](docs/superpowers/plans/2026-10-02-roadmap.md)
- استقرار روی Coolify: [`docs/runbooks/coolify.md`](docs/runbooks/coolify.md)
- تصمیم‌های معماری: [`docs/adr/`](docs/adr/)

## ساختار

```text
docker-compose.yml   استک production (Coolify همین فایل را اجرا می‌کند)
compose.dev.yml      override برای توسعه و CI (پورت‌های محلی)
backend/             Django (config/، apps/)
frontend/            Next.js (src/app/[locale]، messages/)
e2e/                 تست‌های Playwright روی استک کامل
infra/caddy/         gateway (مسیریابی /api، /media و ...)
docs/                طراحی، برنامه‌ها، ADR و ران‌بوک
```

## پیش‌نیازها

- Docker همراه با Compose v2
- برای توسعه‌ی بدون Docker: Python 3.13 با [uv](https://docs.astral.sh/uv/)، و Node.js 24 با pnpm 10

## اجرای کامل با Docker

```bash
cp .env.example .env    # مقادیر خالی را با رشته‌های تصادفی پر کنید
# برای اجرای محلی: DJANGO_ALLOWED_HOSTS=localhost و PUBLIC_URL=http://localhost:8080
docker compose -f docker-compose.yml -f compose.dev.yml up --build --wait
```

پس از اجرا این آدرس‌ها در دسترس‌اند:
- سایت: http://localhost:8080 (فارسی) و http://localhost:8080/en
- سلامت سرویس‌ها: http://localhost:8080/api/health/ready

## توسعه

سرویس‌های پایه را با Docker بالا بیاورید و اپ‌ها را مستقیم اجرا کنید:

```bash
docker compose -f docker-compose.yml -f compose.dev.yml up -d postgres redis storage

cd backend
uv sync
export POSTGRES_PASSWORD=...        # همان مقدار .env
export S3_ACCESS_KEY=... S3_SECRET_KEY=...
uv run python manage.py migrate
uv run python manage.py ensure_buckets
uv run python manage.py runserver

cd frontend
pnpm install
pnpm dev
```

## بررسی‌ها (همان چیزی که CI اجرا می‌کند)

| بخش | فرمان |
|---|---|
| backend | `uv run ruff check . && uv run ruff format --check . && uv run mypy . && uv run pytest` |
| frontend | `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:run && pnpm build` |
| e2e | استک را بالا بیاورید، سپس در `e2e/` اجرا کنید: `pnpm install && pnpm install-browsers && pnpm test` |

وقتی وابستگی Python را تغییر می‌دهید، `requirements.txt` (که Docker از آن نصب می‌کند) را هم به‌روز کنید:

```bash
cd backend
uv export --frozen --no-dev --no-emit-project --format requirements-txt -o requirements.txt
```

وقتی API در backend تغییر می‌کند، قرارداد API را دوباره بسازید و commit کنید (job ‏`contract` در CI این را بررسی می‌کند):

```bash
cd backend && uv run python manage.py spectacular --settings=config.settings.test \
  --format openapi-json --file openapi.json --validate --fail-on-warn
cd frontend && pnpm api:types
```

## ساخت ادمین

فقط یک کاربر (صاحب سایت) وجود دارد و ثبت‌نام عمومی نیست. یک‌بار روی سرور اجرا کنید:

```bash
docker compose exec api python manage.py bootstrap_admin --username sevda   # رمز را می‌پرسد
```

سپس در `/panel` وارد شوید و ورود دومرحله‌ای (TOTP) را فعال کنید. اگر دسترسی به اپ authenticator از دست رفت، بخش «بازیابی دسترسی ادمین» در ران‌بوک را ببینید.

## روند کار

1. برای هر فاز یا تغییر یک branch بسازید و Pull Request به `main` باز کنید.
2. CI (`backend`، `frontend`، `e2e` و `security`) باید سبز شود.
3. بعد از بازبینی، PR به‌صورت Squash merge می‌شود.
4. بعد از merge، workflow `Deploy` دیپلوی Coolify را اجرا و نسخه‌ی زنده را بررسی می‌کند.

> هیچ رمز، کلید یا فایل `.env` واقعی را commit نکنید. همه‌ی رمزها فقط در Environment Variables خود Coolify قرار می‌گیرند.
