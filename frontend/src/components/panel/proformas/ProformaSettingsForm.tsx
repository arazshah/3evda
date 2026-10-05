"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import { useProformaSettings, useSaveProformaSettings, type ProformaSettings } from "@/lib/api/queries";
import { Alert, Button, Card, Field, TextArea } from "../ui";

export function ProformaSettingsForm() {
  const settings = useProformaSettings();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/panel/proformas" className="inline-flex min-h-11 items-center text-accent hover:underline">
        ← پیش‌فاکتورها
      </Link>
      <h1 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] leading-tight">اطلاعات صدور پیش‌فاکتور</h1>
      <p className="text-sm text-muted">
        این اطلاعات هنگام صدور روی پیش‌فاکتور ثبت می‌شود؛ تغییرشان پیش‌فاکتورهای قبلی را عوض نمی‌کند. شرایط و
        مالیات، مقدار اولیه‌ی پیش‌نویس‌های تازه است.
      </p>
      {settings.isError && <Alert>{errorMessage(settings.error)}</Alert>}
      {settings.isPending && <p className="text-muted">در حال بارگذاری…</p>}
      {settings.data && <Form initial={settings.data} />}
    </div>
  );
}

function Form({ initial }: { initial: ProformaSettings }) {
  const save = useSaveProformaSettings();
  const [form, setForm] = useState<ProformaSettings>(initial);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const set = (key: keyof ProformaSettings, value: string | number) => setForm({ ...form, [key]: value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await save.mutateAsync({ ...form, default_validity_days: Number(form.default_validity_days) });
      setMessage({ tone: "success", text: "ذخیره شد." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  const text = (key: keyof ProformaSettings, label: string, extra = {}) => (
    <Field
      label={label}
      value={String(form[key] ?? "")}
      onChange={(e) => set(key, e.target.value)}
      {...extra}
    />
  );
  const area = (key: keyof ProformaSettings, label: string) => (
    <TextArea
      label={label}
      dir="auto"
      rows={4}
      value={String(form[key] ?? "")}
      onChange={(e) => set(key, e.target.value)}
    />
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Card className="grid gap-4 sm:grid-cols-2">
        {text("issuer_name_fa", "نام صادرکننده (فارسی)", { dir: "auto" })}
        {text("issuer_name_en", "نام صادرکننده (انگلیسی)", { dir: "ltr" })}
        {text("phone", "تلفن", { dir: "ltr" })}
        <span />
        {text("address_fa", "نشانی (فارسی)", { dir: "auto" })}
        {text("address_en", "نشانی (انگلیسی)", { dir: "ltr" })}
        {text("footer_fa", "پانویس (فارسی)", { dir: "auto" })}
        {text("footer_en", "پانویس (انگلیسی)", { dir: "ltr" })}
      </Card>
      <Card className="grid gap-4 sm:grid-cols-2">
        {text("default_validity_days", "مدت اعتبار پیش‌فرض (روز)", {
          type: "number",
          min: 1,
          max: 365,
          dir: "ltr",
        })}
        {text("default_tax_percent", "درصد مالیات پیش‌فرض", {
          type: "number",
          min: 0,
          max: 100,
          step: "0.01",
          dir: "ltr",
        })}
        {area("terms_fa", "شرایط پیش‌فرض (فارسی)")}
        {area("terms_en", "شرایط پیش‌فرض (انگلیسی)")}
      </Card>
      <div>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "در حال ذخیره…" : "ذخیره"}
        </Button>
      </div>
    </form>
  );
}
