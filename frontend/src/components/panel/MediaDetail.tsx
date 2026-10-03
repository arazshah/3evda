"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage, type MediaAsset } from "@/lib/api/client";
import { useDeleteMedia, useReprocessMedia, useUpdateMedia } from "@/lib/api/queries";
import { formatBytes, formatDate, formatDuration, formatNumber } from "@/lib/format";
import { previewUrl, STATUS_LABELS, videoUrl } from "./media-utils";
import { Alert, Button, Field } from "./ui";

export function MediaDetail({ asset, onClose }: { asset: MediaAsset; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(asset.title ?? "");
  const [altFa, setAltFa] = useState(asset.alt_fa ?? "");
  const [altEn, setAltEn] = useState(asset.alt_en ?? "");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const update = useUpdateMedia();
  const remove = useDeleteMedia();
  const reprocess = useReprocessMedia();

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal?.();
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await update.mutateAsync({ id: asset.id, title, alt_fa: altFa, alt_en: altEn });
      setMessage({ tone: "success", text: "ذخیره شد." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  const destroy = async () => {
    if (!window.confirm("این فایل برای همیشه حذف شود؟")) return;
    try {
      await remove.mutateAsync(asset.id);
      onClose();
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  const video = asset.kind === "video" ? videoUrl(asset) : undefined;
  const preview = previewUrl(asset, 960);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="media-detail-title"
      className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-brand border border-line bg-surface p-0 text-text backdrop:bg-black/70"
    >
      <div className="flex items-center justify-between border-b border-line p-4">
        <h2 id="media-detail-title" className="truncate text-lg font-bold" dir="auto">
          {asset.title || asset.original_filename}
        </h2>
        <Button variant="ghost" onClick={() => dialog.current?.close()} aria-label="بستن">
          ✕
        </Button>
      </div>
      <div className="grid gap-6 p-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          {video ? (
            <video src={video} poster={preview} controls className="w-full rounded-brand bg-black" />
          ) : preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={asset.alt_fa || ""}
              className="w-full rounded-brand bg-elevated object-contain"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-brand bg-elevated text-muted">
              {STATUS_LABELS[asset.status]}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">وضعیت</dt>
            <dd>{STATUS_LABELS[asset.status]}</dd>
            <dt className="text-muted">ابعاد</dt>
            <dd dir="ltr" className="text-end">
              {asset.width && asset.height
                ? `${formatNumber(asset.width)} × ${formatNumber(asset.height)}`
                : "—"}
            </dd>
            <dt className="text-muted">حجم اصل فایل</dt>
            <dd>{formatBytes(asset.size_bytes)}</dd>
            {asset.duration_seconds != null && (
              <>
                <dt className="text-muted">مدت</dt>
                <dd>{formatDuration(asset.duration_seconds)}</dd>
              </>
            )}
            <dt className="text-muted">واترمارک</dt>
            <dd>{asset.watermarked ? "دارد" : "ندارد"}</dd>
            <dt className="text-muted">استفاده‌شده در</dt>
            <dd>{formatNumber(asset.usage_count)} جا</dd>
            <dt className="text-muted">آپلود</dt>
            <dd>{formatDate(asset.created_at)}</dd>
          </dl>
          {asset.error && <Alert>{asset.error}</Alert>}
        </div>
        <form onSubmit={save} className="flex flex-col gap-4">
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Field label="عنوان" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          <Field
            label="متن جایگزین فارسی"
            hint="توضیح کوتاه تصویر برای نابینایان و موتورهای جست‌وجو"
            value={altFa}
            maxLength={300}
            onChange={(e) => setAltFa(e.target.value)}
          />
          <Field
            label="متن جایگزین انگلیسی"
            dir="ltr"
            value={altEn}
            maxLength={300}
            onChange={(e) => setAltEn(e.target.value)}
          />
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? "در حال ذخیره…" : "ذخیره"}
          </Button>
          <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-4">
            <a
              href={`/api/admin/media/${asset.id}/original/`}
              className="inline-flex min-h-11 items-center rounded-brand border border-line px-5 hover:border-accent"
            >
              دانلود فایل اصلی
            </a>
            <Button variant="ghost" disabled={reprocess.isPending} onClick={() => reprocess.mutate(asset.id)}>
              پردازش مجدد
            </Button>
            <Button variant="danger" disabled={remove.isPending} onClick={destroy}>
              حذف
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
