"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api/client";
import { useSelections } from "@/lib/api/gallery-queries";
import { formatDate, formatNumber } from "@/lib/format";
import { Alert, Button, Card } from "../ui";

const FILTERS = [
  { key: "", label: "همه" },
  { key: "selected", label: "انتخاب‌شده" },
  { key: "retouch", label: "ریتاچ" },
  { key: "commented", label: "با توضیح" },
] as const;

export function GallerySelections({ galleryId }: { galleryId: number }) {
  const [only, setOnly] = useState<string>("");
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  const data = useSelections(galleryId, only);
  const summary = data.data;

  const copy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary.filenames);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-bold">انتخاب‌های مشتری</h2>
      {data.isError && <Alert>{errorMessage(data.error)}</Alert>}
      {summary && (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {`${formatNumber(summary.selected_count)} انتخاب از ${formatNumber(summary.photo_count)} عکس · ${formatNumber(summary.retouch_count)} درخواست ریتاچ · ${formatNumber(summary.comment_count)} توضیح`}
            {summary.submitted_at
              ? ` · نهایی‌شده در ${formatDate(summary.submitted_at)}`
              : " · هنوز نهایی نشده"}
          </p>

          <div className="space-y-2">
            <label htmlFor="lightroom-names" className="text-sm text-muted">
              نام فایل‌های انتخاب‌شده برای Lightroom
            </label>
            <textarea
              id="lightroom-names"
              readOnly
              rows={2}
              dir="ltr"
              value={summary.filenames}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-brand border border-line bg-elevated px-3 py-2 text-text"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="ghost" disabled={!summary.filenames} onClick={copy}>
                کپی نام‌ها
              </Button>
              {copied === "done" && (
                <span role="status" className="text-sm text-success">
                  کپی شد.
                </span>
              )}
              {copied === "failed" && (
                <span role="alert" className="text-sm text-accent-2">
                  کپی خودکار ممکن نشد؛ متن را از کادر کپی کنید.
                </span>
              )}
            </div>
            <p className="text-xs text-muted">
              در Lightroom: Library ← Filter ← Text ← Filename ← Contains any ← این متن را بچسبانید.
            </p>
          </div>
        </>
      )}

      <div role="group" aria-label="فیلتر انتخاب‌ها" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={only === f.key}
            onClick={() => setOnly(f.key)}
            className={`min-h-11 rounded-brand border px-4 ${only === f.key ? "border-accent bg-elevated text-accent" : "border-line"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {summary && summary.items.length === 0 && <p className="text-muted">موردی نیست.</p>}
      {summary && summary.items.length > 0 && (
        <ul aria-label="انتخاب‌ها" className="flex flex-col gap-2">
          {summary.items.map((item) => (
            <li key={item.photo} className="flex gap-3 rounded-brand border border-line bg-surface p-2">
              {item.thumb_url && (
                // eslint-disable-next-line @next/next/no-img-element -- a private, signed, short-lived address
                <img
                  src={item.thumb_url}
                  alt=""
                  loading="lazy"
                  className="h-20 w-28 shrink-0 rounded-brand object-cover"
                />
              )}
              <div className="min-w-0 space-y-1">
                <p className="truncate font-semibold" dir="auto">
                  {item.filename}
                </p>
                <p className="flex flex-wrap gap-2 text-xs">
                  {item.selected && (
                    <span className="rounded-full border border-accent px-2 py-0.5 text-accent">
                      انتخاب‌شده
                    </span>
                  )}
                  {item.retouch && <span className="rounded-full border border-line px-2 py-0.5">ریتاچ</span>}
                </p>
                {item.comment && (
                  <p className="whitespace-pre-wrap text-sm" dir="auto">
                    {item.comment}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
