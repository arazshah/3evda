"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";
import { errorMessage, type MediaAsset } from "@/lib/api/client";
import { keys } from "@/lib/api/queries";
import { formatNumber } from "@/lib/format";
import { uploadMedia } from "@/lib/upload";

export const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/tiff,video/mp4,video/webm";
const CONCURRENCY = 2;

type Item = {
  id: number;
  name: string;
  progress: number;
  state: "queued" | "uploading" | "done" | "error";
  message?: string;
};

export function Uploader({
  upload = uploadMedia,
  onUploaded,
}: {
  upload?: typeof uploadMedia;
  /** Called for each stored file, with how many files were sent together (a picker takes a lone file at once). */
  onUploaded?: (asset: MediaAsset, batchSize: number) => void;
}) {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);

  const patch = (id: number, change: Partial<Item>) =>
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));

  const start = async (files: File[]) => {
    const queued = files.map((file) => ({ file, id: nextId.current++ }));
    setItems((list) => [
      ...queued.map(({ file, id }) => ({ id, name: file.name, progress: 0, state: "queued" as const })),
      ...list,
    ]);
    const work = [...queued];
    const worker = async () => {
      for (let job = work.shift(); job; job = work.shift()) {
        const { file, id } = job;
        patch(id, { state: "uploading" });
        try {
          const { asset, duplicate } = await upload(file, (progress) => patch(id, { progress }));
          patch(id, { state: "done", progress: 1, message: duplicate ? "قبلاً آپلود شده بود" : undefined });
          onUploaded?.(asset, files.length);
        } catch (err) {
          patch(id, { state: "error", message: errorMessage(err) });
        }
        client.invalidateQueries({ queryKey: keys.media });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queued.length) }, worker));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void start(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-brand border-2 border-dashed p-8 text-center ${
          dragging ? "border-accent bg-elevated" : "border-line"
        }`}
      >
        <p>فایل‌ها را این‌جا رها کنید</p>
        <p className="text-sm text-muted">
          JPEG، PNG، WebP، AVIF، TIFF تا ۵۰ مگابایت · MP4 و WebM تا ۱۰۰ مگابایت
        </p>
        <button
          type="button"
          className="min-h-11 rounded-brand bg-accent px-5 font-semibold text-bg"
          onClick={() => input.current?.click()}
        >
          انتخاب فایل
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          aria-label="انتخاب فایل برای آپلود"
          onChange={(e) => {
            void start(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {items.length > 0 && (
        <ul aria-label="صف آپلود" aria-live="polite" className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-brand border border-line bg-surface px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate" dir="auto">
                  {item.name}
                </span>
                <span className={item.state === "error" ? "text-accent-2" : "text-muted"}>
                  {item.state === "uploading"
                    ? `${formatNumber(Math.round(item.progress * 100))}٪`
                    : item.state === "done"
                      ? (item.message ?? "آپلود شد")
                      : item.state === "error"
                        ? item.message
                        : "در صف"}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`پیشرفت ${item.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(item.progress * 100)}
                className="mt-1 h-1 w-full overflow-hidden rounded-full bg-elevated"
              >
                <div
                  className={`h-full transition-[width] ${item.state === "error" ? "bg-accent-2" : "bg-accent"}`}
                  style={{ width: `${Math.round((item.state === "error" ? 1 : item.progress) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
