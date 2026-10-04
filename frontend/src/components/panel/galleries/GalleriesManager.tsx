"use client";

import Link from "next/link";
import { errorMessage } from "@/lib/api/client";
import { useGalleries, type Gallery } from "@/lib/api/gallery-queries";
import { formatBytes, formatNumber } from "@/lib/format";
import { Alert } from "../ui";
import { STATUS_LABELS } from "./status";

export function GalleriesManager() {
  const galleries = useGalleries();
  const list = galleries.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">گالری‌های مشتری</h1>
        <Link
          href="/panel/galleries/new"
          className="inline-flex min-h-11 items-center rounded-brand bg-accent px-5 font-semibold text-bg hover:opacity-90"
        >
          گالری جدید
        </Link>
      </div>
      {galleries.isError && <Alert>{errorMessage(galleries.error)}</Alert>}
      {galleries.isPending && <p className="text-muted">در حال بارگذاری…</p>}
      {galleries.isSuccess && list.length === 0 && (
        <p className="text-muted">هنوز گالری‌ای نساخته‌اید. با «گالری جدید» شروع کنید.</p>
      )}
      {list.length > 0 && (
        <>
          <ul aria-label="گالری‌ها" className="flex flex-col gap-2">
            {list.map((g) => (
              <li key={g.id}>
                <GalleryRow gallery={g} />
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            فضای مصرفی همه‌ی گالری‌ها: {formatBytes(list.reduce((sum, g) => sum + g.usage_bytes, 0))}
          </p>
        </>
      )}
    </div>
  );
}

function GalleryRow({ gallery }: { gallery: Gallery }) {
  return (
    <Link
      href={`/panel/galleries/${gallery.id}`}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-brand border border-line bg-surface px-4 py-3 hover:border-accent"
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold" dir="auto">
          {gallery.title}
        </span>
        <span className="block truncate text-sm text-muted" dir="auto">
          {gallery.client_name || "بدون نام مشتری"}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>{`${formatNumber(gallery.ready_count)} عکس`}</span>
        <span>{formatBytes(gallery.usage_bytes)}</span>
        <span className="rounded-full border border-line px-3 py-1 text-text">
          {STATUS_LABELS[gallery.status] ?? gallery.status}
        </span>
      </span>
    </Link>
  );
}
