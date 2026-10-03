"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import {
  useDeleteInquiry,
  useInquiry,
  useSaveInquiry,
  type Inquiry,
  type InquiryStatus,
} from "@/lib/api/queries";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";
import { telHref } from "@/lib/site/text";
import { Alert, Button, Card, TextArea } from "../ui";
import { telegramLink, whatsappLink } from "./links";
import { rangeText, STATUS_LABELS, STATUS_ORDER } from "./status";

type Choice = { key: string; label: string };

/** `options` is stored JSON; read only the shape this page shows. */
function choices(options: unknown, name: "addons" | "multipliers"): Choice[] {
  const list = (options as Record<string, unknown> | null)?.[name];
  if (!Array.isArray(list)) return [];
  return list.filter((c): c is Choice => typeof c?.key === "string" && typeof c?.label === "string");
}

export function InquiryDetailPage({ id }: { id: number }) {
  const [deleted, setDeleted] = useState(false);
  // Once it is deleted the page is on its way out; asking the server for it again would only be a 404.
  const inquiry = useInquiry(id, !deleted);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/panel/inquiries" className="inline-flex min-h-11 items-center text-accent hover:underline">
        ← همه‌ی استعلام‌ها
      </Link>
      {inquiry.isError && <Alert>{errorMessage(inquiry.error)}</Alert>}
      {inquiry.isPending && <p className="text-muted">در حال بارگذاری…</p>}
      {inquiry.data && (
        <InquiryView key={inquiry.data.id} inquiry={inquiry.data} onDeleted={() => setDeleted(true)} />
      )}
    </div>
  );
}

/** A link when the value is a plain handle or number; otherwise the text as typed, never a link. */
function ContactValue({ value, href }: { value: string; href: string | null }) {
  if (!href) return <span dir="ltr">{value}</span>;
  return (
    <a
      className="text-accent hover:underline"
      dir="ltr"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {value}
    </a>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <dt className="text-muted">{label}:</dt>
      <dd dir="auto">{children}</dd>
    </div>
  );
}

