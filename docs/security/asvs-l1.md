# چک‌لیست ASVS سطح ۱

بر پایه‌ی [OWASP ASVS 4.0.3](https://github.com/OWASP/ASVS) سطح ۱ (بندهای قابل‌اجرا برای این برنامه). شماره‌ها به‌اختصار و با توضیح فارسی آمده‌اند؛ متن کامل هر بند در خود ASVS است. بندهای فصل ۱ (معماری) و بخش‌هایی از فصل‌های دیگر که فقط در سطح ۲ و ۳ هستند اینجا نیامده‌اند.

## نشانه‌ها

| نشانه | معنی |
|---|---|
| ✅ | رعایت می‌شود و **شاهد** (فایل یا آزمونِ نام‌برده) دارد |
| ➖ | برای این برنامه موردنیاز نیست؛ دلیل نوشته شده |
| ⚠️ | استثنا؛ در «استثناهای ثبت‌شده» همین فایل، با دلیل و تاریخ بازبینی |
| 🔧 | بیرون از این مخزن (زیرساخت) است؛ در چک‌لیست انتشار تأیید می‌شود |

هر شاهد به‌شکل `مسیر::نام_آزمون` یا مسیر فایل است و آزمون خودکار `backend/apps/core/tests/test_asvs_guards.py` در CI بررسی می‌کند که هر فایل و آزمونِ نام‌برده‌شده واقعاً وجود دارد؛ پس با حذف یا تغییر نامِ یک آزمون، این چک‌لیست شکست می‌خورد و باید به‌روز شود.


## V2 — احراز هویت

| بند | موضوع | وضعیت | شاهد |
|---|---|---|---|
| 2.1.1 | رمز دست‌کم ۱۲ نویسه | ✅ | `backend/apps/accounts/tests/test_auth_api.py::test_password_change_validates_the_new_password`، `backend/apps/accounts/tests/test_commands.py::test_bootstrap_rejects_a_weak_password`؛ `backend/config/settings/base.py` |
| 2.1.2 | رمزهای تا ۱۲۸ نویسه و بیشتر پذیرفته می‌شود | ✅ | `backend/apps/accounts/tests/test_auth_api.py::test_long_passphrases_with_spaces_and_unicode_are_accepted_whole` |
| 2.1.3 | رمز بریده یا کوتاه نمی‌شود؛ فاصله‌ی میانی مجاز است | ✅ | `backend/apps/accounts/tests/test_auth_api.py::test_long_passphrases_with_spaces_and_unicode_are_accepted_whole` |
| 2.1.4 | هر نویسه‌ی یونیکد مجاز است | ✅ | `backend/apps/accounts/tests/test_auth_api.py::test_long_passphrases_with_spaces_and_unicode_are_accepted_whole` |
| 2.1.5 | کاربر می‌تواند رمزش را عوض کند | ✅ | `backend/apps/accounts/tests/test_auth_api.py::test_password_change_keeps_this_session_and_ends_the_others` |
| 2.1.6 | تغییر رمز، رمز فعلی و جدید را می‌خواهد | ✅ | `backend/apps/accounts/tests/test_auth_api.py::test_password_change_requires_the_current_password` |
| 2.1.7 | رمز با فهرست رمزهای رایج سنجیده می‌شود | ✅ | اعتبارسنج `CommonPasswordValidator` در `backend/config/settings/base.py`؛ `backend/apps/accounts/tests/test_auth_api.py::test_password_change_validates_the_new_password` |
| 2.1.8 | نشانگر قدرت رمز | ⚠️ | استثنا — پایین‌تر در «استثناهای ثبت‌شده»؛ سیاست سمت سرور اجباری است |
| 2.1.9 | بدون قواعد ترکیبی (حرف بزرگ، نماد…) | ✅ | فقط طول، رایج‌بودن و شباهت به نام کاربری سنجیده می‌شود: `backend/config/settings/base.py` |
| 2.1.10 | بدون تعویض دوره‌ای اجباری | ✅ | هیچ انقضای رمزی وجود ندارد؛ نبودنش در `backend/apps/accounts/models.py` |
| 2.1.11 | چسباندن (paste) و مدیر رمز مجاز است | ✅ | `frontend/src/components/panel/LoginFlow.tsx` (هیچ مانعی روی paste نیست؛ فیلد رمز autocomplete دارد) |
| 2.1.12 | نمایش موقت رمز هنگام تایپ | ✅ | `frontend/src/components/panel/password-field.test.tsx` |
| 2.2.1 | مقاومت در برابر حدس خودکار (قفل و محدودیت) | ✅ | `backend/apps/accounts/tests/test_auth_api.py::test_lockout_after_repeated_failures`؛ django-axes: ۵ تلاش، قفل ۱۵ دقیقه (`backend/config/settings/base.py`) |
| 2.2.2 | روش ضعیف‌تر (پیامک/ایمیل) به‌عنوان عامل احراز هویت نیست | ➖ | فقط رمز + TOTP/کد بازیابی؛ هیچ پیامک یا ایمیلی ارسال نمی‌شود |
| 2.3.1 | رمز اولیه‌ی تصادفی/پیش‌فرض ندارد | ✅ | مالک رمز خودش را هنگام ساخت حساب می‌گذارد: `backend/apps/accounts/tests/test_commands.py::test_bootstrap_requires_a_password_when_not_interactive` |
| 2.5.1 | رمز اولیه یا بازیابی به‌صورت متن آشکار فرستاده نمی‌شود | ✅ | کدهای بازیابی فقط یک‌بار در پاسخ HTTPS به خود مالک نشان داده می‌شود: `backend/apps/accounts/tests/test_auth_api.py::test_regenerating_recovery_codes_requires_the_password` |
| 2.5.2 | بدون «راهنمای رمز» یا پرسش‌های امنیتی | ✅ | چنین قابلیتی در `backend/apps/accounts/api.py` وجود ندارد |
| 2.5.3 | بازیابی، رمز فعلی را آشکار نمی‌کند | ✅ | بازیابی دسترسی فقط با فرمان سرور است: `backend/apps/accounts/tests/test_commands.py::test_reset_admin_mfa_removes_devices_and_sessions` |
| 2.5.4 | حساب مشترک یا پیش‌فرض وجود ندارد | ✅ | `backend/apps/accounts/tests/test_owner_invariant.py::test_only_one_user_can_ever_exist`؛ رمز پیش‌فرض ندارد |
| 2.7.1–2.7.3 | تأییدکننده‌ی خارج از باند (پیامک/تماس) | ➖ | استفاده نمی‌شود |
| 2.8.1 | رمز یک‌بارمصرف زمانی عمر محدود دارد | ✅ | TOTP با گام ۳۰ ثانیه؛ `backend/apps/accounts/tests/test_auth_api.py::test_totp_code_completes_sign_in`، `backend/apps/accounts/tests/test_auth_api.py::test_wrong_totp_code_is_rejected`، `backend/apps/accounts/tests/test_auth_api.py::test_recovery_code_works_once` |

## V3 — مدیریت نشست

| بند | موضوع | وضعیت | شاهد |
|---|---|---|---|
| 3.1.1 | شناسه‌ی نشست هرگز در نشانی URL نیست | ✅ | نشست فقط در کوکی است: `frontend/src/lib/api/client.ts` |
| 3.2.1 | نشست تازه پس از ورود ساخته می‌شود | ✅ | `backend/apps/accounts/tests/test_auth_api.py::test_signing_in_gives_a_new_session_key` |
| 3.2.2 | شناسه‌ی نشست دست‌کم ۶۴ بیت بی‌نظمی دارد | ✅ | شناسه‌ی ۳۲ نویسه‌ی تصادفی Django (حدود ۱۹۰ بیت): `backend/config/settings/base.py` |
| 3.2.3 | شناسه فقط در کوکی امن نگه داشته می‌شود (نه localStorage) | ✅ | `backend/apps/core/tests/test_settings.py::test_the_session_cookie_carries_the_host_prefix_in_production`؛ هیچ توکنی در localStorage نگهداری نمی‌شود |
| 3.3.1 | خروج، نشست را باطل می‌کند | ✅ | `backend/apps/accounts/tests/test_auth_api.py::test_logout_ends_the_session` |
| 3.3.2 | نشست فعال حداکثر ۱۲ ساعت دوام دارد | ✅ | `SESSION_COOKIE_AGE` در `backend/config/settings/base.py` |
| 3.4.1 | کوکی نشست Secure است | ✅ | `backend/apps/core/tests/test_settings.py::test_prod_settings_are_secure_by_default` |
| 3.4.2 | کوکی نشست HttpOnly است | ✅ | `SESSION_COOKIE_HTTPONLY` در `backend/config/settings/base.py` |
| 3.4.3 | کوکی نشست SameSite دارد | ✅ | `SESSION_COOKIE_SAMESITE = Lax` در `backend/config/settings/base.py` |
| 3.4.4 | کوکی نشست پیشوند __Host- دارد | ✅ | `backend/apps/core/tests/test_settings.py::test_the_session_cookie_carries_the_host_prefix_in_production`، `backend/apps/core/tests/test_settings.py::test_the_prefix_is_dropped_only_where_cookies_are_not_secure` |
| 3.7.1 | کار حساس نیاز به احراز هویت دوباره دارد | ✅ | `backend/apps/accounts/tests/test_auth_api.py::test_password_change_requires_the_current_password`، `backend/apps/accounts/tests/test_auth_api.py::test_regenerating_recovery_codes_requires_the_password` |

## V4 — کنترل دسترسی

| بند | موضوع | وضعیت | شاهد |
|---|---|---|---|
| 4.1.1 | کنترل دسترسی در سمت سرور اجرا می‌شود | ✅ | ماتریس خودکار روی همه‌ی مسیرها: `backend/apps/accounts/tests/test_permission_matrix.py::test_anonymous_is_refused`، `backend/apps/accounts/tests/test_permission_matrix.py::test_password_only_session_is_refused` |
| 4.1.2 | ویژگی‌های کنترل دسترسی را کاربر نهایی نمی‌تواند دست‌کاری کند | ✅ | فیلدهای حساس فقط‌خواندنی‌اند: `backend/apps/retention/tests/test_api.py::test_the_last_run_fields_cannot_be_written` |
| 4.1.3 | کمترین دسترسی لازم | ✅ | یک مالک و بس: `backend/apps/accounts/tests/test_owner_invariant.py::test_only_one_user_can_ever_exist`، `backend/apps/accounts/tests/test_owner_invariant.py::test_a_non_owner_user_cannot_be_stored` |
| 4.1.5 | شکست امن: بدون ورود کامل، همه‌چیز بسته است | ✅ | `backend/apps/accounts/tests/test_permission_matrix.py::test_password_only_session_is_refused` |
| 4.2.1 | دسترسی به داده‌ی دیگری با حدس شناسه (IDOR) ممکن نیست | ✅ | لینک‌های امضاشده: `backend/apps/galleries/tests/test_client.py::test_a_forged_link_is_not_found`، `backend/apps/galleries/tests/test_client.py::test_a_photo_of_another_gallery_cannot_be_chosen`، `backend/apps/galleries/tests/test_downloads.py::test_a_zip_of_another_gallery_is_not_found`، `backend/apps/booking/tests/test_booking.py::test_forged_and_foreign_tokens_are_404`، `backend/apps/proformas/tests/test_proformas.py::test_unknown_token_is_404_everywhere` |
| 4.2.2 | محافظت قوی در برابر CSRF | ✅ | `backend/apps/accounts/tests/test_auth_api.py::test_login_requires_csrf`؛ نشست + توکن CSRF و بدون CORS: `backend/apps/core/tests/test_asvs_guards.py::test_no_cross_origin_access_is_ever_granted` |
| 4.3.1 | رابط مدیریتی با احراز هویت چندعاملی | ✅ | `backend/apps/accounts/tests/test_auth_api.py::test_password_alone_does_not_grant_admin_access`، `backend/apps/accounts/tests/test_auth_api.py::test_django_admin_requires_otp` |
| 4.3.2 | فهرست‌کردن پوشه و فایل‌های فراداده (.git، .DS_Store) در دسترس نیست | ✅ | دروازه فقط مسیرهای مشخص را به سرویس‌ها می‌دهد و `file_server` ندارد: `infra/caddy/Caddyfile` |

## V5 — اعتبارسنجی، پاک‌سازی و رمزگذاری خروجی

| بند | موضوع | وضعیت | شاهد |
|---|---|---|---|
| 5.1.1 | آلودگی پارامتر HTTP | ✅ | همه‌ی ورودی‌ها از serializerهای DRF با فیلد مشخص می‌گذرند؛ `backend/apps/inquiries/tests/test_inquiries.py::test_limits_on_text_length` |
| 5.1.2 | Mass assignment | ✅ | فیلدها صریح‌اند، فقط‌خواندنی‌ها نوشته نمی‌شوند: `backend/apps/retention/tests/test_api.py::test_the_last_run_fields_cannot_be_written` |
| 5.1.3 | اعتبارسنجی مثبت (فهرست مجاز) | ✅ | `backend/apps/booking/tests/test_booking.py::test_validation`، `backend/apps/inquiries/tests/test_inquiries.py::test_phone_numbers_are_normalised_and_checked`، `backend/apps/blog/tests/test_body.py::test_documents_outside_the_vocabulary_are_rejected` |
| 5.1.4 | داده‌ی ساختاریافته نوع و دامنه‌ی مشخص دارد | ✅ | `backend/apps/blog/tests/test_body.py::test_attrs_that_are_not_objects_are_a_validation_error_not_a_crash`، `backend/apps/retention/tests/test_api.py::test_silly_periods_are_refused` |
| 5.1.5 | ریدایرکت فقط به مقصد مجاز | ✅ | تنها ریدایرکت برنامه به مسیر امضاشده‌ی خودش می‌رود: `backend/apps/media/tests/test_api.py::test_original_download_redirects_to_a_short_lived_signed_gateway_path` |
| 5.2.1 | HTML کاربر پیش از استفاده پاک‌سازی می‌شود | ✅ | `backend/apps/blog/tests/test_body.py::test_sanitiser_is_a_second_line_of_defence`، `backend/apps/blog/tests/test_body.py::test_dangerous_links_are_rejected` |
| 5.2.2 | داده‌ی ساختارنیافته پاک‌سازی و محدود می‌شود | ✅ | `backend/apps/galleries/tests/test_client.py::test_a_comment_is_limited_and_kept_as_plain_text` |
| 5.2.3 | تزریق به ایمیل | ➖ | برنامه ایمیل نمی‌فرستد |
| 5.2.4 | eval و اجرای پویای کد ممنوع است | ✅ | `script-src` بدون unsafe-eval؛ `e2e/tests/security-headers.spec.ts` |
| 5.2.5 | تزریق قالب | ✅ | `backend/apps/proformas/tests/test_proformas.py::test_pdf_markup_in_text_is_escaped_not_executed` |
| 5.2.6 | SSRF: سرور به نشانی دلخواه درخواست نمی‌زند | ✅ | `backend/apps/proformas/tests/test_proformas.py::test_fetcher_allows_only_data_and_our_fonts` |
| 5.2.7 | SVG و محتوای فعال پذیرفته نمی‌شود | ✅ | فایل‌ها از روی محتوا شناسایی و دوباره‌رمزگذاری می‌شوند: `backend/apps/media/tests/test_validation.py::test_extension_is_ignored_in_favour_of_content`، `backend/apps/media/tests/test_validation.py::test_unsupported_content_is_rejected` |
| 5.3.1 | رمزگذاری خروجی متناسب با بافت | ✅ | React و قالب‌های Django خودکار escape می‌کنند: `backend/apps/blog/tests/test_body.py::test_text_is_escaped` |
| 5.3.3 | XSS: رمزگذاری خروجی + CSP | ✅ | `e2e/tests/security-headers.spec.ts`، `frontend/src/lib/security/csp.test.ts` |
| 5.3.4 | SQL فقط با ORM (پرس‌وجوی پارامتری) | ✅ | `backend/apps/core/tests/test_asvs_guards.py::test_no_raw_sql_anywhere_but_the_readiness_probe` |
| 5.3.5 | هیچ SQL ساخته‌شده از رشته نیست | ✅ | `backend/apps/core/tests/test_asvs_guards.py::test_the_readiness_probe_runs_a_constant_statement` |
| 5.3.6 | تزریق JSON/JavaScript | ✅ | `frontend/src/lib/site/seo.test.ts` (داده‌ی JSON-LD بدون `</script>`) |
| 5.3.8 | تزریق دستور سیستم‌عامل | ✅ | فرمان‌ها همیشه فهرست آرگومان‌اند و بدون shell: `backend/apps/core/tests/test_asvs_guards.py::test_commands_are_never_run_through_a_shell` |
| 5.3.9 | LFI/RFI | ✅ | کلید فایل‌ها را سرور تصادفی می‌سازد: `backend/apps/inquiries/tests/test_inquiries.py::test_images_and_pdfs_are_stored_privately_under_random_keys` |

## V6 — رمزنگاری ذخیره‌شده

| بند | موضوع | وضعیت | شاهد |
|---|---|---|---|
| 6.2.1 | ماژول رمزنگاری امن شکست می‌خورد | ✅ | HMAC با مقایسه‌ی زمان‌ثابت و شکست بسته: `backend/apps/core/tests/test_secret_key_rotation.py::test_other_ways_of_forging_a_link_still_fail_with_fallbacks_on`، `backend/apps/core/signing.py` |

## V7 — خطا و لاگ

| بند | موضوع | وضعیت | شاهد |
|---|---|---|---|
| 7.1.1 | اعتبارنامه‌ها و داده‌ی حساس در لاگ نیست | ✅ | `backend/apps/core/tests/test_log_privacy.py::test_message_and_extra_fields_are_masked`، `backend/apps/core/tests/test_log_privacy.py::test_a_crash_while_saving_logs_no_personal_detail` |
| 7.1.2 | داده‌ی شخصی مشتری در لاگ نیست | ✅ | `backend/apps/core/tests/test_log_privacy.py::test_a_successful_inquiry_logs_no_personal_detail`، `backend/apps/core/tests/test_log_privacy.py::test_signed_client_links_are_masked` |
| 7.4.1 | پیام خطای عمومی با شناسه‌ی پیگیری، نه جزئیات داخلی | ✅ | `frontend/src/components/site/error-page.test.tsx`؛ `backend/apps/core/tests/test_log_privacy.py::test_an_unsafe_request_id_is_replaced` |

## V8 — حفاظت از داده

| بند | موضوع | وضعیت | شاهد |
|---|---|---|---|
| 8.2.1 | پاسخ‌های حساس کش نمی‌شوند | ✅ | `backend/apps/core/tests/test_security_headers.py::test_answers_about_the_owner_and_the_panel_are_never_cached` |
| 8.3.1 | داده‌ی حساس در بدنه یا هدر می‌رود، نه در query string | ✅ | `backend/apps/galleries/tests/test_downloads.py::test_download_needs_the_token_and_the_right_gallery` (توکن گالری در هدر). لینک امضاشده‌ی مشتری عمداً بخشی از مسیر است (نگاه کنید به «استثناهای ثبت‌شده») و در لاگ پوشانده می‌شود |

## V9 — ارتباطات

| بند | موضوع | وضعیت | شاهد |
|---|---|---|---|
| 9.1.1 | TLS برای همه‌ی ارتباط‌ها | ✅ | `backend/apps/core/tests/test_settings.py::test_prod_settings_are_secure_by_default`؛ HSTS یک‌ساله: `e2e/tests/security-headers.spec.ts` |
| 9.1.2 | رمزهای TLS قوی | 🔧 | TLS در Coolify (پروکسی جلوی دروازه) پایان می‌پذیرد، نه در این مخزن؛ در [چک‌لیست انتشار](../runbooks/release-checklist.md) (بخش ب) با آزمون خارجی تأیید می‌شود |
| 9.1.3 | فقط TLS 1.2 و بالاتر | 🔧 | همان بند بالا |

## V11 — منطق کسب‌وکار

| بند | موضوع | وضعیت | شاهد |
|---|---|---|---|
| 11.1.1 | مراحل کار به ترتیب و بدون پرش | ✅ | `backend/apps/proformas/tests/test_proformas.py::test_approve_once_then_idempotent_and_opposite_refused`، `backend/apps/booking/tests/test_booking.py::test_confirming_a_booking_in_the_past_is_refused` |
| 11.1.4 | محدودیت و ضدخودکارسازی در کارکردهای عمومی | ✅ | `backend/apps/booking/tests/test_booking.py::test_rate_limit`، `backend/apps/inquiries/tests/test_inquiries.py::test_sending_is_rate_limited`، `backend/apps/proformas/tests/test_proformas.py::test_public_rate_limit`، `backend/apps/galleries/tests/test_client.py::test_guessing_is_stopped_after_five_wrong_tries` |

## V12 — فایل‌ها

| بند | موضوع | وضعیت | شاهد |
|---|---|---|---|
| 12.1.1 | سقف اندازه‌ی فایل | ✅ | `backend/apps/media/tests/test_validation.py::test_too_large_image_is_rejected`، `backend/apps/inquiries/tests/test_inquiries.py::test_a_request_far_beyond_the_file_limits_is_refused_before_parsing` |
| 12.2.1 | نوع فایل از روی محتوا | ✅ | `backend/apps/media/tests/test_validation.py::test_extension_is_ignored_in_favour_of_content` |
| 12.3.1 | نام فایل کاربر در مسیر ذخیره نمی‌آید (path traversal ممکن نیست) | ✅ | `backend/apps/inquiries/tests/test_inquiries.py::test_images_and_pdfs_are_stored_privately_under_random_keys` |
| 12.3.5 | فایل دانلودی اجرا نمی‌شود، فقط دانلود می‌شود | ✅ | `backend/apps/inquiries/tests/test_inquiries.py::test_an_attachment_downloads_through_a_short_signed_path_as_a_file` |
| 12.4.1 | فایل‌ها بیرون از ریشه‌ی وب، در ذخیره‌ساز خصوصی | ✅ | `backend/apps/galleries/tests/test_client.py::test_nothing_in_the_public_bucket` |
| 12.5.1 | فقط نوع‌های مورد انتظار سرو می‌شود | ✅ | `backend/apps/media/tests/test_validation.py::test_unsupported_content_is_rejected` |
| 12.5.2 | درخواست مستقیم به فایل بارگذاری‌شده آن را اجرا نمی‌کند | ✅ | تصاویر به WebP بازنویسی می‌شوند و `nosniff` برقرار است: `backend/apps/core/tests/test_security_headers.py::test_every_api_answer_carries_the_security_headers` |
| 12.6.1 | فهرست مجاز مقصدهای درخواست خروجی سرور | ✅ | `backend/apps/proformas/tests/test_proformas.py::test_fetcher_allows_only_data_and_our_fonts` |

## V13 — API

| بند | موضوع | وضعیت | شاهد |
|---|---|---|---|
| 13.1.1 | همه‌ی بخش‌های برنامه یک قالب ورودی را یکسان می‌فهمند | ✅ | فقط JSON/multipart از طریق DRF؛ `backend/config/settings/base.py` |
| 13.1.3 | نشانی API رازی در خود ندارد | ✅ | جز لینک‌های امضاشده‌ی عمداً قابل‌اشتراک مشتری؛ آن‌ها در «استثناهای ثبت‌شده». `backend/apps/galleries/tests/test_client.py::test_a_revoked_link_stops_working` |
| 13.2.1 | روش‌های HTTP محدود و کنترل‌شده | ✅ | `backend/apps/media/tests/test_api.py::test_put_is_not_allowed`؛ `http_method_names` در view ها |
| 13.2.2 | اعتبارسنجی schema برای ورودی JSON | ✅ | serializerهای DRF؛ نمونه: `backend/apps/retention/tests/test_api.py::test_silly_periods_are_refused` |
| 13.2.3 | API REST در برابر CSRF/Cross-origin محافظت شده | ✅ | `backend/apps/accounts/tests/test_auth_api.py::test_login_requires_csrf`، `backend/apps/core/tests/test_asvs_guards.py::test_a_cross_origin_preflight_gets_no_permission` |

## V14 — پیکربندی

| بند | موضوع | وضعیت | شاهد |
|---|---|---|---|
| 14.2.1 | اجزای وابسته به‌روز و بدون آسیب‌پذیری شناخته‌شده | ✅ | کار `security` در `.github/workflows/ci.yml` روی هر PR: pip-audit، pnpm audit؛ استثناها در `docs/security/audit-exceptions.md` |
| 14.2.2 | قابلیت‌ها و نمونه‌های غیرضروری حذف شده | ✅ | فرمان‌های نمونه‌داده روی سایت واقعی امتناع می‌کنند: `backend/apps/core/tests/test_demo_guard.py::test_sample_data_is_refused_on_a_real_site`، `backend/apps/core/tests/test_demo_guard.py::test_nothing_was_created_when_refused`، `backend/apps/core/tests/test_settings.py::test_sample_data_is_off_by_default_in_production` |
| 14.2.3 | هیچ منبع شخص ثالث بدون SRI بارگذاری نمی‌شود | ✅ | هیچ CDN یا اسکریپت بیرونی نیست؛ `script-src 'self'`: `e2e/tests/security-headers.spec.ts` |
| 14.3.2 | حالت اشکال‌زدایی در production خاموش است | ✅ | `backend/apps/core/tests/test_settings.py::test_prod_settings_are_secure_by_default` |
| 14.3.3 | نسخه‌ی نرم‌افزار در هدرها نیست | ✅ | هدر Server حذف و `X-Powered-By` خاموش است: `e2e/tests/security-headers.spec.ts`، `frontend/next.config.ts` |
| 14.4.1 | هر پاسخ Content-Type و charset دارد | ✅ | پیش‌فرض Django/Next؛ `backend/apps/core/tests/test_security_headers.py::test_api_answers_are_saved_not_rendered_if_a_browser_opens_them` |
| 14.4.2 | پاسخ‌های API با Content-Disposition: attachment | ✅ | `backend/apps/core/tests/test_security_headers.py::test_api_answers_are_saved_not_rendered_if_a_browser_opens_them` |
| 14.4.3 | CSP با nonce، بدون unsafe-inline برای اسکریپت | ✅ | `backend/apps/core/tests/test_security_headers.py::test_what_the_api_answers_may_never_be_rendered_or_framed`، `backend/apps/core/tests/test_security_headers.py::test_the_django_admin_has_its_own_strict_policy_and_still_works`، `frontend/src/lib/security/csp.test.ts`، `e2e/tests/security-headers.spec.ts` |
| 14.4.4 | X-Content-Type-Options: nosniff | ✅ | `backend/apps/core/tests/test_security_headers.py::test_every_api_answer_carries_the_security_headers` |
| 14.4.5 | HSTS | ✅ | `e2e/tests/security-headers.spec.ts` |
| 14.4.6 | Referrer-Policy | ✅ | `backend/apps/core/tests/test_security_headers.py::test_every_api_answer_carries_the_security_headers` |
| 14.4.7 | جلوگیری از قاب‌شدن (frame-ancestors / X-Frame-Options) | ✅ | `backend/apps/core/tests/test_security_headers.py::test_every_api_answer_carries_the_security_headers`، `e2e/tests/security-headers.spec.ts` |
| 14.5.1 | فقط روش‌های HTTP مورد نیاز | ✅ | `backend/apps/media/tests/test_api.py::test_put_is_not_allowed` |
| 14.5.2 | هدر Origin برای احراز هویت به‌کار نمی‌رود | ✅ | احراز هویت با کوکی نشست و توکن CSRF است؛ `backend/apps/accounts/api.py` |
| 14.5.3 | CORS: هیچ مبدأ بیگانه‌ای مجاز نیست | ✅ | `backend/apps/core/tests/test_security_headers.py::test_static_files_are_not_opened_to_every_origin`، `backend/apps/core/tests/test_asvs_guards.py::test_no_cross_origin_access_is_ever_granted` |
| 14.5.4 | هدرهای افزوده‌ی پروکسی فقط از پروکسی مورد اعتماد پذیرفته می‌شود | ✅ | `backend/apps/accounts/tests/test_client_ip.py::test_client_ip_uses_the_trusted_proxy_hop`؛ `trusted_proxies` در `infra/caddy/Caddyfile` |

## استثناهای ثبت‌شده

| بند | استثنا | دلیل | تاریخ ثبت | بازبینی تا |
|---|---|---|---|---|
| 2.1.8 | نشانگر قدرت رمز در رابط وجود ندارد | فقط یک حساب (مالک) هست و رمز را یک‌بار می‌گذارد؛ سرور دست‌کم ۱۲ نویسه، رد رمزهای رایج و رد شباهت به نام کاربری را **اجبار** می‌کند و پیام خطا دلیل را می‌گوید | 2026-10-04 | 2026-12-31 |
| 4.2.1 / 8.3.1 / 13.1.3 | لینک‌های مشتری (پیش‌فاکتور، رزرو، گالری) توکن امضاشده در **مسیر URL** است | این‌ها عمداً «لینکِ قابل‌اشتراک» هستند (مشتری حساب ندارد). توکن ۱۲۸ بیت تصادفی + امضای HMAC است، قابل‌ابطال با «لینک جدید»، در لاگ پوشانده می‌شود و صفحه‌ها `Referrer-Policy` و `noindex` دارند. گالری علاوه بر آن می‌تواند رمز داشته باشد | 2026-10-04 | 2027-04-04 |

## اسکن پویا

برنامه‌ی هفتگی OWASP ZAP baseline روی پشته‌ی بالاآمده در `.github/workflows/zap.yml` اجرا می‌شود (و دستی هم قابل‌اجراست). فقط صفحه‌های عمومی را پیمایش می‌کند (بدون ورود). **یافته‌ی «بالا» یعنی کار باز** و باید در ۷ روز یا بسته شود یا با تاریخ و دلیل به همین فایل افزوده شود. گزارش کامل هر اجرا در artifact همان اجرا ذخیره می‌شود. برای پذیرفتن یک یافته‌ی «بالا» با دلیل و تاریخ، شناسه‌ی افزونه‌ی ZAP را به‌شکل `ZAP-<شناسه>` در جدول «استثناهای ثبت‌شده» بالا بنویسید؛ `scripts/zap-gate.py` همان را می‌شناسد.

### نخستین اجرا (۲۰۲۶-۱۰-۰۴)

۰ یافته‌ی «بالا»، ۲ «متوسط»، ۳ «پایین» (۵۶ بررسی بدون ایراد).

| یافته | نتیجه |
|---|---|
| CSP Header Not Set (10038) — پاسخ‌های خود Django (API و پنل پشتیبانی `django-admin`) | **بسته شد**: API سیاست `default-src 'none'` و صفحه‌های django-admin سیاست سخت‌گیرانه‌ی خودشان را می‌گیرند |
| Cross-Domain Misconfiguration (10098) — فایل‌های ایستا `Access-Control-Allow-Origin: *` داشتند | **بسته شد**: `WHITENOISE_ALLOW_ALL_ORIGINS = False` |
| Cookie No HttpOnly Flag (10010) `ZAP-10010` | **پذیرفته**: فقط کوکی CSRF است که عمداً باید برای جاوااسکریپت خواندنی باشد (پنل آن را در هدر `X-CSRFToken` می‌فرستد). کوکی **نشست** HttpOnly است. بازبینی: 2027-04-04 |
| COEP/CORP (90004) `ZAP-90004` | **پذیرفته (پایین)**: `Cross-Origin-Opener-Policy` و `Cross-Origin-Resource-Policy` برقرارند؛ `Cross-Origin-Embedder-Policy` فقط برای صفحه‌هایی لازم است که SharedArrayBuffer یا ساعت دقیق می‌خواهند و این سایت چنین چیزی ندارد. بازبینی: 2027-04-04 |

## نقص باز

نقص باز بدون استثنای ثبت‌شده وجود ندارد.
