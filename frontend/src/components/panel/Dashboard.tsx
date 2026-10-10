"use client";

import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { useArticles, useBookingSummary, useInquirySummary, useMediaList } from "@/lib/api/queries";
import { SystemStatusCard } from "./SystemStatusCard";
import { Icon, type IconName } from "./nav";

function Stat({ label, value, href, hot }: { label: string; value?: number; href: string; hot?: boolean }) {
  return (
    <Link
      href={href}
      className="group block rounded-brand border border-line bg-surface p-4 transition-colors hover:border-accent"
    >
      <p className="text-sm text-muted">{label}</p>
      <p
        className={`font-display mt-1 text-4xl tabular-nums transition-colors group-hover:text-accent ${
          hot ? "text-accent" : ""
        }`}
      >
        {value === undefined ? "…" : formatNumber(value)}
      </p>
    </Link>
  );
}

const SHORTCUTS: { href: string; label: string; icon: IconName }[] = [
  { href: "/panel/media", label: "آپلود عکس", icon: "image" },
  { href: "/panel/items", label: "اسلایدها و خدمات", icon: "layers" },
  { href: "/panel/projects", label: "نمونه‌کار جدید", icon: "grid" },
  { href: "/panel/articles", label: "مقاله‌ی جدید", icon: "pen" },
  { href: "/panel/galleries", label: "گالری مشتری", icon: "camera" },
  { href: "/panel/settings", label: "تنظیمات و فونت", icon: "gear" },
];

export function Dashboard() {
  const inquiries = useInquirySummary();
  const bookings = useBookingSummary();
  const drafts = useArticles({ status: "draft" });
  const failed = useMediaList({ status: "failed" });

  const todo = [
    { n: inquiries.data?.new ?? 0, text: "استعلام خوانده‌نشده", href: "/panel/inquiries" },
    { n: bookings.data?.pending ?? 0, text: "رزرو در انتظار تأیید", href: "/panel/booking" },
    { n: failed.data?.count ?? 0, text: "تصویر با پردازش ناموفق", href: "/panel/media?status=failed" },
  ].filter((t) => t.n > 0);

  const queries = [inquiries, bookings, failed];
  const failedToLoad = queries.some((q) => q.isError);
  const loading = !failedToLoad && queries.some((q) => q.data === undefined);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] leading-tight">داشبورد</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="استعلام جدید"
          value={inquiries.data?.new}
          href="/panel/inquiries"
          hot={!!inquiries.data?.new}
        />
        <Stat
          label="رزرو در انتظار"
          value={bookings.data?.pending}
          href="/panel/booking"
          hot={!!bookings.data?.pending}
        />
        <Stat label="مقاله‌ی پیش‌نویس" value={drafts.data?.length} href="/panel/articles" />
        <Stat
          label="پردازش ناموفق"
          value={failed.data?.count}
          href="/panel/media?status=failed"
          hot={!!failed.data?.count}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-brand border border-line bg-surface p-5" aria-labelledby="todo-title">
          <h2 id="todo-title" className="font-display text-xl">
            نیاز به اقدام
          </h2>
          {failedToLoad ? (
            <p role="alert" className="mt-2 text-accent-2">
              بارگذاری این فهرست ناموفق بود؛ صفحه را دوباره باز کنید.
            </p>
          ) : loading ? (
            <p className="mt-2 text-muted">در حال بارگذاری…</p>
          ) : todo.length === 0 ? (
            <p className="mt-2 text-muted">فعلاً کاری منتظر شما نیست.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {todo.map((t) => (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    className="flex min-h-11 items-center justify-between gap-3 hover:text-accent"
                  >
                    <span>{t.text}</span>
                    <span className="tabular-nums text-accent">{formatNumber(t.n)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="rounded-brand border border-line bg-surface p-5"
          aria-labelledby="shortcuts-title"
        >
          <h2 id="shortcuts-title" className="font-display text-xl">
            میان‌برها
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {SHORTCUTS.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="flex min-h-11 items-center gap-2 rounded-brand border border-line px-3 text-sm hover:border-accent hover:text-accent"
                >
                  <Icon name={s.icon} />
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <SystemStatusCard compact />
    </div>
  );
}
