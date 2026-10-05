"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api/client";
import { useLoadSample, useSampleState, useUnloadSample } from "@/lib/api/sample-queries";
import { formatNumber } from "@/lib/format";
import { Alert, Button, Card } from "./ui";

const WHAT = [
  "تنظیمات تماس و سئو (فقط جاهای خالی)",
  "اسلایدهای صفحه‌ی اصلی، خدمات، مراحل همکاری، پرسش‌ها، نظرها، مشتریان و پشت صحنه",
  "۳ دسته و ۶ نمونه‌کار با عکس‌های متعدد",
  "۲ گروه پکیج با ۵ پکیج و قواعد قیمت",
  "۳ مقاله‌ی فارسی و ۳ مقاله‌ی انگلیسی با برچسب",
  "انواع جلسه و ساعت کاری رزرو",
  "۴ استعلام ساختگی",
  "یک گالری مشتری منتشرشده با ۱۲ عکس",
];

const LABELS: Record<string, string> = {
  media: "تصویر",
  hero_slide: "اسلاید",
  service: "خدمت",
  process_step: "مرحله",
  faq: "پرسش",
  testimonial: "نظر",
  client: "مشتری",
  behind_scenes: "پشت صحنه",
  category: "دسته",
  project: "نمونه‌کار",
  package_group: "گروه پکیج",
  package: "پکیج",
  quote_rule: "قاعده‌ی قیمت",
  blog_category: "دسته‌ی مجله",
  blog_tag: "برچسب",
  article: "مقاله",
  session_type: "نوع جلسه",
  working_hours: "ساعت کاری",
  inquiry: "استعلام",
  gallery: "گالری",
};

const STATUS: Record<string, string> = {
  empty: "بارگذاری نشده",
  loading: "در حال بارگذاری…",
  loaded: "بارگذاری‌شده",
  unloading: "در حال پاک‌سازی…",
  failed: "ناموفق",
};

export function SampleContentManager() {
  const state = useSampleState();
  const load = useLoadSample();
  const unload = useUnloadSample();
  const [error, setError] = useState<string | null>(null);
  const status = state.data?.status;
  const busy = status === "loading" || status === "unloading" || load.isPending || unload.isPending;

  const start = async (kind: "load" | "unload") => {
    setError(null);
    if (
      kind === "unload" &&
      !window.confirm(
        "همه‌ی محتوای نمونه پاک می‌شود؛ حتی مواردی از آن که خودتان ویرایش کرده‌اید. " +
          "محتوای خودتان (که از نمونه نیست) دست‌نخورده می‌ماند. ادامه می‌دهید؟",
      )
    )
      return;
    try {
      await (kind === "load" ? load : unload).mutateAsync();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const counts = Object.entries(state.data?.counts ?? {});

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight">محتوای نمونه</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          با یک کلیک همه‌ی سایت با متن و عکس ساختگی پر می‌شود تا ببینید سایت کامل چه شکلی است؛ بعد هر چیزی را
          از بخش‌های همین پنل ویرایش، حذف یا اضافه کنید. هر وقت خواستید با یک کلیک همه‌ی نمونه‌ها پاک می‌شوند.
          چیزی که خودتان نوشته‌اید هرگز رونویسی نمی‌شود.
        </p>
      </div>

      {state.isError && <Alert>بارگذاری وضعیت ناموفق بود.</Alert>}
      {error && <Alert>{error}</Alert>}

      <Card>
        <h2 className="mb-1 font-display text-2xl">وضعیت</h2>
        <p role="status" className="text-lg">
          {status ? STATUS[status] : "…"}
        </p>
        {state.data?.message && (
          <Alert tone={status === "failed" ? "error" : "success"}>{state.data.message}</Alert>
        )}
        {status === "loading" || status === "unloading" ? (
          <p className="mt-2 text-sm text-muted">
            ساخت و پردازش عکس‌ها ممکن است چند دقیقه طول بکشد؛ می‌توانید از صفحه خارج شوید.
          </p>
        ) : null}

        {status === "loaded" && counts.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
            {counts.map(([key, n]) => (
              <li key={key}>
                {LABELS[key] ?? key}: <span className="tabular-nums text-text">{formatNumber(n)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {status === "empty" && (
            <Button onClick={() => void start("load")} disabled={busy}>
              {busy ? "در حال شروع…" : "بارگذاری محتوای نمونه"}
            </Button>
          )}
          {(status === "loaded" || status === "failed") && (
            <Button variant="danger" onClick={() => void start("unload")} disabled={busy}>
              پاک‌کردن همه‌ی محتوای نمونه
            </Button>
          )}
          {status === "loaded" && (
            <a href="/" target="_blank" rel="noreferrer" className="link-line min-h-11 content-center">
              دیدن سایت
            </a>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-display text-2xl">چه چیزی ساخته می‌شود؟</h2>
        <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
          {WHAT.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">
          پیش‌فاکتور و رزرو واقعی ساخته نمی‌شود. پیش از راه‌اندازی نهایی، محتوای نمونه را پاک کنید یا با
          محتوای خودتان جایگزین کنید.
        </p>
      </Card>
    </div>
  );
}
