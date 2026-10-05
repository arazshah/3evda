"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import { useSaveSettings, useSettings } from "@/lib/api/queries";
import type { components } from "@/lib/api/schema";
import { previewUrl } from "./media-utils";
import { MediaPicker, type PickedMedia } from "./MediaPicker";
import { Alert, Button, Card, Field, TextArea } from "./ui";

type Settings = components["schemas"]["SiteSettings"];
type Detail = Settings["logo_detail"];

const TEXT_FIELDS = [
  "brand_name_fa",
  "brand_name_en",
  "tagline_fa",
  "tagline_en",
  "description_fa",
  "description_en",
  "phone",
  "email",
  "whatsapp",
  "telegram",
  "instagram",
  "address_fa",
  "address_en",
  "map_url",
  "footer_text_fa",
  "footer_text_en",
] as const;
type TextKey = (typeof TEXT_FIELDS)[number];

const toPicked = (id: string | null | undefined, detail: Detail, label: string): PickedMedia | null =>
  id ? { id, src: detail ? (previewUrl(detail) ?? null) : null, label } : null;

export function SettingsForm() {
  const current = useSettings();
  if (current.isError) return <Alert>بارگذاری تنظیمات ناموفق بود.</Alert>;
  if (!current.data) return <p className="text-muted">در حال بارگذاری…</p>;
  return <SettingsEditor initial={current.data} />;
}

function SettingsEditor({ initial }: { initial: Settings }) {
  const save = useSaveSettings();
  const [text, setText] = useState<Record<TextKey, string>>(
    () => Object.fromEntries(TEXT_FIELDS.map((k) => [k, initial[k] ?? ""])) as Record<TextKey, string>,
  );
  const [logo, setLogo] = useState(() => toPicked(initial.logo, initial.logo_detail, "لوگو"));
  const [ogImage, setOgImage] = useState(() =>
    toPicked(initial.og_image, initial.og_image_detail, "تصویر اشتراک‌گذاری"),
  );
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const bind = (key: TextKey) => ({
    value: text[key],
    onChange: (e: { target: { value: string } }) => setText({ ...text, [key]: e.target.value }),
    error: fieldErrors[key]?.[0],
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    try {
      await save.mutateAsync({ ...text, logo: logo?.id ?? null, og_image: ogImage?.id ?? null });
      setMessage({ tone: "success", text: "ذخیره شد و روی سایت اعمال شد." });
    } catch (err) {
      const fields = (err as { fields?: Record<string, string[]> })?.fields;
      if (fields) setFieldErrors(fields);
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight">تنظیمات سایت</h1>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card className="grid gap-4 md:grid-cols-2">
        <h2 className="font-bold md:col-span-2">برند</h2>
        <MediaPicker label="لوگو" value={logo} onChange={setLogo} />
        <MediaPicker label="تصویر اشتراک‌گذاری" value={ogImage} onChange={setOgImage} />
        <Field label="نام برند (فارسی)" dir="rtl" {...bind("brand_name_fa")} />
        <Field label="نام برند (انگلیسی)" dir="ltr" {...bind("brand_name_en")} />
        <Field label="شعار (فارسی)" dir="rtl" {...bind("tagline_fa")} />
        <Field label="شعار (انگلیسی)" dir="ltr" {...bind("tagline_en")} />
        <TextArea label="توضیح پیش‌فرض برای گوگل (فارسی)" dir="rtl" {...bind("description_fa")} />
        <TextArea label="توضیح پیش‌فرض برای گوگل (انگلیسی)" dir="ltr" {...bind("description_en")} />
      </Card>

      <Card className="grid gap-4 md:grid-cols-2">
        <h2 className="font-bold md:col-span-2">راه‌های ارتباطی</h2>
        <Field label="تلفن" dir="ltr" type="tel" {...bind("phone")} />
        <Field label="ایمیل" dir="ltr" type="email" {...bind("email")} />
        <Field label="واتس‌اپ" dir="ltr" hint="شماره با کد کشور، مثل 98912…" {...bind("whatsapp")} />
        <Field label="تلگرام" dir="ltr" hint="نام کاربری یا لینک" {...bind("telegram")} />
        <Field label="اینستاگرام" dir="ltr" hint="نام کاربری یا لینک" {...bind("instagram")} />
        <Field label="لینک نقشه" dir="ltr" type="url" {...bind("map_url")} />
        <TextArea label="نشانی (فارسی)" dir="rtl" rows={2} {...bind("address_fa")} />
        <TextArea label="نشانی (انگلیسی)" dir="ltr" rows={2} {...bind("address_en")} />
        <Field label="متن پایین صفحه (فارسی)" dir="rtl" {...bind("footer_text_fa")} />
        <Field label="متن پایین صفحه (انگلیسی)" dir="ltr" {...bind("footer_text_en")} />
      </Card>

      <div>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "در حال ذخیره…" : "ذخیره"}
        </Button>
      </div>
    </form>
  );
}
