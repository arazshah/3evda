# استثناهای audit وابستگی‌ها

هر استثنا باید دلیل مستند و تاریخ بازبینی داشته باشد (نقشه‌ی راه، بخش ۲.۱). وقتی نسخه‌ی اصلاح‌شده منتشر شد یا به تاریخ بازبینی رسیدیم، استثنا حذف می‌شود.

| شناسه | بسته | محل | چرا خطر عملی ندارد | تاریخ ثبت | بازبینی تا |
|---|---|---|---|---|---|
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces` ≤ 3.0.3 (DoS با الگوهای تودرتوی عمیق) | `frontend` ← `eslint-config-next` ← `@next/eslint-plugin-next` ← `fast-glob` ← `micromatch` (فقط devDependency) | فقط هنگام lint در CI و روی الگوهای glob خود مخزن اجرا می‌شود. نه در ایمیج production است و نه ورودی کاربر به آن می‌رسد. `pnpm audit --prod` پاک است. نسخه‌ی اصلاح‌شده هنوز وجود ندارد | 2026-10-03 | 2026-11-03 |

تنظیم: `pnpm.auditConfig.ignoreGhsas` در `frontend/package.json`.
