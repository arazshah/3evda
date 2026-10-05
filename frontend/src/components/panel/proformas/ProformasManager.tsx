"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api/client";
import { useProformas } from "@/lib/api/queries";
import { formatDate, formatNumber } from "@/lib/format";
import { Alert } from "../ui";
import { STATUS_ORDER, statusLabel } from "./status";

const PAGE_SIZE = 20;
const CONTROL =
  "min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text outline-none focus:border-text";

export function ProformasManager() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const proformas = useProformas({
    status: status || undefined,
    q: q || undefined,
    page: page > 1 ? page : undefined,
  });
  const list = proformas.data?.results ?? [];
  const total = proformas.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight">پیش‌فاکتورها</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/panel/proformas/settings"
            className="inline-flex min-h-11 items-center rounded-brand border border-line px-5 hover:border-accent"
          >
            اطلاعات صدور
          </Link>
          <Link
            href="/panel/proformas/new"
            className="inline-flex min-h-11 items-center rounded-brand bg-accent px-5 font-semibold text-bg hover:opacity-90"
          >
            پیش‌فاکتور جدید
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm text-muted">
          جست‌وجو
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="شماره، نام یا برند مشتری"
            className={CONTROL}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          وضعیت
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className={CONTROL}
          >
            <option value="">همه</option>
            {STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {proformas.isError && <Alert>{errorMessage(proformas.error)}</Alert>}
      {!proformas.isError && proformas.isSuccess && list.length === 0 && (
        <p className="text-muted">پیش‌فاکتوری پیدا نشد.</p>
      )}

      {list.length > 0 && (
        <ul aria-label="پیش‌فاکتورها" className="flex flex-col gap-2">
          {list.map((item) => (
            <li key={item.id}>
              <Link
                href={`/panel/proformas/${item.id}`}
                className="flex flex-wrap items-center gap-3 rounded-brand border border-line bg-surface p-3 hover:border-accent"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold" dir="auto">
                    {item.customer_name}
                    {item.customer_company ? ` · ${item.customer_company}` : ""}
                  </p>
                  <p className="text-sm text-muted">
                    <span dir="ltr">{item.number ?? "—"}</span> · {formatDate(item.created_at)}
                  </p>
                </div>
                <span className="font-semibold">{`${formatNumber(item.total)} تومان`}</span>
                <span className="text-xs text-muted">{statusLabel(item.status)}</span>
              </Link>
            </li>
          ))}
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
            {`صفحه ${formatNumber(page)} از ${formatNumber(pages)} (${formatNumber(total)} پیش‌فاکتور)`}
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
