"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { errorMessage } from "@/lib/api/client";
import { galleryKeys, useDeleteFinal, useFinals } from "@/lib/api/gallery-queries";
import { formatBytes } from "@/lib/format";
import { uploadTo } from "@/lib/upload";
import { Alert, Button, Card } from "../ui";
import { PHOTO_ACCEPT } from "./GalleryPhotos";

export function GalleryFinals({ galleryId }: { galleryId: number }) {
  const client = useQueryClient();
  const finals = useFinals(galleryId);
  const remove = useDeleteFinal(galleryId);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const upload = async (files: File[]) => {
    setBusy(true);
    setProblems([]);
    const failed: string[] = [];
    for (const file of files) {
      try {
        await uploadTo(`/api/admin/galleries/${galleryId}/finals/`, file, () => undefined);
      } catch (err) {
        failed.push(`${file.name}: ${errorMessage(err)}`);
      }
    }
    setProblems(failed);
    setBusy(false);
    await client.invalidateQueries({ queryKey: galleryKeys.finals(galleryId) });
    await client.invalidateQueries({ queryKey: galleryKeys.detail(galleryId) });
  };

  const list = finals.data ?? [];
  return (
    <Card className="space-y-4">
      <h2 className="font-display text-2xl">نسخه‌های نهایی تحویلی</h2>
      <p className="text-sm text-muted">
        عکس‌های آماده‌ی تحویل. مشتری همیشه می‌تواند این‌ها را دانلود کند، حتی اگر دانلود عکس‌های گالری بسته
        باشد.
      </p>
      <div>
        <Button disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "در حال آپلود…" : "افزودن نهایی"}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={PHOTO_ACCEPT}
          className="sr-only"
          aria-label="انتخاب فایل نهایی"
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {problems.map((p) => (
        <Alert key={p}>{p}</Alert>
      ))}
      {finals.isError && <Alert>{errorMessage(finals.error)}</Alert>}
      {finals.isSuccess && list.length === 0 && <p className="text-muted">هنوز فایل نهایی‌ای نیست.</p>}
      {list.length > 0 && (
        <ul aria-label="فایل‌های نهایی" className="flex flex-col gap-2">
          {list.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-brand border border-line bg-surface px-3 py-2"
            >
              <span className="min-w-0 truncate" dir="auto">
                {f.filename}
                <span className="mr-2 text-sm text-muted">{formatBytes(f.size_bytes)}</span>
              </span>
              <Button
                variant="danger"
                aria-label={`حذف ${f.filename}`}
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`«${f.filename}» حذف شود؟`)) void remove.mutateAsync(f.id);
                }}
              >
                حذف
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
