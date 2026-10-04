"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import { useMe } from "@/lib/api/queries";
import { BookingBadge } from "./booking/BookingBadge";
import { InquiryBadge } from "./inquiries/InquiryBadge";
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
  { href: "/panel/articles", label: "مقاله‌های مجله" },
  { href: "/panel/settings", label: "تنظیمات سایت" },
  { href: "/panel/media", label: "کتابخانه رسانه" },
  { href: "/panel/watermark", label: "واترمارک" },
  { href: "/panel/security", label: "امنیت" },
];

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
      <aside className="border-line bg-surface md:w-60 md:shrink-0 md:border-l">
        <div className="flex items-center justify-between gap-2 p-4 md:block">
          <p className="font-extrabold">
            3EVDA<span className="text-accent">.</span>
          </p>
          <p className="text-sm text-muted md:mt-1">
            {me.data?.user?.display_name || me.data?.user?.username}
          </p>
        </div>
        <nav aria-label="منوی پنل" className="overflow-x-auto">
          <ul className="flex gap-1 px-2 pb-2 md:flex-col">
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
                    className={`block whitespace-nowrap rounded-brand px-3 py-2 ${
                      active ? "bg-elevated text-accent" : "text-muted hover:text-text"
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
        <div className="hidden p-4 md:block">
          <Button variant="ghost" className="w-full" onClick={logout}>
            خروج
          </Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex justify-end p-2 md:hidden">
          <Button variant="ghost" onClick={logout}>
            خروج
          </Button>
        </div>
        <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
