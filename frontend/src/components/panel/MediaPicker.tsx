"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import type { MediaAsset } from "@/lib/api/client";
import { useMediaList } from "@/lib/api/queries";
import { IMAGE_SPECS, sizeLabel, type ImageSpecKey } from "@/lib/image-specs";
import { previewUrl, STATUS_LABELS } from "./media-utils";
import { Alert, Button } from "./ui";
import { Uploader } from "./Uploader";

export type PickedMedia = { id: string; src: string | null; label: string };

/**
 * A field that holds one library image: shows the current picture, opens the library to choose
 * another one (or upload it on the spot) and can clear the value.
 */
export function MediaPicker({
  label,
  value,
  onChange,
  kind = "image",
  required = false,
  spec,
}: {
  label: string;
  value: PickedMedia | null;
  onChange: (next: PickedMedia | null) => void;
  kind?: "image" | "video" | "any";
  required?: boolean;
  /** Which slot this is, so the exact recommended size is written under the field. */
  spec?: ImageSpecKey;
}) {
  const [open, setOpen] = useState(false);
  const size = spec ? IMAGE_SPECS[spec] : null;
  const choose = (asset: MediaAsset) => {
    onChange({ id: asset.id, src: previewUrl(asset) ?? null, label: asset.title || asset.original_filename });
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-24 items-center justify-center overflow-hidden rounded-brand border border-line bg-elevated text-xs text-muted">
          {value?.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.src} alt="" className="size-full object-cover" />
          ) : value ? (
            <span>{value.label}</span>
          ) : (
            <span>بدون تصویر</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col items-start gap-2">
          {value && (
            <span className="max-w-48 truncate text-xs text-muted" dir="auto">
              {value.label}
            </span>
          )}
          <Button
            variant="ghost"
            onClick={() => setOpen(true)}
            aria-label={`${value ? "تغییر" : "انتخاب"} ${label}`}
          >
            {value ? "تغییر" : "انتخاب از کتابخانه"}
          </Button>
        </div>
        {value && !required && (
          <Button variant="ghost" onClick={() => onChange(null)} aria-label={`حذف ${label}`}>
            حذف
          </Button>
        )}
      </div>
      {size && (
        <p className="text-xs text-muted">
          اندازه‌ی پیشنهادی:{" "}
          <bdi dir="ltr" className="font-semibold text-text">
            {sizeLabel(size)}
          </bdi>{" "}
          ({size.ratio}) · {size.format}
        </p>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} label={`انتخاب ${label}`} closeLabel="بستن">
        <div className="max-h-dvh w-[min(64rem,100dvw)] overflow-y-auto rounded-brand border border-line bg-surface p-4 sm:p-6">
          <PickerBody kind={kind} selectedId={value?.id} spec={spec} onPick={choose} />
        </div>
      </Dialog>
    </div>
  );
}

function PickerBody({
  kind,
  selectedId,
  spec,
  onPick,
}: {
  kind: "image" | "video" | "any";
  selectedId?: string;
  spec?: ImageSpecKey;
  onPick: (asset: MediaAsset) => void;
}) {
  const [page, setPage] = useState(1);
  // Not filtered by status: a fresh upload is pending, and only a result containing it keeps the list polling.
  const list = useMediaList({ kind: kind === "any" ? undefined : kind, page });
  const pages = Math.max(1, Math.ceil((list.data?.count ?? 0) / 40));
  const [waiting, setWaiting] = useState<string | null>(null);
  const taken = useRef(false);
  const arrived = waiting ? list.data?.results.find((a) => a.id === waiting) : undefined;
  const failed = arrived?.status === "failed";

  // The upload is in the list straight away but pending; the list polls until it is ready, then it is chosen
  // (choosing closes the library, so there is nothing to reset afterwards).
  useEffect(() => {
    if (arrived?.status === "ready" && !taken.current) {
      taken.current = true;
      onPick(arrived);
    }
  }, [arrived, onPick]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-2xl">کتابخانه رسانه</h2>
      {spec && (
        <p className="text-sm text-muted">
          برای «{IMAGE_SPECS[spec].title}»:{" "}
          <bdi dir="ltr" className="font-semibold text-text">
            {sizeLabel(IMAGE_SPECS[spec])}
          </bdi>{" "}
          ({IMAGE_SPECS[spec].ratio}) · {IMAGE_SPECS[spec].format}. {IMAGE_SPECS[spec].note}
        </p>
      )}
      <Uploader
        // A single new file is what the owner came for: use it as soon as it is processed (a field only accepts a
        // ready image), with no need to find its tile.
        onUploaded={(asset, count) => {
          setWaiting(count === 1 ? asset.id : null);
        }}
      />
      {waiting && !failed && (
        <p role="status" className="text-sm text-muted">
          در حال آماده‌سازی تصویر؛ به‌محض آماده‌شدن انتخاب می‌شود…
        </p>
      )}
      {list.isError && <Alert>بارگذاری فهرست ناموفق بود.</Alert>}
      {failed && <Alert>پردازش این تصویر ناموفق بود؛ فایل دیگری را امتحان کنید.</Alert>}
      {list.data && list.data.results.length === 0 && (
        <p className="text-muted">هنوز فایل آماده‌ای نیست؛ همین‌جا آپلود کنید.</p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5" aria-label="فایل‌ها">
        {list.data?.results.map((asset) => {
          const src = previewUrl(asset);
          const name = asset.title || asset.original_filename;
          const ready = asset.status === "ready";
          return (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => onPick(asset)}
                disabled={!ready}
                aria-pressed={asset.id === selectedId}
                aria-label={ready ? name : `${name} (${STATUS_LABELS[asset.status]})`}
                className={`relative block w-full overflow-hidden rounded-brand border bg-elevated enabled:hover:border-accent disabled:opacity-60 ${
                  asset.id === selectedId ? "border-accent" : "border-line"
                }`}
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                ) : (
                  <span className="flex aspect-square items-center justify-center p-2 text-xs text-muted">
                    {STATUS_LABELS[asset.status]}
                  </span>
                )}
                {asset.id === selectedId && (
                  <span
                    aria-hidden="true"
                    className="absolute end-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full bg-accent text-sm text-bg"
                  >
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            قبلی
          </Button>
          <Button variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            بعدی
          </Button>
        </div>
      )}
    </div>
  );
}
