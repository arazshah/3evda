"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/lib/api/client";
import {
  useDeleteGallery,
  useDownloadLog,
  useGallery,
  useGalleryAction,
  useUpdateGallery,
  type Gallery,
  type GalleryAction,
} from "@/lib/api/gallery-queries";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";
import { Alert, Button, Card } from "../ui";
import { GalleryFinals } from "./GalleryFinals";
import { GalleryForm } from "./GalleryForm";
import { GalleryPhotos } from "./GalleryPhotos";
import { GallerySelections } from "./GallerySelections";
import { STATUS_LABELS } from "./status";

const KIND: Record<string, string> = { photo: "عکس", zip: "ZIP", final: "نهایی" };

export function GalleryDetailPage({ id }: { id: number }) {
  const gallery = useGallery(id);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/panel/galleries" className="inline-flex min-h-11 items-center text-accent hover:underline">
        ← همه‌ی گالری‌ها
      </Link>
      {gallery.isError && <Alert>{errorMessage(gallery.error)}</Alert>}
      {gallery.isPending && <p className="text-muted">در حال بارگذاری…</p>}
      {gallery.data && <GalleryView key={gallery.data.id} gallery={gallery.data} />}
    </div>
  );
}

function GalleryView({ gallery }: { gallery: Gallery }) {
  const router = useRouter();
  const update = useUpdateGallery(gallery.id);
  const act = useGalleryAction(gallery.id);
  const remove = useDeleteGallery();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setMessage(null);
    try {
      await work();
      setMessage({ tone: "success", text: done });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(gallery.link);
      setCopied(true);
    } catch {
      setMessage({ tone: "error", text: "کپی خودکار ممکن نشد؛ لینک را از کادر انتخاب و کپی کنید." });
    }
  };

  const doAct = (action: GalleryAction, done: string, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    void run(() => act.mutateAsync(action), done);
  };

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold" dir="auto">
          {gallery.title}
        </h1>
        <p className="text-sm text-muted">
          {STATUS_LABELS[gallery.status] ?? gallery.status}
          {gallery.client_name ? ` · ${gallery.client_name}` : ""} · {formatNumber(gallery.ready_count)} عکس
          آماده از {formatNumber(gallery.photo_count)} · فضای مصرفی {formatBytes(gallery.usage_bytes)}
        </p>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card className="space-y-3">
        <h2 className="text-lg font-bold">وضعیت و لینک</h2>
        <div className="flex flex-wrap gap-3">
          {gallery.status === "draft" && (
            <Button
              disabled={act.isPending}
              onClick={() => doAct("publish", "گالری منتشر شد؛ لینک برای مشتری کار می‌کند.")}
            >
              انتشار
            </Button>
          )}
          {gallery.status === "submitted" && (
            <Button
              variant="ghost"
              disabled={act.isPending}
              onClick={() => doAct("reopen", "گالری دوباره باز شد؛ مشتری می‌تواند انتخاب‌ها را تغییر دهد.")}
            >
              بازکردن دوباره برای مشتری
            </Button>
          )}
          {gallery.status !== "archived" ? (
            <Button
              variant="ghost"
              disabled={act.isPending}
              onClick={() =>
                doAct(
                  "archive",
                  "گالری بایگانی شد؛ لینک دیگر کار نمی‌کند.",
                  "گالری بایگانی شود؟ لینک مشتری از کار می‌افتد.",
                )
              }
            >
              بایگانی
            </Button>
          ) : (
            <Button
              variant="ghost"
              disabled={act.isPending}
              onClick={() => doAct("unarchive", "از بایگانی درآمد.")}
            >
              درآوردن از بایگانی
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            readOnly
            aria-label="لینک گالری برای مشتری"
            dir="ltr"
            value={gallery.link}
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-11 min-w-0 flex-1 rounded-brand border border-line bg-elevated px-3 text-text"
          />
          <Button variant="ghost" onClick={copy}>
            {copied ? "کپی شد" : "کپی لینک"}
          </Button>
          <Button
            variant="ghost"
            disabled={act.isPending}
            onClick={() =>
              doAct(
                "new-link",
                "لینک تازه ساخته شد؛ لینک قبلی دیگر کار نمی‌کند.",
                "لینک تازه ساخته شود؟ لینک قبلی که به مشتری داده‌اید از کار می‌افتد.",
              )
            }
          >
            لینک تازه
          </Button>
        </div>
        {gallery.status === "draft" && (
          <p className="text-sm text-muted">
            تا انتشار، لینک برای مشتری کار نمی‌کند. برای انتشار دست‌کم یک عکس آماده لازم است.
          </p>
        )}
      </Card>

      <GalleryPhotos galleryId={gallery.id} />
      <GallerySelections galleryId={gallery.id} />
      <GalleryFinals galleryId={gallery.id} />

      <Card className="space-y-4">
        <h2 className="text-lg font-bold">تنظیمات</h2>
        <GalleryForm
          gallery={gallery}
          submitLabel="ذخیره‌ی تنظیمات"
          onSubmit={(input) => update.mutateAsync(input)}
        />
      </Card>

      <DownloadLog galleryId={gallery.id} />

      <Card className="space-y-3">
        <h2 className="text-lg font-bold">حذف گالری</h2>
        <p className="text-sm text-muted">
          گالری، همه‌ی عکس‌ها، نهایی‌ها و ZIPها حذف می‌شود و برگشت‌پذیر نیست.
        </p>
        <Button
          variant="danger"
          disabled={remove.isPending}
          onClick={() => {
            if (!window.confirm(`گالری «${gallery.title}» با همه‌ی فایل‌هایش برای همیشه حذف شود؟`)) return;
            void run(async () => {
              await remove.mutateAsync(gallery.id);
              router.push("/panel/galleries");
            }, "حذف شد.");
          }}
        >
          حذف گالری
        </Button>
      </Card>
    </>
  );
}

function DownloadLog({ galleryId }: { galleryId: number }) {
  const log = useDownloadLog(galleryId);
  const rows = log.data ?? [];
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold">لاگ دانلود</h2>
      {log.isError && <Alert>{errorMessage(log.error)}</Alert>}
      {log.isSuccess && rows.length === 0 && <p className="text-muted">هنوز دانلودی نشده.</p>}
      {rows.length > 0 && (
        <ul aria-label="لاگ دانلود" className="flex flex-col gap-1 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-1">
              <span>
                {KIND[r.kind] ?? r.kind} · {formatNumber(r.files)} فایل
                {r.originals ? " · اصل" : " · اندازه‌ی نمایش"}
              </span>
              <span className="text-muted">{formatDate(r.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
