"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage, type WatermarkSetting } from "@/lib/api/client";
import { useApplyWatermark, useSaveWatermark, useWatermark, watermarkPending } from "@/lib/api/queries";
import { formatNumber } from "@/lib/format";
import { fetchWatermarkPreview } from "@/lib/watermark-preview";
import { Alert, Button, Card, Field } from "./ui";

type Form = Required<Omit<WatermarkSetting, "updated_at" | "ready_count" | "marked_count">>;

const POSITIONS: { value: Form["position"]; label: string; className: string }[] = [
  { value: "bottom_right", label: "پایین راست", className: "bottom-3 right-3" },
  { value: "bottom_left", label: "پایین چپ", className: "bottom-3 left-3" },
  { value: "top_right", label: "بالا راست", className: "top-3 right-3" },
  { value: "top_left", label: "بالا چپ", className: "top-3 left-3" },
  { value: "center", label: "وسط", className: "inset-0 m-auto h-fit w-fit" },
  { value: "tile", label: "پخش روی کل عکس (با برش عکس حذف نمی‌شود)", className: "" },
];

export function WatermarkForm() {
  const current = useWatermark();
  if (!current.data) return <p className="text-muted">در حال بارگذاری…</p>;
  const {
    enabled = false,
    text = "",
    opacity = 0.35,
    position = "bottom_right",
    size_ratio = 0.035,
  } = current.data;
  return (
    <WatermarkEditor
      initial={{ enabled, text, opacity, position, size_ratio }}
      counts={{ ready: current.data.ready_count ?? 0, marked: current.data.marked_count ?? 0 }}
      pending={watermarkPending(current.data)}
    />
  );
}

function WatermarkEditor({
  initial,
  counts,
  pending,
}: {
  initial: Form;
  counts: { ready: number; marked: number };
  pending: boolean;
}) {
  const save = useSaveWatermark();
  const apply = useApplyWatermark();
  const [form, setForm] = useState<Form>(initial);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const shown = useRef<string | null>(null);

  // The picture is made by the server with the very code that stamps real photos, so it can never disagree.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchWatermarkPreview(form, controller.signal)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          if (shown.current) URL.revokeObjectURL(shown.current);
          shown.current = url;
          setPreview(url);
          setPreviewError(false);
        })
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name !== "AbortError") setPreviewError(true);
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form]);
  useEffect(
    () => () => {
      if (shown.current) URL.revokeObjectURL(shown.current);
    },
    [],
  );

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm({ ...form, [key]: value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await save.mutateAsync(form);
      setMessage({
        tone: "success",
        text: "ذخیره شد. روی همه‌ی عکس‌های سایت اعمال می‌شود؛ چند دقیقه طول می‌کشد و پیشرفتش پایین دیده می‌شود.",
      });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] leading-tight">واترمارک</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <form onSubmit={submit} className="flex flex-col gap-4">
            {message && <Alert tone={message.tone}>{message.text}</Alert>}
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => set("enabled", e.target.checked)}
                className="h-5 w-5 accent-[var(--color-accent)]"
              />
              روی عکس‌های سایت واترمارک قرار بگیرد
            </label>
            <Field
              label="متن"
              value={form.text}
              maxLength={80}
              dir="auto"
              onChange={(e) => set("text", e.target.value)}
            />
            <label className="flex flex-col gap-1 text-sm text-muted">
              جای قرارگیری
              <select
                value={form.position}
                onChange={(e) => set("position", e.target.value as Form["position"])}
                className="min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text"
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              شفافیت: {formatNumber(Math.round(form.opacity * 100))}٪
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={form.opacity}
                onChange={(e) => set("opacity", Number(e.target.value))}
                className="accent-[var(--color-accent)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              اندازه: {formatNumber(Math.round(form.size_ratio * 1000) / 10)}٪ عرض عکس
              <input
                type="range"
                min={0.01}
                max={0.2}
                step={0.005}
                value={form.size_ratio}
                onChange={(e) => set("size_ratio", Number(e.target.value))}
                className="accent-[var(--color-accent)]"
              />
            </label>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "در حال ذخیره…" : "ذخیره"}
            </Button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">پیش‌نمایش</h2>
          <div className="relative aspect-[3/2] overflow-hidden rounded-brand bg-line">
            {preview ? (
              // A blob made a moment ago by the server, not a site image: next/image has nothing to optimise.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="پیش‌نمایش واترمارک روی یک عکس نمونه" className="size-full" />
            ) : null}
            {!preview ? (
              <p
                className="absolute inset-0 flex items-center justify-center text-sm text-muted"
                role="status"
              >
                {previewError ? "ساخت پیش‌نمایش ناموفق بود." : "در حال ساخت پیش‌نمایش…"}
              </p>
            ) : null}
          </div>
          {!form.enabled ? (
            <p className="mt-2 text-sm text-accent-2">
              واترمارک خاموش است؛ این فقط نمونه‌ی ظاهر آن است و روی عکس‌های سایت اعمال نمی‌شود.
            </p>
          ) : null}
          <p className="mt-3 text-sm text-muted">فایل اصلی همیشه بدون واترمارک نگهداری می‌شود.</p>
          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-sm">
            <p role="status">
              عکس‌های آماده: <strong>{formatNumber(counts.ready)}</strong> · دارای واترمارک:{" "}
              <strong>{formatNumber(counts.marked)}</strong>
              {pending ? " — در حال اعمال تغییر…" : ""}
            </p>
            <div>
              <Button variant="ghost" disabled={apply.isPending} onClick={() => apply.mutate()}>
                {apply.isPending ? "در حال ارسال…" : "اعمال دوباره روی همه‌ی عکس‌ها"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
