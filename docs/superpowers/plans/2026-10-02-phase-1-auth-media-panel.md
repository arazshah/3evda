# فاز ۱ — احراز هویت ادمین، Media و اسکلت پنل (برنامه‌ی تفصیلی)

**هدف:** صاحب سایت با رمز + TOTP وارد پنل `/panel` شود و عکس‌ها و ویدیوهایش را امن آپلود کند. هر فایل خودکار پردازش شود: حذف موقعیت مکانی و متادیتا، چرخش درست، تبدیل به sRGB، تولید WebP و AVIF در چند عرض، LQIP، واترمارک اختیاری، و پوستر برای ویدیو.
**سند طراحی:** `docs/superpowers/specs/2026-10-02-photographer-platform-design.md`، **نقشه‌ی راه:** `docs/superpowers/plans/2026-10-02-roadmap.md`

## تصمیم‌های فنی این فاز

| موضوع | تصمیم |
|---|---|
| مدل کاربر | `accounts.User` سفارشی (قبل از اولین دیپلوی واقعی). فیلد `is_owner` با `unique=True` تضمین می‌کند **فقط یک کاربر** در دیتابیس وجود داشته باشد (invariant در سطح دیتابیس) |
| ساخت ادمین | فقط با `manage.py bootstrap_admin`؛ اگر کاربری وجود داشته باشد رد می‌شود. رمز از `ADMIN_BOOTSTRAP_PASSWORD` یا ورودی تعاملی خوانده می‌شود |
| ورود | API با session کوکی Django و CSRF. مراحل: رمز ← (ثبت TOTP در اولین ورود) ← کد TOTP یا کد بازیابی. تا وقتی TOTP تأیید نشده، هیچ API ادمینی در دسترس نیست |
| TOTP | django-otp (`TOTPDevice` و `StaticDevice` برای ۱۰ کد بازیابی یک‌بارمصرف). QR به‌صورت SVG با segno و کلید متنی برای ورود دستی |
| محدودیت تلاش | django-axes: قفل ۱۵ دقیقه‌ای پس از ۵ تلاش ناموفق برای ترکیب نام کاربری و IP. محدودیت نرخ DRF روی تأیید کد. throttle داخلی django-otp |
| IP واقعی کاربر | از `X-Forwarded-For` با تعداد proxyهای مورد اعتماد (`TRUSTED_PROXY_COUNT`: در production ‏۲ برای Traefik و Caddy، در compose توسعه ۱) |
| Django Admin | `OTPAdminSite`: بدون TOTP قابل دسترسی نیست |
| رمز عبور | حداقل ۱۲ کاراکتر. تغییر رمز sessionهای دیگر را باطل می‌کند ولی session فعلی می‌ماند |
| Audit | مدل `AuditLog` برای ورود، خروج، ورود ناموفق، قفل، ثبت TOTP، استفاده از کد بازیابی، تغییر رمز، آپلود، ویرایش و حذف media، و دانلود اصل فایل |
| پردازش تصویر | Pillow 12 (AVIF و WebP و LittleCMS داخلی دارد)، بدون نیاز به pyvips. عرض‌ها ۴۸۰، ۹۶۰، ۱۶۰۰ و ۲۴۰۰ (بدون بزرگ‌نمایی). WebP با کیفیت ۸۲ و AVIF با کیفیت ۶۰. در واریانت‌ها فقط EXIF با `Artist` و `Copyright` می‌ماند و بقیه، از جمله GPS، حذف می‌شود |
| ورودی مجاز | تصویر: JPEG، PNG، WebP، AVIF و TIFF تا ۵۰MB و ۱۵۰ مگاپیکسل (ضد decompression bomb). ویدیو: MP4 و WebM تا ۱۰۰MB. نوع فایل با محتوای واقعی (magic bytes) تشخیص داده می‌شود، نه با پسوند |
| ویدیو | ffmpeg: حذف متادیتا با remux بدون فشرده‌سازی مجدد (`-map_metadata -1 -c copy`)، پوستر از ثانیه‌ی ۱ که همان مسیر تصویر را طی می‌کند، و مدت و ابعاد با ffprobe |
| واترمارک | تنظیمات singleton شامل فعال/غیرفعال، متن، شفافیت، موقعیت و اندازه‌ی نسبی، با فونت Vazirmatn. در صورت فعال بودن روی واریانت‌های عمومی اعمال می‌شود (گالری مشتری در فاز ۶ از همین تابع استفاده می‌کند) |
| دانلود اصل فایل (پیگیری ADR 0001) | Django مجوز را بررسی و با 302 به یک مسیر امضاشده‌ی ۶۰ثانیه‌ای زیر `/storage-signed/` هدایت می‌کند. gateway فقط GET/HEAD امضاشده‌ی bucket خصوصی را به storage می‌فرستد. هیچ کلید S3 یا آدرس داخلی به مرورگر نمی‌رسد (جزئیات و دلیل رد `X-Accel-Redirect` در ADR 0001) |
| حذف امن | `MediaReference` ثبت می‌کند هر فایل کجا استفاده شده است. حذف فایل در حال استفاده ← 409 |
| قرارداد API | schema از drf-spectacular در `backend/openapi.json`، و تایپ‌های TypeScript با `openapi-typescript` و کلاینت `openapi-fetch` (سبک‌تر از orval). job `contract` در CI هم‌خوانی هر دو را بررسی می‌کند |
| پنل | Next.js در `/panel` (فارسی، RTL، `noindex`)، TanStack Query برای داده. صفحه‌ها: ورود / ثبت TOTP / کدهای بازیابی، داشبورد، کتابخانه‌ی Media (آپلود گروهی کشیدنی با نوار پیشرفت، جست‌وجو، فیلتر، ویرایش alt دوزبانه، حذف)، تنظیمات واترمارک، امنیت (تغییر رمز، ساخت مجدد کدهای بازیابی) |

