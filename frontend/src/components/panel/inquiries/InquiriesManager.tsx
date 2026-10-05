"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api/client";
import { useInquiries, type InquiryFilters, type InquiryStatus } from "@/lib/api/queries";
import { formatDate, formatNumber } from "@/lib/format";
import { Alert } from "../ui";
import { rangeText, STATUS_LABELS, STATUS_ORDER } from "./status";

const PAGE_SIZE = 20;
const CONTROL =
  "min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text outline-none focus:border-text";

export function InquiriesManager() {
  const [status, setStatus] = useState<InquiryStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  // The search runs a moment after typing stops, and any change of filter goes back to the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters: InquiryFilters = {
    status: status || undefined,
    q: q || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const inquiries = useInquiries({ ...filters, page: page > 1 ? page : undefined });
  const list = inquiries.data?.results ?? [];
  const total = inquiries.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // The export takes the same filters but not the page: it is everything that matches.
  const exportParams = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const exportHref = `/api/admin/inquiries/export/${exportParams.size ? `?${exportParams}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] leading-tight">استعلام‌ها</h1>
      <p className="text-sm text-muted">
        استعلام‌هایی که از فرم سایت می‌رسد. تا هر استعلام را باز نکرده‌اید، نشانگر «خوانده‌نشده» دارد.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm text-muted">
          جست‌وجو
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="نام، برند، تماس یا متن پیام"
            className={CONTROL}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          وضعیت
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as InquiryStatus | "");
              setPage(1);
            }}
            className={CONTROL}
          >
            <option value="">همه</option>
            {STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          از تاریخ
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className={CONTROL}
            dir="ltr"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          تا تاریخ
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className={CONTROL}
            dir="ltr"
          />
        </label>
        <a
          href={exportHref}
          className="inline-flex min-h-11 items-center rounded-brand border border-line px-5 hover:border-accent"
        >
          دانلود CSV
        </a>
      </div>

      {inquiries.isError && <Alert>{errorMessage(inquiries.error)}</Alert>}
      {!inquiries.isError && inquiries.isSuccess && list.length === 0 && (
        <p className="text-muted">استعلامی با این فیلترها پیدا نشد.</p>
      )}

      {list.length > 0 && (
        <ul aria-label="استعلام‌ها" className="flex flex-col gap-2">
          {list.map((item) => {
            const range = rangeText(item.estimate_low, item.estimate_high, formatNumber);
            const detail = [
              item.service_label &&
                `${item.service_label}${item.quantity ? ` × ${formatNumber(item.quantity)}` : ""}`,
              range,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={item.id}>
                <Link
                  href={`/panel/inquiries/${item.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-brand border border-line bg-surface p-3 hover:border-accent"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold" dir="auto">
                      {item.name}
                      {item.brand ? ` · ${item.brand}` : ""}
                    </p>
                    {detail && (
                      <p className="truncate text-sm text-muted" dir="auto">
                        {detail}
                      </p>
                    )}
                    <p className="text-xs text-muted">
                      {formatDate(item.created_at)}
                      {item.attachment_count > 0 && ` · ${formatNumber(item.attachment_count)} پیوست`}
                    </p>
                  </div>
                  {item.is_new && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-bg">
                      خوانده‌نشده
                    </span>
                  )}
                  <span className="text-xs text-muted">{STATUS_LABELS[item.status]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="صفحه‌بندی" className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="min-h-11 rounded-brand border border-line px-4 hover:border-accent disabled:opacity-50"
          >
            صفحه‌ی قبل
          </button>
          <span className="text-sm text-muted">
            {`صفحه ${formatNumber(page)} از ${formatNumber(pages)} (${formatNumber(total)} استعلام)`}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
            className="min-h-11 rounded-brand border border-line px-4 hover:border-accent disabled:opacity-50"
          >
            صفحه‌ی بعد
          </button>
        </nav>
      )}
    </div>
  );
}
