"use client";

import { useState, type FormEvent } from "react";
import { JalaliDateInput } from "@/components/calendar/JalaliDateInput";
import { todayIso } from "@/lib/calendar/jalali";
import { addDays } from "@/lib/calendar/jalali";
import { errorMessage } from "@/lib/api/client";
import type { DownloadLevel, Gallery, GalleryInput } from "@/lib/api/gallery-queries";
import { Alert, Button, Field, TextArea } from "../ui";
import { LEVELS, LEVEL_LABELS, endOfTehranDay, tehranDay } from "./status";

const CONTROL =
  "min-h-11 rounded-brand border border-line bg-elevated px-3 text-text outline-none focus:border-accent";

/** Create or edit a gallery. The password is write-only: an empty box leaves it as it is. */
export function GalleryForm({
  gallery,
  submitLabel,
  onSubmit,
}: {
  gallery?: Gallery;
  submitLabel: string;
  onSubmit: (input: GalleryInput) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(gallery?.title ?? "");
  const [client, setClient] = useState(gallery?.client_name ?? "");
  const [language, setLanguage] = useState<"fa" | "en">(gallery?.language ?? "fa");
  const [expires, setExpires] = useState(gallery ? gallery.expires_at !== null : true);
  const [day, setDay] = useState(
    gallery?.expires_at ? tehranDay(gallery.expires_at) : addDays(todayIso(), 30),
  );
  const [limited, setLimited] = useState(gallery ? gallery.selection_limit !== null : false);
  const [limit, setLimit] = useState(String(gallery?.selection_limit ?? 20));
  const [level, setLevel] = useState<DownloadLevel>(gallery?.download_level ?? "selected");
  const [watermark, setWatermark] = useState(gallery?.watermark ?? true);
  const [note, setNote] = useState(gallery?.note ?? "");
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const count = Number(limit);
    if (limited && (!Number.isInteger(count) || count < 1)) {
      setMessage({ tone: "error", text: "سقف انتخاب باید عددی صحیح و دست‌کم ۱ باشد." });
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        client_name: client.trim(),
        language,
        expires_at: expires ? endOfTehranDay(day) : null,
        selection_limit: limited ? count : null,
        download_level: level,
        watermark,
        note,
        ...(password ? { password } : {}),
        ...(clearPassword ? { clear_password: true } : {}),
      });
      setPassword("");
      setClearPassword(false);
      setMessage({ tone: "success", text: "ذخیره شد." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="عنوان گالری"
          dir="auto"
          required
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Field
          label="نام مشتری"
          dir="auto"
          maxLength={120}
          value={client}
          onChange={(e) => setClient(e.target.value)}
        />
        <label className="flex flex-col gap-1 text-sm text-muted">
          زبان صفحه‌ی مشتری
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as "fa" | "en")}
            className={CONTROL}
          >
            <option value="fa">فارسی</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          سطح دانلود
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as DownloadLevel)}
            className={CONTROL}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm text-muted">مهلت</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={expires} onChange={(e) => setExpires(e.target.checked)} />
          گالری تا یک روز مشخص باز باشد
        </label>
        {expires && <JalaliDateInput label="آخرین روز" value={day} onChange={setDay} years={2} />}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm text-muted">سقف انتخاب</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={limited} onChange={(e) => setLimited(e.target.checked)} />
          تعداد عکس قابل‌انتخاب محدود باشد
        </label>
        {limited && (
          <Field
            label="حداکثر تعداد"
            type="number"
            inputMode="numeric"
            min={1}
            dir="ltr"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        )}
      </fieldset>

      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} />
        پیش‌نمایش‌ها واترمارک داشته باشند (فقط برای عکس‌هایی که از این پس آپلود می‌شوند)
      </label>

      <div className="flex flex-col gap-2">
        <Field
          label={gallery?.has_password ? "رمز تازه (خالی = بدون تغییر)" : "رمز گالری (اختیاری)"}
          type="text"
          dir="ltr"
          autoComplete="off"
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="رمز را از راهی جدا (مثلاً پیام‌رسان) به مشتری بدهید؛ در پنل دوباره نشان داده نمی‌شود."
        />
        {gallery?.has_password && (
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={clearPassword}
              onChange={(e) => setClearPassword(e.target.checked)}
            />
            رمز برداشته شود
          </label>
        )}
      </div>

      <TextArea
        label="یادداشت داخلی"
        dir="auto"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        hint="فقط خودتان می‌بینید."
      />
      <div>
        <Button type="submit" disabled={busy || !title.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
