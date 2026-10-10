"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import { useMe } from "@/lib/api/queries";
import { BookingBadge } from "./booking/BookingBadge";
import { InquiryBadge } from "./inquiries/InquiryBadge";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { currentNav, Icon, isActive, NAV_GROUPS } from "./nav";
import { Button } from "./ui";

const THEME_LABELS = { label: "تم رنگی", system: "مطابق سیستم", light: "روشن", dark: "تیره" };

export function PanelShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  const verified = me.data?.state === "verified";
  // The phone menu is open for the page it was opened on; moving to another page closes it again.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const menuOpen = openFor === pathname;

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

  const here = currentNav(pathname);

  const brand = (
    <div className="flex items-baseline justify-between gap-3 md:block">
      <p className="font-display text-3xl leading-none">
        سودا<span className="text-accent-on-ink">.</span>
      </p>
      <p className="truncate text-sm text-on-ink/60 md:mt-2">
        {me.data?.user?.display_name || me.data?.user?.username}
      </p>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="bg-ink text-on-ink md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between gap-3 p-4 md:block md:px-6 md:pt-6 md:pb-4">
          {brand}
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="panel-menu"
            onClick={() => setOpenFor(menuOpen ? null : pathname)}
            className="min-h-11 rounded-full border border-on-ink/40 px-4 text-sm md:hidden"
          >
            {menuOpen ? "بستن منو" : "منو"}
          </button>
        </div>
        <nav
          id="panel-menu"
          aria-label="منوی پنل"
          className={`${menuOpen ? "block" : "hidden"} max-h-[70dvh] overflow-y-auto pb-3 md:block md:max-h-none md:flex-1`}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="px-2 pt-3 md:px-3">
              <p className="px-3 pb-1 text-xs tracking-wide text-on-ink/50">{group.title}</p>
              <ul>
                {group.items.map((entry) => {
                  const active = isActive(entry, pathname);
                  return (
                    <li key={entry.href}>
                      <Link
                        href={entry.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-10 items-center gap-3 border-s-2 px-3 py-1.5 transition-colors ${
                          active
                            ? "border-accent-on-ink bg-on-ink/10 text-on-ink"
                            : "border-transparent text-on-ink/65 hover:bg-on-ink/5 hover:text-on-ink"
                        }`}
                      >
                        <Icon name={entry.icon} />
                        <span>{entry.label}</span>
                        {entry.href === "/panel/inquiries" && <InquiryBadge />}
                        {entry.href === "/panel/booking" && <BookingBadge />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="mt-3 flex items-center gap-2 px-4 md:hidden">
            <ThemeToggle labels={THEME_LABELS} tone="onInk" />
            <Button variant="inverseGhost" className="flex-1" onClick={logout}>
              خروج
            </Button>
          </div>
        </nav>
        <div className="hidden items-center gap-2 border-t border-on-ink/10 p-4 md:flex">
          <ThemeToggle labels={THEME_LABELS} tone="onInk" />
          <Button variant="inverseGhost" className="flex-1" onClick={logout}>
            خروج
          </Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {here && (
          <div className="border-b border-line px-4 py-3 text-sm text-muted md:px-10">
            <span>{here.group}</span>
            <span aria-hidden="true"> / </span>
            <span className="text-text">{here.label}</span>
          </div>
        )}
        <main className="mx-auto max-w-6xl p-4 md:p-10">{children}</main>
      </div>
    </div>
  );
}