function InquiryView({ inquiry, onDeleted }: { inquiry: Inquiry; onDeleted: () => void }) {
  const router = useRouter();
  const save = useSaveInquiry();
  const remove = useDeleteInquiry();
  const [status, setStatus] = useState<InquiryStatus>(inquiry.status ?? "new");
  const [note, setNote] = useState(inquiry.internal_note ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const addons = choices(inquiry.options, "addons");
  const multipliers = choices(inquiry.options, "multipliers");
  const range = rangeText(inquiry.estimate_low, inquiry.estimate_high, formatNumber);
  const changed = status !== inquiry.status || note !== (inquiry.internal_note ?? "");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      // Only what changed is sent, so a note saved later never overwrites a status changed elsewhere.
      await save.mutateAsync({
        id: inquiry.id,
        ...(status !== inquiry.status ? { status } : {}),
        ...(note !== (inquiry.internal_note ?? "") ? { internal_note: note } : {}),
      });
      setMessage({ tone: "success", text: "ذخیره شد." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  const destroy = async () => {
    if (!window.confirm("این استعلام و پیوست‌هایش برای همیشه حذف شود؟")) return;
    try {
      await remove.mutateAsync(inquiry.id);
      onDeleted();
      router.push("/panel/inquiries");
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold" dir="auto">
          {inquiry.name}
          {inquiry.brand ? ` · ${inquiry.brand}` : ""}
        </h1>
        <p className="text-sm text-muted">
          {formatDate(inquiry.created_at)} · فرم {inquiry.language === "en" ? "انگلیسی" : "فارسی"}
        </p>
      </div>

      <Card className="space-y-3">
        <h2 className="text-lg font-bold">راه‌های تماس</h2>
        <dl className="space-y-2">
          {inquiry.phone && (
            <Row label="تلفن">
              <a className="text-accent hover:underline" dir="ltr" href={telHref(inquiry.phone)}>
                {inquiry.phone}
              </a>
            </Row>
          )}
          {inquiry.whatsapp && (
            <Row label="واتس‌اپ">
              <ContactValue value={inquiry.whatsapp} href={whatsappLink(inquiry.whatsapp)} />
            </Row>
          )}
          {inquiry.telegram && (
            <Row label="تلگرام">
              <ContactValue value={inquiry.telegram} href={telegramLink(inquiry.telegram)} />
            </Row>
          )}
          {inquiry.email && (
            <Row label="ایمیل">
              <a className="text-accent hover:underline" dir="ltr" href={`mailto:${inquiry.email}`}>
                {inquiry.email}
              </a>
            </Row>
          )}
        </dl>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-bold">درخواست</h2>
        <dl className="space-y-2">
          {inquiry.service_label ? (
            <>
              <Row label="خدمت">
                {inquiry.service_label}
                {inquiry.quantity ? ` × ${formatNumber(inquiry.quantity)} محصول` : ""}
              </Row>
              {addons.length > 0 && <Row label="افزونه‌ها">{addons.map((a) => a.label).join("، ")}</Row>}
              {multipliers.length > 0 && (
                <Row label="گزینه‌ها">{multipliers.map((m) => m.label).join("، ")}</Row>
              )}
              {range && <Row label="برآوردی که بازدیدکننده دید">{range}</Row>}
            </>
          ) : (
            <p className="text-muted">ماشین‌حساب استفاده نشده؛ فقط پیام فرستاده شده است.</p>
          )}
        </dl>
        {inquiry.message && (
          <div>
            <h3 className="mb-1 font-semibold">پیام</h3>
            <p className="whitespace-pre-wrap" dir="auto">
              {inquiry.message}
            </p>
          </div>
        )}
      </Card>

      {inquiry.attachments.length > 0 && (
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">پیوست‌ها</h2>
          <ul aria-label="پیوست‌ها" className="flex flex-col gap-1">
            {inquiry.attachments.map((file) => (
              <li key={file.id}>
                <a
                  className="inline-flex min-h-11 items-center gap-2 text-accent hover:underline"
                  href={`/api/admin/inquiries/${inquiry.id}/attachments/${file.id}/`}
                >
                  <span dir="auto">{file.original_name}</span>
                  <span className="text-sm text-muted">({formatBytes(file.size)})</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">فایل‌ها فقط دانلود می‌شوند و در مرورگر باز نمی‌شوند.</p>
        </Card>
      )}

      <Card>
        <form onSubmit={submit} className="space-y-4">
          <h2 className="text-lg font-bold">پیگیری</h2>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <div className="flex max-w-sm flex-col gap-1">
            <label htmlFor="inquiry-status" className="text-sm text-muted">
              وضعیت
            </label>
            <select
              id="inquiry-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as InquiryStatus)}
              className="min-h-11 rounded-brand border border-line bg-elevated px-3 text-text"
            >
              {STATUS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <TextArea
            label="یادداشت داخلی"
            dir="auto"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            hint="فقط خودتان می‌بینید؛ به مشتری نمی‌رسد."
          />
          <Button type="submit" disabled={save.isPending || !changed}>
            {save.isPending ? "در حال ذخیره…" : "ذخیره"}
          </Button>
        </form>
      </Card>

      {inquiry.history.length > 0 && (
        <Card className="space-y-2">
          <h2 className="text-lg font-bold">تاریخچه‌ی وضعیت</h2>
          <ol aria-label="تاریخچه‌ی وضعیت" className="space-y-1 text-sm">
            {inquiry.history.map((change, index) => (
              <li key={`${change.at}-${index}`}>
                <span className="text-muted">{formatDate(change.at)}:</span>{" "}
                {STATUS_LABELS[change.from_status]} ← {STATUS_LABELS[change.to_status]}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div>
        <Button variant="danger" onClick={destroy} disabled={remove.isPending}>
          حذف استعلام
        </Button>
      </div>
    </>
  );
}
