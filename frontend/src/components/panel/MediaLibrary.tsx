"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { MediaAsset } from "@/lib/api/client";
import { useMediaList, type MediaListParams } from "@/lib/api/queries";
import { formatNumber } from "@/lib/format";
import { MediaDetail } from "./MediaDetail";
import { previewUrl, STATUS_LABELS } from "./media-utils";
import { Alert, Button } from "./ui";
import { Uploader } from "./Uploader";

const PAGE_SIZE = 40;

export function MediaLibrary() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const kind = (params.get("kind") ?? undefined) as MediaListParams["kind"];
  const status = (params.get("status") ?? undefined) as MediaListParams["status"];
  const page = Number(params.get("page") ?? "1") || 1;
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [q, setQ] = useState(search);
  const [selected, setSelected] = useState<MediaAsset | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const list = useMediaList({ q: q || undefined, kind, status, page });

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.replace(`${pathname}?${next}`);
  };

  const pages = Math.max(1, Math.ceil((list.data?.count ?? 0) / PAGE_SIZE));
  const current = selected ? (list.data?.results.find((a) => a.id === selected.id) ?? selected) : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">کتابخانه رسانه</h1>
      <Uploader />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm text-muted">
          جست‌وجو
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="نام فایل، عنوان یا متن جایگزین"
            className="min-h-11 rounded-brand border border-line bg-elevated px-3 text-text outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          نوع
          <select
            value={kind ?? ""}
            onChange={(e) => setParam("kind", e.target.value || undefined)}
            className="min-h-11 rounded-brand border border-line bg-elevated px-3 text-text"
          >
            <option value="">همه</option>
            <option value="image">عکس</option>
            <option value="video">ویدیو</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          وضعیت
          <select
            value={status ?? ""}
            onChange={(e) => setParam("status", e.target.value || undefined)}
            className="min-h-11 rounded-brand border border-line bg-elevated px-3 text-text"
          >
            <option value="">همه</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.isError && <Alert>بارگذاری فهرست ناموفق بود.</Alert>}
      <p className="text-sm text-muted" aria-live="polite">
        {list.data ? `${formatNumber(list.data.count)} فایل` : "در حال بارگذاری…"}
      </p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="فایل‌ها">
        {list.data?.results.map((asset) => {
          const src = previewUrl(asset);
          return (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => setSelected(asset)}
                className="group block w-full overflow-hidden rounded-brand border border-line bg-surface text-start hover:border-accent"
              >
                <div
                  className="aspect-square bg-elevated bg-cover bg-center"
                  style={asset.lqip ? { backgroundImage: `url(${asset.lqip})` } : undefined}
                >
                  {src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={asset.alt_fa || ""}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 p-2 text-xs">
                  <span className="truncate" dir="auto">
                    {asset.title || asset.original_filename}
                  </span>
                  {asset.status !== "ready" && (
                    <span className={asset.status === "failed" ? "text-accent-2" : "text-accent"}>
                      {STATUS_LABELS[asset.status]}
                    </span>
                  )}
                  {asset.kind === "video" && asset.status === "ready" && (
                    <span className="text-muted">ویدیو</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <nav aria-label="صفحه‌بندی" className="flex items-center justify-center gap-3">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>
            قبلی
          </Button>
          <span className="text-sm text-muted">
            صفحه {formatNumber(page)} از {formatNumber(pages)}
          </span>
          <Button variant="ghost" disabled={page >= pages} onClick={() => setParam("page", String(page + 1))}>
            بعدی
          </Button>
        </nav>
      )}

      {current && <MediaDetail key={current.id} asset={current} onClose={() => setSelected(null)} />}
    </div>
  );
}
