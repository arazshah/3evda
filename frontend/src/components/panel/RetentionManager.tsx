"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import {
  useRetentionPreview,
  useRetentionSettings,
  useRunRetention,
  useSaveRetention,
  type RetentionSettings,
} from "@/lib/api/retention-queries";
import { formatDate, formatNumber } from "@/lib/format";
import { Alert, Button, Card, Field } from "./ui";

type Message = { tone: "success" | "error"; text: string } | null;

const NAMES: Record<string, string> = {
  inquiries: "استعلام‌ها",
  bookings: "رزروها",
  galleries: "گالری‌ها",
  proformas: "اطلاعات مشتری روی پیش‌فاکتورها",
};

export function RetentionManager() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] leading-tight">نگهداری اطلاعات</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          اطلاعات شخصی مشتری‌ها تا ابد نگه داشته نمی‌شود. هر شب پس از پشتیبان‌گیری، موارد قدیمی‌تر از مدت‌های
          زیر ناشناس یا حذف می‌شوند. <strong>پیش‌فاکتورِ صادرشده هرگز حذف نمی‌شود</strong> و شماره، اقلام،
          مبلغ‌ها، تاریخ‌ها و وضعیت آن عوض نمی‌شود؛ فقط نام و تماس مشتری روی آن، پس از مدت جداگانه‌اش، پاک
          می‌شود.
        </p>
      </div>
      <SettingsSection />
      <PreviewSection />
    </div>
  );
}

function SettingsSection() {
  const settings = useRetentionSettings();
  return (
    <Card>
      <h2 className="mb-3 font-display text-2xl">مدت‌ها</h2>
      {settings.isError && <Alert>بارگذاری تنظیمات ناموفق بود.</Alert>}
      {settings.data && <SettingsForm initial={settings.data} />}
    </Card>
  );
}

function SettingsForm({ initial }: { initial: RetentionSettings }) {
  const save = useSaveRetention();
  const [enabled, setEnabled] = useState(initial.enabled ?? true);
  const [values, setValues] = useState({
    inquiry_months: String(initial.inquiry_months ?? 24),
    booking_months: String(initial.booking_months ?? 24),
    gallery_days: String(initial.gallery_days ?? 90),
    proforma_months: String(initial.proforma_months ?? 60),
  });
  const [message, setMessage] = useState<Message>(null);
  const field = (key: keyof typeof values) => ({
    value: values[key],
    onChange: (e: { target: { value: string } }) => setValues({ ...values, [key]: e.target.value }),
    type: "number" as const,
    dir: "ltr" as const,
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await save.mutateAsync({
        enabled,
        inquiry_months: Number(values.inquiry_months),
        booking_months: Number(values.booking_months),
        gallery_days: Number(values.gallery_days),
        proforma_months: Number(values.proforma_months),
      });
      setMessage({ tone: "success", text: "مدت‌ها ذخیره شد." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="size-5 accent-[var(--color-accent)]"
        />
        <span>پاک‌سازی خودکار فعال باشد</span>
      </label>
      {!enabled && (
        <Alert tone="success">
          پاک‌سازی خاموش است؛ هیچ اطلاعاتی ناشناس یا حذف نمی‌شود (حتی اگر دکمه‌ی «اجرا» را بزنید).
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="استعلام‌ها: پس از چند ماه ناشناس شود" min={3} max={120} {...field("inquiry_months")} />
        <Field label="رزروها: چند ماه پس از جلسه ناشناس شود" min={3} max={120} {...field("booking_months")} />
        <Field
          label="گالری‌ها: چند روز پس از انقضا یا بایگانی حذف شود"
          hint="گالری با همه‌ی عکس‌ها و فایل‌هایش حذف می‌شود."
          min={7}
          max={730}
          {...field("gallery_days")}
        />
        <Field
          label="مشتری روی پیش‌فاکتور: پس از چند ماه از صدور ناشناس شود"
          hint="پیش‌فاکتور سند مالی است؛ پیشنهاد: ۶۰ ماه یا هر مدتی که حسابدار شما می‌خواهد."
          min={12}
          max={240}
          {...field("proforma_months")}
        />
      </div>
      <div>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "در حال ذخیره…" : "ذخیره‌ی مدت‌ها"}
        </Button>
      </div>
    </form>
  );
}

function PreviewSection() {
  const preview = useRetentionPreview();
  const settings = useRetentionSettings();
  const run = useRunRetention();
  const [message, setMessage] = useState<Message>(null);
  const rows = preview.data?.rows ?? [];
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const last = settings.data?.last_run_at;

  const execute = async () => {
    setMessage(null);
    const detail = rows
      .filter((r) => r.count > 0)
      .map((r) => `${NAMES[r.key] ?? r.label}: ${formatNumber(r.count)}`);
    if (!window.confirm(`این کار برگشت‌پذیر نیست.\n${detail.join("\n")}\nاجرا شود؟`)) return;
    try {
      const result = await run.mutateAsync();
      const done = Object.values(result.counts).reduce((a, b) => a + b, 0);
      setMessage({ tone: "success", text: `انجام شد: ${formatNumber(done)} مورد.` });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <Card>
      <h2 className="mb-1 font-display text-2xl">پیش‌نمایش: همین حالا چه چیزی پاک می‌شود؟</h2>
      <p className="mb-3 text-sm text-muted">
        فقط شمارش است؛ چیزی تغییر نمی‌کند و اطلاعات شخصی نشان داده نمی‌شود.
      </p>
      {preview.isError && <Alert>بارگذاری پیش‌نمایش ناموفق بود.</Alert>}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {rows.length > 0 && (
        <table className="mt-2 w-full text-start text-sm">
          <caption className="sr-only">آنچه در اجرای بعدی پاک می‌شود</caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-2 text-start font-normal">
                مورد
              </th>
              <th scope="col" className="py-2 text-start font-normal">
                تعداد
              </th>
              <th scope="col" className="py-2 text-start font-normal">
                قدیمی‌ترین
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="py-2 text-start font-normal">
                  {row.label}
                </th>
                <td className="py-2 tabular-nums">{formatNumber(row.count)}</td>
                <td className="py-2">{row.oldest ? formatDate(row.oldest) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-sm text-muted">
        {last ? `آخرین اجرا: ${formatDate(last)}` : "هنوز اجرایی انجام نشده است."}
      </p>
      <div className="mt-3">
        <Button variant="danger" onClick={() => void execute()} disabled={run.isPending || total === 0}>
          {run.isPending ? "در حال اجرا…" : "اجرا همین حالا"}
        </Button>
      </div>
    </Card>
  );
}
