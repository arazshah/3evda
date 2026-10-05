"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import { useMe } from "@/lib/api/queries";
import { BookingBadge } from "./booking/BookingBadge";
import { InquiryBadge } from "./inquiries/InquiryBadge";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Button } from "./ui";

const NAV = [
  { href: "/panel", label: "داشبورد" },
  { href: "/panel/inquiries", label: "استعلام‌ها" },
  { href: "/panel/proformas", label: "پیش‌فاکتورها" },
  { href: "/panel/content", label: "متن‌ها و تصاویر" },
  { href: "/panel/items", label: "بخش‌های تکرارشونده" },
  { href: "/panel/projects", label: "نمونه‌کارها" },
  { href: "/panel/categories", label: "دسته‌ها" },
  { href: "/panel/packages", label: "پکیج‌ها و قیمت‌ها" },
  { href: "/panel/pricing", label: "قواعد قیمت" },
  { href: "/panel/booking", label: "رزروها" },
  { href: "/panel/booking/settings", label: "تنظیمات رزرو" },
  { href: "/panel/galleries", label: "گالری‌های مشتری" },
  { href: "/panel/articles", label: "مقاله‌های مجله" },
  { href: "/panel/settings", label: "تنظیمات سایت" },
  { href: "/panel/media", label: "کتابخانه رسانه" },
  { href: "/panel/watermark", label: "واترمارک" },
  { href: "/panel/sample-content", label: "محتوای نمونه" },
  { href: "/panel/retention", label: "نگهداری اطلاعات" },
  { href: "/panel/security", label: "امنیت" },
];

const THEME_LABELS = { label: "تم رنگی", system: "مطابق سیستم", light: "روشن", dark: "تیره" };

export function PanelShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  const verified = me.data?.state === "verified";

  useEffect(() => {
    if (me.data && !verified) router.replace("/panel/login");
  }, [me.data, verified, router]);

  if (!verified) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-muted" aria-busy="true">
        {me.isError ? "اتصال به سرور برقرار نشد." : "در حال بارگذاری…"}
      </main>
    );
  }

  const logout = async () => {
    await api.POST("/api/auth/logout");
    client.clear();
    router.replace("/panel/login");
  };

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-on-ink/10 bg-ink text-on-ink md:w-64 md:shrink-0 md:border-s">
        <div className="flex items-center justify-between gap-2 p-4 md:block md:p-6">
          <p className="font-display text-3xl leading-none">
            سودا<span className="text-accent-on-ink">.</span>
          </p>
          <p className="text-sm text-on-ink/60 md:mt-2">
            {me.data?.user?.display_name || me.data?.user?.username}
          </p>
        </div>
        <nav aria-label="منوی پنل" className="overflow-x-auto">
          <ul className="flex gap-1 px-2 pb-2 md:flex-col md:px-3">
            {NAV.map((item) => {
              const active =
                item.href === "/panel"
                  ? pathname === "/panel"
                  : item.href === "/panel/booking"
                    ? pathname.startsWith("/panel/booking") && !pathname.startsWith("/panel/booking/settings")
                    : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block whitespace-nowrap border-s-2 px-3 py-2 transition-colors ${
                      active
                        ? "border-accent-on-ink bg-on-ink/10 text-on-ink"
                        : "border-transparent text-on-ink/65 hover:text-on-ink"
                    }`}
                  >
                    {item.label}
                    {item.href === "/panel/inquiries" && <InquiryBadge />}
                    {item.href === "/panel/booking" && <BookingBadge />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="hidden items-center gap-2 p-4 md:flex">
          <ThemeToggle labels={THEME_LABELS} tone="onInk" />
          <Button variant="inverseGhost" className="flex-1" onClick={logout}>
            خروج
          </Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-end gap-2 p-2 md:hidden">
          <ThemeToggle labels={THEME_LABELS} />
          <Button variant="ghost" onClick={logout}>
            خروج
          </Button>
        </div>
        <main className="mx-auto max-w-6xl p-4 md:p-10">{children}</main>
      </div>
    </div>
  );
}
