"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import {
  galleryKeys,
  useDeletePhoto,
  useGalleryPhotos,
  useReorderPhotos,
  type GalleryPhoto,
} from "@/lib/api/gallery-queries";
import { formatBytes, formatNumber } from "@/lib/format";
import { moveId } from "@/lib/reorder";
import { uploadTo } from "@/lib/upload";
import { Alert, Button, Card } from "../ui";
import { runUploads, type QueueItem } from "./upload-queue";

export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/tiff";
type Upload = (file: File, onProgress: (fraction: number) => void) => Promise<unknown>;

export function GalleryPhotos({ galleryId, upload }: { galleryId: number; upload?: Upload }) {
  const client = useQueryClient();
  const photos = useGalleryPhotos(galleryId);
  const reorder = useReorderPhotos(galleryId);
  const remove = useDeletePhoto(galleryId);
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const files = useRef(new Map<number, File>());
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send: Upload =
    upload ?? ((file, onProgress) => uploadTo(`/api/admin/galleries/${galleryId}/photos/`, file, onProgress));

  const patch = (id: number, change: Partial<QueueItem>) =>
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));

  const refresh = () => {
    void client.invalidateQueries({ queryKey: galleryKeys.photos(galleryId) });
    void client.invalidateQueries({ queryKey: galleryKeys.detail(galleryId) });
  };

  const start = async (chosen: File[]) => {
    if (chosen.length === 0) return;
    const jobs = chosen.map((file) => {
      const id = nextId.current++;
      files.current.set(id, file);
      return { id, file };
    });
    setItems((list) => [
      ...jobs.map(({ file, id }) => ({ id, name: file.name, progress: 0, state: "queued" as const })),
      ...list,
    ]);
    let finished = 0;
    await runUploads(
      jobs,
      send,
      patch,
      () => {
        finished += 1;
        if (finished % 10 === 0) refresh(); // a long batch shows its photos as it goes, not 500 reloads
      },
      errorMessage,
    );
    refresh();
  };

  const retry = (id: number) => {
    const file = files.current.get(id);
    if (!file) return;
    patch(id, { state: "queued", progress: 0, message: undefined });
    void runUploads([{ id, file }], send, patch, () => undefined, errorMessage).then(refresh);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void start(Array.from(event.dataTransfer.files));
  };

  const list = photos.data ?? [];
  const ids = list.map((p) => p.id);
  const move = async (index: number, delta: -1 | 1) => {
    setError(null);
    try {
      await reorder.mutateAsync(moveId(ids, index, delta));
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const drop = async (photo: GalleryPhoto) => {
    if (!window.confirm(`«${photo.original_filename}» از گالری حذف شود؟ فایل‌ها هم پاک می‌شوند.`)) return;
    setError(null);
    try {
      await remove.mutateAsync(photo.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const active = items.filter(
    (i) => i.state === "queued" || i.state === "uploading" || i.state === "retrying",
  );

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-bold">عکس‌ها</h2>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-brand border-2 border-dashed p-6 text-center ${
          dragging ? "border-accent bg-elevated" : "border-line"
        }`}
      >
        <p>عکس‌ها را این‌جا رها کنید (چندتا هم‌زمان؛ حداکثر سه فایل هم‌زمان آپلود می‌شود)</p>
        <p className="text-sm text-muted">
          JPEG، PNG، WebP، AVIF، TIFF · عکس تکراری در همین گالری پذیرفته نمی‌شود
        </p>
        <Button onClick={() => input.current?.click()}>انتخاب عکس</Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={PHOTO_ACCEPT}
          className="sr-only"
          aria-label="انتخاب عکس برای آپلود در گالری"
          onChange={(e) => {
            void start(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {active.length > 0 && (
        <p aria-live="polite" className="text-sm text-muted">
          {`${formatNumber(active.length)} فایل در صف یا در حال آپلود`}
        </p>
      )}
      {items.length > 0 && (
        <ul aria-label="صف آپلود" className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="rounded-brand border border-line bg-surface px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate" dir="auto">
                  {item.name}
                </span>
                <span className={item.state === "error" ? "text-accent-2" : "text-muted"}>
                  {item.state === "uploading"
                    ? `${formatNumber(Math.round(item.progress * 100))}٪`
                    : item.state === "retrying"
                      ? "تلاش دوباره…"
                      : item.state === "done"
                        ? "آپلود شد"
                        : item.state === "error"
                          ? item.message
                          : "در صف"}
                </span>
                {item.state === "error" && (
                  <button
                    type="button"
                    className="min-h-11 px-2 text-accent hover:underline"
                    onClick={() => retry(item.id)}
                  >
                    {`تلاش دوباره ${item.name}`}
                  </button>
                )}
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
                  className={`h-full ${item.state === "error" ? "bg-accent-2" : "bg-accent"}`}
                  style={{ width: `${Math.round((item.state === "error" ? 1 : item.progress) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <Alert>{error}</Alert>}
      {photos.isError && <Alert>{errorMessage(photos.error)}</Alert>}
      {photos.isSuccess && list.length === 0 && <p className="text-muted">هنوز عکسی نیست.</p>}
      {list.length > 0 && (
        <ul aria-label="عکس‌های گالری" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((photo, index) => (
            <li
              key={photo.id}
              className="flex flex-col gap-2 rounded-brand border border-line bg-surface p-2"
            >
              <div className="flex aspect-[3/2] items-center justify-center overflow-hidden rounded-brand bg-elevated">
                {photo.thumb_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a private, signed, short-lived address
                  <img
                    src={photo.thumb_url}
                    alt={photo.original_filename}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="px-2 text-center text-sm text-muted">
                    {photo.status === "failed" ? "پردازش نشد" : "در حال آماده‌سازی…"}
                  </span>
                )}
              </div>
              <p className="truncate text-sm" dir="auto" title={photo.original_filename}>
                {photo.original_filename}
              </p>
              <p className="text-xs text-muted">
                {formatBytes(photo.size_bytes)}
                {photo.status === "failed" && photo.error ? ` · ${photo.error}` : ""}
              </p>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="ghost"
                  className="min-w-11 px-2"
                  aria-label={`جلوتر بردن ${photo.original_filename}`}
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                >
                  →
                </Button>
                <Button
                  variant="ghost"
                  className="min-w-11 px-2"
                  aria-label={`عقب‌تر بردن ${photo.original_filename}`}
                  disabled={index === list.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                >
                  ←
                </Button>
                <Button
                  variant="danger"
                  className="px-3"
                  aria-label={`حذف ${photo.original_filename}`}
                  disabled={remove.isPending}
                  onClick={() => drop(photo)}
                >
                  حذف
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