## APIها

| متد و مسیر | توضیح |
|---|---|
| `GET /api/auth/csrf` | تنظیم کوکی CSRF |
| `GET /api/auth/me` | وضعیت ورود: `anonymous`، `otp_required`، `enrollment_required` یا `verified` |
| `POST /api/auth/login` | نام کاربری و رمز |
| `POST /api/auth/verify` | کد TOTP یا کد بازیابی |
| `GET /api/auth/totp/setup` | ساخت دستگاه تأییدنشده و برگرداندن QR و کلید |
| `POST /api/auth/totp/confirm` | تأیید TOTP و برگرداندن ۱۰ کد بازیابی (فقط همین یک‌بار) |
| `POST /api/auth/recovery-codes` | ساخت مجدد کدهای بازیابی (نیاز به رمز فعلی) |
| `POST /api/auth/password` | تغییر رمز |
| `POST /api/auth/logout` | خروج |
| `GET/POST /api/admin/media/` | فهرست (جست‌وجو، فیلتر نوع و وضعیت، صفحه‌بندی) و آپلود |
| `GET/PATCH/DELETE /api/admin/media/{id}/` | جزئیات، ویرایش، حذف |
| `GET /api/admin/media/{id}/original/` | دانلود اصل فایل (302 به مسیر امضاشده) |
| `POST /api/admin/media/{id}/reprocess` | پردازش مجدد |
| `GET/PUT /api/admin/settings/watermark` | تنظیمات واترمارک |

همه‌ی `/api/admin/*` و endpointهای امنیتی نیاز به ادمین **با TOTP تأییدشده** دارند.

## Taskها

1. **accounts و audit:** مدل‌ها و migrationها، `bootstrap_admin`، `reset_admin_mfa` (برای ران‌بوک بازیابی)، IP واقعی، و تست‌ها (ادمین دوم غیرممکن است، ورود بدون TOTP به API ادمین دسترسی ندارد، قفل axes، تغییر رمز sessionهای دیگر را باطل می‌کند، کد بازیابی یک‌بارمصرف است، CSRF اجباری است)
2. **APIهای auth** و throttle، به‌همراه `OTPAdminSite`
3. **media: اعتبارسنجی و ذخیره‌ی اصل فایل:** تست فایل جعلی (پسوند jpg با محتوای دیگر)، حجم زیاد، bomb، و SVG/HTML
4. **media: پردازش در worker:** واریانت‌ها، LQIP، حذف GPS (تست با JPEG دارای GPS)، چرخش EXIF، تبدیل ICC به sRGB، واترمارک، و ویدیو و پوستر
5. **media: API، ارجاع‌ها، حذف امن، دانلود اصل فایل** و مسیر `/storage-signed/` در Caddy
6. **ماتریس مجوز:** تستی که همه‌ی URLهای `/api/admin/*` را از resolver استخراج می‌کند و برای ناشناس، کاربر بدون TOTP و ادمین تأییدشده بررسی می‌کند (endpoint جدیدی که محافظت نشده باشد تست را می‌شکند)
7. **قرارداد API:** `openapi.json`، تایپ‌های فرانت، و job `contract`
8. **پنل:** ورود، TOTP، چیدمان، Media، واترمارک و امنیت، همراه تست‌های Vitest
9. **E2E:** ساخت ادمین در CI، ورود با TOTP (کد در خود تست محاسبه می‌شود)، آپلود عکس دارای GPS ← آماده شدن ← واریانت WebP از `/media`، دانلود اصل فایل برای ادمین و 401 برای ناشناس، و خروج
10. **Docker:** ffmpeg و فونت در ایمیج api، `GATEWAY_MAX_BODY` برابر 110MB، `COOKIE_SECURE` و `TRUSTED_PROXY_COUNT` در compose، و به‌روزرسانی ران‌بوک (ساخت ادمین، بازیابی دسترسی)

## گیت تکمیل فاز ۱

- همه‌ی jobهای CI سبزند، از جمله job جدید `contract`
- ساخت کاربر دوم در سطح دیتابیس غیرممکن است و ثبت‌نام عمومی وجود ندارد
- هیچ endpoint ادمینی بدون TOTP تأییدشده پاسخ نمی‌دهد (تست ماتریسی)
- فایل اصلی بدون مجوز ادمین قابل دریافت نیست و واریانت‌های عمومی GPS ندارند
- E2E ورود، TOTP، آپلود و دانلود سبز است
