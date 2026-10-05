"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { JalaliDateInput } from "@/components/calendar/JalaliDateInput";
import { todayIso } from "@/lib/calendar/jalali";
import { errorMessage } from "@/lib/api/client";
import {
  useCreateBooking,
  useInquiry,
  useSessionTypes,
  type Inquiry,
  type SessionType,
} from "@/lib/api/queries";
import { Alert, Button, Card, Field, TextArea } from "../ui";

const SELECT = "min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text";

export function NewBookingPage({
  inquiryId,
  proformaId,
}: {
  inquiryId: number | null;
  proformaId: number | null;
}) {
  const types = useSessionTypes();
  // The enquiry is read only to fill the form; reading it also counts as opening it, which is what the owner is doing.
  const inquiry = useInquiry(inquiryId ?? 0, inquiryId !== null);
  const waiting = types.isPending || (inquiryId !== null && inquiry.isPending);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/panel/booking" className="inline-flex min-h-11 items-center text-accent hover:underline">
        ← همه‌ی رزروها
      </Link>
      <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight">رزرو دستی</h1>
      {types.isError && <Alert>{errorMessage(types.error)}</Alert>}
      {inquiryId !== null && inquiry.isError && <Alert>{errorMessage(inquiry.error)}</Alert>}
      {waiting && <p className="text-muted">در حال بارگذاری…</p>}
      {types.data && (inquiryId === null || inquiry.data) && (
        <Form types={types.data} inquiry={inquiry.data ?? null} proformaId={proformaId} />
      )}
    </div>
  );
}

function Form({
  types,
  inquiry,
  proformaId,
}: {
  types: SessionType[];
  inquiry: Inquiry | null;
  proformaId: number | null;
}) {
  const router = useRouter();
  const create = useCreateBooking();
  const [type, setType] = useState(
    String(types.find((t) => t.is_active !== false)?.id ?? types[0]?.id ?? ""),
  );
  const [date, setDate] = useState(todayIso);
  const [time, setTime] = useState("10:00");
  const [status, setStatus] = useState<"confirmed" | "pending">("confirmed");
  const [language, setLanguage] = useState<"fa" | "en">(inquiry?.language === "en" ? "en" : "fa");
  const [text, setText] = useState({
    name: inquiry?.name ?? "",
    brand: inquiry?.brand ?? "",
    phone: inquiry?.phone ?? "",
    whatsapp: inquiry?.whatsapp ?? "",
    telegram: inquiry?.telegram ?? "",
    email: inquiry?.email ?? "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const bind = (key: keyof typeof text) => ({
    value: text[key],
    onChange: (e: { target: { value: string } }) => setText({ ...text, [key]: e.target.value }),
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const made = await create.mutateAsync({
        session_type: Number(type),
        date,
        time,
        status,
        language,
        name: text.name.trim(),
        brand: text.brand.trim(),
        phone: text.phone.trim(),
        whatsapp: text.whatsapp.trim(),
        telegram: text.telegram.trim(),
        email: text.email.trim(),
        notes: text.notes.trim(),
        inquiry: inquiry?.id ?? null,
        proforma: proformaId,
      });
      router.push(`/panel/booking/${made.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {inquiry && (
        <p className="text-sm text-muted">
          از روی استعلام «<span dir="auto">{inquiry.name}</span>» پر شد.
        </p>
      )}
      {error && <Alert>{error}</Alert>}
      <Card className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="nb-type" className="text-sm text-muted">
            نوع جلسه
          </label>
          <select id="nb-type" className={SELECT} value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title_fa}
                {t.is_active === false ? " (غیرفعال)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="nb-status" className="text-sm text-muted">
            وضعیت
          </label>
          <select
            id="nb-status"
            className={SELECT}
            value={status}
            onChange={(e) => setStatus(e.target.value as "confirmed" | "pending")}
          >
            <option value="confirmed">تأییدشده</option>
            <option value="pending">در انتظار تأیید</option>
          </select>
        </div>
        <JalaliDateInput label="روز" value={date} onChange={setDate} />
        <Field
          label="ساعت"
          type="time"
          dir="ltr"
          required
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </Card>
      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label="نام مشتری" dir="auto" required {...bind("name")} />
        <Field label="برند یا کسب‌وکار" dir="auto" {...bind("brand")} />
        <Field label="تلفن" dir="ltr" {...bind("phone")} />
        <Field label="واتس‌اپ" dir="ltr" {...bind("whatsapp")} />
        <Field label="تلگرام" dir="ltr" {...bind("telegram")} />
        <Field label="ایمیل" type="email" dir="ltr" {...bind("email")} />
        <div className="flex flex-col gap-1">
          <label htmlFor="nb-language" className="text-sm text-muted">
            زبان صفحه‌ی مشتری
          </label>
          <select
            id="nb-language"
            className={SELECT}
            value={language}
            onChange={(e) => setLanguage(e.target.value as "fa" | "en")}
          >
            <option value="fa">فارسی</option>
            <option value="en">انگلیسی</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <TextArea label="توضیحات" dir="auto" rows={3} {...bind("notes")} />
        </div>
      </Card>
      <div>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "در حال ثبت…" : "ثبت رزرو"}
        </Button>
      </div>
    </form>
  );
}
