# ران‌بوک: استقرار روی Coolify

این راهنما برای اولین راه‌اندازی و دیپلوی‌های بعدی 3evda.com روی سرور Coolify است.

## ۱. پیش‌نیازها

- رکورد DNS از نوع `A` برای `3evda.com` و `www.3evda.com` که به IP سرور اشاره کند.
- Coolify نصب شده و به GitHub متصل باشد (GitHub App یا Deploy Key) و به مخزن `arazshah/3evda` دسترسی داشته باشد.

## ۲. ساخت Resource

1. در Coolify: **Project → New → Resource** و انتخاب مخزن `arazshah/3evda`.
2. تنظیمات:
   - **Branch:** `main`
   - **Build Pack:** `Docker Compose`
   - **Docker Compose Location:** `/docker-compose.yml`
3. در بخش سرویس‌ها فقط سرویس **gateway** دامنه می‌گیرد:
   - Domains: `https://3evda.com,https://www.3evda.com`
   - پورت داخلی gateway ‏۸۰ است و نیازی به نوشتن پورت نیست.
   - ریدایرکت www به دامنه‌ی اصلی را از تنظیمات Redirect همان Resource فعال کنید.
4. به سرویس‌های دیگر (web، api، worker، postgres، redis و storage) **هیچ دامنه یا پورتی** ندهید.
5. در **Advanced** گزینه‌ی **Include Source Commit in Build** را فعال کنید. نسخه‌ی گزارش‌شده در `/api/health/live` از همین مقدار (`SOURCE_COMMIT`) می‌آید و workflow دیپلوی با آن تشخیص می‌دهد که نسخه‌ی جدید بالا آمده است.

## ۳. متغیرهای محیطی

در **Environment Variables** همان Resource مقادیر زیر را وارد کنید. فهرست کامل در `.env.example` است. مقادیر رمز را با این فرمان بسازید:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

| متغیر | مقدار |
|---|---|
| `DJANGO_SECRET_KEY` | رشته‌ی تصادفی، حداقل ۵۰ کاراکتر |
| `DJANGO_ALLOWED_HOSTS` | `3evda.com,www.3evda.com` |
| `PUBLIC_URL` | `https://3evda.com` |
| `POSTGRES_PASSWORD` | رشته‌ی تصادفی |
| `S3_ACCESS_KEY` | رشته‌ی تصادفی (فقط حروف و اعداد) |
| `S3_SECRET_KEY` | رشته‌ی تصادفی (فقط حروف و اعداد) |

> **هشدار:** `POSTGRES_PASSWORD` و کلیدهای S3 بعد از اولین اجرا در volumeها ثبت می‌شوند. تغییر بعدی آن‌ها به مهاجرت دستی نیاز دارد؛ از همان ابتدا مقدار نهایی را بگذارید.

### اگر سرور به Docker Hub، PyPI یا npm دسترسی ندارد

یک گزینه این متغیرها هستند که Dockerfileها از آن‌ها پشتیبانی می‌کنند:

| متغیر | مثال |
|---|---|
| `BASE_REGISTRY` | آدرس میرور ایمیج‌های رسمی، با پیشوند `library` |
| `PIP_INDEX_URL` | آدرس میرور PyPI (`.../simple`) |
| `NPM_CONFIG_REGISTRY` | آدرس میرور npm |
| `DEBIAN_MIRROR` | آدرس میرور Debian برای `apt` در ایمیج api (جایگزین `deb.debian.org`) |
| `SEAWEEDFS_IMAGE` | آدرس کامل ایمیج SeaweedFS در میرور |

گزینه‌ی دیگر این است که در خود سرور برای Docker میرور تعریف کنید (`/etc/docker/daemon.json` و سپس `systemctl restart docker`):

```json
{ "registry-mirrors": ["https://<docker-mirror-address>"] }
```

نتیجه‌ی اولین بیلد (کدام دسترسی وجود داشت و کدام میرور لازم شد) را در بخش ۸ همین سند ثبت کنید.

## ۴. دیپلوی خودکار پس از CI

روش پیشنهادی این است که دیپلوی فقط وقتی انجام شود که CI روی `main` سبز شده باشد:

1. در Coolify، **Auto Deploy** این Resource را خاموش کنید.
2. از صفحه‌ی **Webhooks** همان Resource آدرس **Deploy Webhook** را کپی کنید.
3. در **Keys & Tokens → API Tokens** یک توکن با دسترسی deploy بسازید.
4. در GitHub بروید به **Settings → Environments → New environment** و یک environment به نام `production` بسازید. سپس:
   - Secret: `COOLIFY_DEPLOY_URL` = آدرس وبهوک
   - Secret: `COOLIFY_TOKEN` = توکن API
   - (اختیاری) Variable: `PUBLIC_URL` = `https://3evda.com`
5. از این به بعد هر merge به `main` این مسیر را طی می‌کند: CI ← workflow `Deploy` ← دیپلوی Coolify ← صبر تا `/api/health/live` نسخه‌ی همان commit را گزارش دهد ← smoke test.

**اگر GitHub نتواند به سرور ایران وصل شود** (خطای timeout در مرحله‌ی Trigger):
- Auto Deploy را در Coolify روشن کنید و secretهای بالا را خالی بگذارید.
- workflow دیپلوی را trigger نمی‌کند ولی همچنان منتظر نسخه‌ی جدید می‌ماند و smoke test را اجرا می‌کند.
- در این حالت Coolify با push به `main` دیپلوی می‌کند. چون merge فقط با CI سبز ممکن است، کد تست‌نشده وارد `main` نمی‌شود.

