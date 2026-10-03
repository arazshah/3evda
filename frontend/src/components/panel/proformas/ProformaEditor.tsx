"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import {
  useCreateProforma,
  useDeleteProforma,
  useProforma,
  useProformaAction,
  useSaveProforma,
  type Proforma,
  type ProformaAction,
} from "@/lib/api/queries";
import { formatDate, formatNumber } from "@/lib/format";
import { Alert, Button, Card, Field, TextArea } from "../ui";
import { isOpen, statusLabel } from "./status";

type Row = { description: string; quantity: string; unit_price: string };
type Discount = "none" | "amount" | "percent";

const EMPTY_ROW: Row = { description: "", quantity: "1", unit_price: "" };
const SELECT = "min-h-11 rounded-brand border border-line bg-elevated px-3 text-text";

export function ProformaEditorPage({ id }: { id: number | null }) {
  const proforma = useProforma(id);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/panel/proformas" className="inline-flex min-h-11 items-center text-accent hover:underline">
        ← همه‌ی پیش‌فاکتورها
      </Link>
      {id === null && <DraftForm key="new" initial={null} />}
      {id !== null && proforma.isError && <Alert>{errorMessage(proforma.error)}</Alert>}
      {id !== null && proforma.isPending && <p className="text-muted">در حال بارگذاری…</p>}
      {proforma.data &&
        (proforma.data.status === "draft" ? (
          <DraftForm key={proforma.data.id} initial={proforma.data} />
        ) : (
          <IssuedView key={proforma.data.id} proforma={proforma.data} />
        ))}
    </div>
  );
}

const rowsOf = (p: Proforma | null): Row[] =>
  p?.items?.length
    ? p.items.map((i) => ({
        description: i.description,
        quantity: String(i.quantity),
        unit_price: String(i.unit_price),
      }))
    : [{ ...EMPTY_ROW }];

