"use client";

import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { useMediaList } from "@/lib/api/queries";
import { SystemStatusCard } from "./SystemStatusCard";
import { Card } from "./ui";

function Stat({ label, value, href }: { label: string; value?: number; href: string }) {
  return (
    <Link href={href} className="group block border-t border-text pt-4 transition-colors hover:border-accent">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display mt-1 text-5xl tabular-nums transition-colors group-hover:text-accent">
        {value === undefined ? "…" : formatNumber(value)}
      </p>
    </Link>
  );
}

export function Dashboard() {
  const all = useMediaList({});
  const images = useMediaList({ kind: "image" });
  const videos = useMediaList({ kind: "video" });
  const failed = useMediaList({ status: "failed" });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] leading-tight">داشبورد</h1>
      <SystemStatusCard />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="همه‌ی فایل‌ها" value={all.data?.count} href="/panel/media" />
        <Stat label="عکس" value={images.data?.count} href="/panel/media?kind=image" />
        <Stat label="ویدیو" value={videos.data?.count} href="/panel/media?kind=video" />
        <Stat label="پردازش ناموفق" value={failed.data?.count} href="/panel/media?status=failed" />
      </div>
      <Card>
        <h2 className="mb-2 font-display text-2xl">قدم‌های بعدی</h2>
        <p className="text-muted">
          عکس‌ها و ویدیوهای نمونه‌کار را در کتابخانه رسانه آپلود کنید و برای هر کدام متن جایگزین فارسی و
          انگلیسی بنویسید. مدیریت صفحات سایت، پکیج‌ها، بلاگ، رزرو و گالری مشتری در فازهای بعد به این پنل اضافه
          می‌شود.
        </p>
      </Card>
    </div>
  );
}
