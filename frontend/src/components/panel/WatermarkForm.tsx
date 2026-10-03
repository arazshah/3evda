"use client";

import { useState, type FormEvent } from "react";
import { errorMessage, type WatermarkSetting } from "@/lib/api/client";
import { useSaveWatermark, useWatermark } from "@/lib/api/queries";
import { formatNumber } from "@/lib/format";
import { Alert, Button, Card, Field } from "./ui";

type Form = Required<Omit<WatermarkSetting, "updated_at">>;

const POSITIONS: { value: Form["position"]; label: string; className: string }[] = [
  { value: "bottom_right", label: "پایین راست", className: "bottom-3 right-3" },
  { value: "bottom_left", label: "پایین چپ", className: "bottom-3 left-3" },
  { value: "top_right", label: "بالا راست", className: "top-3 right-3" },
  { value: "top_left", label: "بالا چپ", className: "top-3 left-3" },
  { value: "center", label: "وسط", className: "inset-0 m-auto h-fit w-fit" },
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
  return <WatermarkEditor initial={{ enabled, text, opacity, position, size_ratio }} />;
}

function WatermarkEditor({ initial }: { initial: Form }) {
  const save = useSaveWatermark();
  const [form, setForm] = useState<Form>(initial);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm({ ...form, [key]: value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await save.mutateAsync(form);
      setMessage({
        tone: "success",
        text: "ذخیره شد. روی آپلودهای بعدی اعمال می‌شود؛ برای فایل‌های قبلی «پردازش مجدد» بزنید.",
      });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  const position = POSITIONS.find((p) => p.value === form.position) ?? POSITIONS[0]!;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">واترمارک</h1>
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
                className="min-h-11 rounded-brand border border-line bg-elevated px-3 text-text"
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
          <div
            className="relative aspect-[3/2] overflow-hidden rounded-brand"
            style={{
              background: "radial-gradient(circle at 55% 55%, #c9822c 0 18%, #6b3a17 19% 30%, #1c1611 31%)",
            }}
          >
            {form.enabled && (
              <span
                className={`absolute font-bold text-white ${position.className}`}
                style={{
                  opacity: form.opacity,
                  fontSize: `${form.size_ratio * 100}cqw`,
                  textShadow: "1px 1px 2px #000",
                }}
                dir="auto"
              >
                {form.text}
              </span>
            )}
          </div>
          <p className="mt-3 text-sm text-muted">فایل اصلی همیشه بدون واترمارک نگهداری می‌شود.</p>
        </Card>
      </div>
    </div>
  );
}