function DraftForm({ initial }: { initial: Proforma | null }) {
  const router = useRouter();
  const create = useCreateProforma();
  const save = useSaveProforma();
  const action = useProformaAction();
  const remove = useDeleteProforma();
  const [name, setName] = useState(initial?.customer_name ?? "");
  const [company, setCompany] = useState(initial?.customer_company ?? "");
  const [contact, setContact] = useState(initial?.customer_contact ?? "");
  const [language, setLanguage] = useState<"fa" | "en">(initial?.language ?? "fa");
  const [validUntil, setValidUntil] = useState(initial?.valid_until ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? "");
  const [tax, setTax] = useState(String(Number(initial?.tax_percent ?? 0)));
  const [discountKind, setDiscountKind] = useState<Discount>(
    initial?.discount_amount ? "amount" : Number(initial?.discount_percent ?? 0) ? "percent" : "none",
  );
  const [discountValue, setDiscountValue] = useState(
    initial?.discount_amount
      ? String(initial.discount_amount)
      : String(Number(initial?.discount_percent ?? 0) || ""),
  );
  const [rows, setRows] = useState<Row[]>(rowsOf(initial));
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const body = () => ({
    customer_name: name.trim(),
    customer_company: company.trim(),
    customer_contact: contact.trim(),
    language,
    valid_until: validUntil || null,
    terms,
    tax_percent: tax || "0",
    discount_amount: discountKind === "amount" ? Number(discountValue || 0) : 0,
    discount_percent: discountKind === "percent" ? discountValue || "0" : "0",
    items: rows
      .filter((r) => r.description.trim() || r.unit_price)
      .map((r) => ({
        description: r.description.trim(),
        quantity: Number(r.quantity || 0),
        unit_price: Number(r.unit_price || 0),
      })),
  });

  const run = async (work: () => Promise<unknown>, done?: string) => {
    setMessage(null);
    try {
      await work();
      if (done) setMessage({ tone: "success", text: done });
      return true;
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
      return false;
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (initial) {
      await run(() => save.mutateAsync({ id: initial.id, ...body() } as never), "ذخیره شد.");
    } else {
      const made = await create.mutateAsync(body() as never).catch((err) => {
        setMessage({ tone: "error", text: errorMessage(err) });
        return null;
      });
      if (made) router.push(`/panel/proformas/${made.id}`);
    }
  };

  const issue = async () => {
    if (!initial) return;
    if (!window.confirm("پیش‌فاکتور صادر شود؟ بعد از صدور شماره می‌گیرد و دیگر قابل ویرایش نیست.")) return;
    // What is on the screen is what gets issued: save first, then issue.
    const saved = await run(() => save.mutateAsync({ id: initial.id, ...body() } as never));
    if (saved) await run(() => action.mutateAsync({ id: initial.id, action: "issue" }), "صادر شد.");
  };

  const destroy = async () => {
    if (!initial || !window.confirm("این پیش‌نویس حذف شود؟")) return;
    if (await run(() => remove.mutateAsync(initial.id))) router.push("/panel/proformas");
  };

  const busy = create.isPending || save.isPending || action.isPending || remove.isPending;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{initial ? "پیش‌نویس پیش‌فاکتور" : "پیش‌فاکتور جدید"}</h1>
        {initial?.replaces_number && (
          <p className="text-sm text-muted">
            نسخه‌ی اصلاح‌شده‌ی <span dir="ltr">{initial.replaces_number}</span> — با صدور این، نسخه‌ی قبلی
            «جایگزین‌شده» می‌شود.
          </p>
        )}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label="نام مشتری" required dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="برند یا شرکت" dir="auto" value={company} onChange={(e) => setCompany(e.target.value)} />
        <Field label="راه تماس" dir="auto" value={contact} onChange={(e) => setContact(e.target.value)} />
        <div className="flex flex-col gap-1">
          <label htmlFor="pf-language" className="text-sm text-muted">
            زبان پیش‌فاکتور
          </label>
          <select
            id="pf-language"
            className={SELECT}
            value={language}
            onChange={(e) => setLanguage(e.target.value as "fa" | "en")}
          >
            <option value="fa">فارسی</option>
            <option value="en">انگلیسی</option>
          </select>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-bold">آیتم‌ها</h2>
        <ul aria-label="آیتم‌ها" className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <li key={i} className="grid gap-2 sm:grid-cols-[1fr_6rem_9rem_auto] sm:items-end">
              <Field
                label={`شرح آیتم ${formatNumber(i + 1)}`}
                dir="auto"
                maxLength={200}
                value={row.description}
                onChange={(e) => setRow(i, { description: e.target.value })}
              />
              <Field
                label={`تعداد آیتم ${formatNumber(i + 1)}`}
                type="number"
                min={1}
                dir="ltr"
                value={row.quantity}
                onChange={(e) => setRow(i, { quantity: e.target.value })}
              />
              <Field
                label={`قیمت واحد آیتم ${formatNumber(i + 1)} (تومان)`}
                type="number"
                min={0}
                dir="ltr"
                value={row.unit_price}
                onChange={(e) => setRow(i, { unit_price: e.target.value })}
              />
              <Button
                variant="ghost"
                aria-label={`حذف آیتم ${formatNumber(i + 1)}`}
                disabled={rows.length === 1}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                حذف
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          disabled={rows.length >= 50}
          onClick={() => setRows([...rows, { ...EMPTY_ROW }])}
        >
          افزودن آیتم
        </Button>
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="pf-discount-kind" className="text-sm text-muted">
            نوع تخفیف
          </label>
          <select
            id="pf-discount-kind"
            className={SELECT}
            value={discountKind}
            onChange={(e) => {
              setDiscountKind(e.target.value as Discount);
              setDiscountValue("");
            }}
          >
            <option value="none">بدون تخفیف</option>
            <option value="amount">مبلغ ثابت</option>
            <option value="percent">درصد</option>
          </select>
        </div>
        {discountKind !== "none" && (
          <Field
            label={discountKind === "amount" ? "مبلغ تخفیف (تومان)" : "درصد تخفیف"}
            type="number"
            min={0}
            max={discountKind === "percent" ? 100 : undefined}
            step={discountKind === "percent" ? "0.01" : "1"}
            dir="ltr"
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
          />
        )}
        <Field
          label="درصد مالیات"
          type="number"
          min={0}
          max={100}
          step="0.01"
          dir="ltr"
          value={tax}
          onChange={(e) => setTax(e.target.value)}
        />
        <Field
          label="اعتبار تا"
          type="date"
          dir="ltr"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
        />
        <div className="sm:col-span-2">
          <TextArea
            label="شرایط"
            dir="auto"
            rows={5}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
        </div>
      </Card>

      {initial && <Totals proforma={initial} note="جمع‌ها بعد از هر بار ذخیره محاسبه می‌شود." />}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "در حال انجام…" : initial ? "ذخیره" : "ساخت پیش‌نویس"}
        </Button>
        {initial && (
          <>
            <Button variant="ghost" onClick={issue} disabled={busy}>
              صدور
            </Button>
            <a
              className="inline-flex min-h-11 items-center rounded-brand border border-line px-5 hover:border-accent"
              href={`/api/admin/proformas/${initial.id}/pdf/`}
            >
              پیش‌نمایش PDF (آخرین ذخیره)
            </a>
            <Button variant="danger" onClick={destroy} disabled={busy}>
              حذف پیش‌نویس
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

function Totals({ proforma, note }: { proforma: Proforma; note?: string }) {
  return (
    <Card className="space-y-1">
      <h2 className="text-lg font-bold">جمع‌ها</h2>
      <dl className="grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1">
        <dt className="text-muted">جمع آیتم‌ها</dt>
        <dd>{`${formatNumber(proforma.subtotal)} تومان`}</dd>
        {proforma.discount > 0 && (
          <>
            <dt className="text-muted">تخفیف</dt>
            <dd>{`− ${formatNumber(proforma.discount)} تومان`}</dd>
          </>
        )}
        {proforma.tax > 0 && (
          <>
            <dt className="text-muted">مالیات</dt>
            <dd>{`${formatNumber(proforma.tax)} تومان`}</dd>
          </>
        )}
        <dt className="font-bold">مبلغ قابل پرداخت</dt>
        <dd className="font-bold">{`${formatNumber(proforma.total)} تومان`}</dd>
      </dl>
      {note && <p className="text-xs text-muted">{note}</p>}
    </Card>
  );
}

function IssuedView({ proforma }: { proforma: Proforma }) {
  const router = useRouter();
  const action = useProformaAction();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const act = async (kind: ProformaAction, confirm?: string, done?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setMessage(null);
    try {
      const result = await action.mutateAsync({ id: proforma.id, action: kind });
      if (kind === "revise") router.push(`/panel/proformas/${result.id}`);
      else if (done) setMessage({ tone: "success", text: done });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(proforma.link ?? "");
      setCopied(true);
    } catch {
      setMessage({ tone: "error", text: "کپی خودکار ممکن نشد؛ لینک را از کادر بالا انتخاب و کپی کنید." });
    }
  };

  const open = isOpen(proforma.status);
  const revisable = open || proforma.status === "rejected" || proforma.status === "expired";

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold" dir="auto">
          پیش‌فاکتور <span dir="ltr">{proforma.number}</span>
        </h1>
        <p className="text-sm text-muted">
          {statusLabel(proforma.status)} · {proforma.customer_name}
          {proforma.customer_company ? ` · ${proforma.customer_company}` : ""}
        </p>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card className="space-y-3">
        <h2 className="text-lg font-bold">لینک برای مشتری</h2>
        <div className="flex flex-wrap gap-2">
          <input
            readOnly
            aria-label="لینک عمومی"
            dir="ltr"
            value={proforma.link ?? ""}
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-11 min-w-0 flex-1 rounded-brand border border-line bg-elevated px-3 text-text"
          />
          <Button variant="ghost" onClick={copy}>
            {copied ? "کپی شد" : "کپی لینک"}
          </Button>
        </div>
        <p className="text-sm text-muted">
          هر کس این لینک را داشته باشد می‌تواند پیش‌فاکتور را ببیند و پاسخ دهد. اگر لینک به جای نادرست رفته،
          «لینک تازه» بسازید؛ لینک قبلی همان لحظه از کار می‌افتد.
        </p>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-lg font-bold">وضعیت</h2>
        <dl className="space-y-1 text-sm">
          {proforma.issued_at && <Row label="صدور">{formatDate(proforma.issued_at)}</Row>}
          {proforma.valid_until && <Row label="اعتبار تا">{formatDate(proforma.valid_until)}</Row>}
          {proforma.seen_at && <Row label="اولین بازدید مشتری">{formatDate(proforma.seen_at)}</Row>}
          {proforma.responded_at && <Row label="پاسخ مشتری">{formatDate(proforma.responded_at)}</Row>}
          {proforma.rejection_reason && <Row label="دلیل رد">{proforma.rejection_reason}</Row>}
          {proforma.replaces_number && <Row label="جایگزین">{proforma.replaces_number}</Row>}
          {proforma.inquiry && (
            <Row label="استعلام">
              <Link className="text-accent hover:underline" href={`/panel/inquiries/${proforma.inquiry}`}>
                مشاهده
              </Link>
            </Row>
          )}
        </dl>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-lg font-bold">آیتم‌ها</h2>
        <ul aria-label="آیتم‌ها" className="space-y-1">
          {(proforma.items ?? []).map((item, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2" dir="auto">
              <span>
                {item.description} × {formatNumber(item.quantity)}
              </span>
              <span>{`${formatNumber(item.line_total)} تومان`}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Totals proforma={proforma} />

      <div className="flex flex-wrap gap-3">
        <a
          className="inline-flex min-h-11 items-center rounded-brand border border-line px-5 hover:border-accent"
          href={`/api/admin/proformas/${proforma.id}/pdf/`}
        >
          دانلود PDF
        </a>
        <Button
          variant="ghost"
          disabled={action.isPending}
          onClick={() => act("new-link", "لینک فعلی باطل و لینک تازه ساخته شود؟", "لینک تازه ساخته شد.")}
        >
          لینک تازه
        </Button>
        {revisable && (
          <Button variant="ghost" disabled={action.isPending} onClick={() => act("revise")}>
            ساخت نسخه‌ی اصلاحی
          </Button>
        )}
        {open && (
          <Button
            variant="danger"
            disabled={action.isPending}
            onClick={() =>
              act("cancel", "این پیش‌فاکتور لغو شود؟ لینکش دیگر قابل تأیید نخواهد بود.", "لغو شد.")
            }
          >
            لغو پیش‌فاکتور
          </Button>
        )}
      </div>
    </>
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