## ۵. ساخت ادمین (یک‌بار)

بعد از اولین دیپلوی، در Coolify به **Terminal** سرویس `api` بروید (یا روی سرور `docker exec -it <api-container> sh`) و اجرا کنید:

```bash
python manage.py bootstrap_admin --username sevda
```

رمز را دو بار می‌پرسد (حداقل ۱۲ کاراکتر). سپس به `https://3evda.com/panel` بروید، وارد شوید، کد QR را با اپ authenticator اسکن کنید و **کدهای بازیابی را جای امن ذخیره کنید**.

- دستور فقط وقتی کار می‌کند که هیچ کاربری وجود نداشته باشد. پایگاه داده هم اجازه‌ی ساخت کاربر دوم را نمی‌دهد.
- اگر رمز را با متغیر `ADMIN_BOOTSTRAP_PASSWORD` داده‌اید، بلافاصله آن را از Coolify پاک کنید.

**بدون ترمینال:** در Environment Variables همین Resource این دو متغیر را بگذارید و Redeploy بزنید؛ `api` هنگام بالا آمدن مالک را می‌سازد (اگر مالکی وجود داشته باشد هیچ کاری نمی‌کند):

| متغیر | مقدار |
|---|---|
| `ADMIN_BOOTSTRAP_USERNAME` | `sevda` |
| `ADMIN_BOOTSTRAP_PASSWORD` | رمز دلخواه، حداقل ۱۲ کاراکتر |

بعد از اولین ورود و ثبت TOTP، `ADMIN_BOOTSTRAP_PASSWORD` را حتماً از Coolify پاک کنید.

### بازیابی دسترسی ادمین

| مشکل | راه‌حل |
|---|---|
| گوشی یا اپ authenticator گم شده ولی کد بازیابی دارید | در صفحه‌ی ورود به‌جای کد ۶ رقمی یک کد بازیابی وارد کنید، سپس از «امنیت» کدهای جدید بسازید |
| نه اپ و نه کد بازیابی | در Terminal سرویس `api`: `python manage.py reset_admin_mfa`. همه‌ی sessionها بسته و TOTP حذف می‌شود؛ در ورود بعدی دوباره ثبت کنید |
| رمز فراموش شده | در Terminal سرویس `api`: `python manage.py changepassword sevda` |
| قفل‌شدن بعد از ۵ تلاش ناموفق | ۱۵ دقیقه صبر کنید، یا در Terminal: `python manage.py axes_reset` |

همه‌ی این اقدام‌ها در Audit Log ثبت می‌شوند.

## ۶. محافظت از `main` در GitHub

در **Settings → Branches → Add branch ruleset** (یا Branch protection rule) برای `main`:
- **Require a pull request before merging**
- **Require status checks to pass:** `backend`، `frontend`، `contract`، `e2e`، `security` و گزینه‌ی *Require branches to be up to date*
- **Require conversation resolution**
- **Block force pushes** و **Restrict deletions**
- در **Settings → General → Pull Requests** فقط *Allow squash merging* را فعال بگذارید.

## ۷. بررسی پس از دیپلوی

```bash
curl -s https://3evda.com/api/health/live     # {"status":"ok","version":"<commit>"}
curl -s https://3evda.com/api/health/ready    # همه‌ی checkها "ok"
curl -sI https://3evda.com/en | head -1       # 200
```

**عیب‌یابی:**
- لاگ هر سرویس در Coolify، بخش **Logs** همان Resource، قابل مشاهده است.
- اگر `ready` خطای ۵۰۳ برگرداند، نام سرویس خراب در پاسخ آمده است (`database`، `redis` یا `storage`).
- اگر سرویس `api` بالا نمی‌آید، معمولاً migration شکست خورده است. پیام خطا در لاگ api آمده است.
- volumeهای `pgdata_v2`، `redisdata` و `objects_v2` بین دیپلوی‌ها حفظ می‌شوند. هرگز Resource را با گزینه‌ی حذف volumeها پاک نکنید.

**بازگشت به نسخه‌ی قبل (Rollback):**
1. در GitHub، commit خراب را revert کنید و با PR به `main` merge کنید.
2. در موارد اضطراری، از صفحه‌ی **Deployments** در Coolify روی دیپلوی سالم قبلی **Redeploy** بزنید.

⚠️ به نسخه‌های قدیمی‌تر از commit تغییر volume (`pgdata` → `pgdata_v2`) برنگردید: آن نسخه‌ها volume قدیمی را وصل می‌کنند و داده‌های فعلی در `pgdata_v2` جدا می‌مانند. هیچ دیپلوی سالمی قبل از این commit وجود نداشت، پس rollback فقط روی نسخه‌های بعد از آن معنا دارد.

## ۸. یادداشت‌های سرور (پس از اولین دیپلوی تکمیل شود)

| مورد | نتیجه |
|---|---|
| دسترسی به Docker Hub | |
| دسترسی به PyPI | |
| دسترسی به npm | |
| دسترسی GitHub Actions به وبهوک Coolify | |
| میرورهای استفاده‌شده | |

## یادداشت: رمز Postgres و volume

Postgres رمز را فقط هنگام ساخت اولیه‌ی volume ذخیره می‌کند. اگر `POSTGRES_PASSWORD` بعد از اولین دیپلوی عوض شود، `api` با خطای `password authentication failed` بالا نمی‌آید. به همین دلیل volume از `pgdata` به `pgdata_v2` تغییر کرد (دیتابیس خالی بود). پس از این، `POSTGRES_PASSWORD` را عوض نکنید.
