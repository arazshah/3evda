"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { PublicProforma } from "@/lib/site/proforma-api";
import type { ProformaLabels } from "@/lib/site/proforma-labels";
import { formatDate, formatToman } from "@/lib/site/text";

type Issuer = { name?: string; phone?: string; address?: string; footer?: string };

const BANNERS = {
  approved: ["approvedTitle", "approvedBody", "success"],
  rejected: ["rejectedTitle", "rejectedBody", "neutral"],
  expired: ["expiredTitle", "expiredBody", "neutral"],
  superseded: ["supersededTitle", "supersededBody", "neutral"],
  cancelled: ["cancelledTitle", "cancelledBody", "neutral"],
} as const;

export function ProformaView({
  initial,
  token,
  locale,
  labels,
}: {
  initial: PublicProforma;
  token: string;
  locale: Locale;
  labels: ProformaLabels;
}) {
  const [data, setData] = useState(initial);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = `/api/public/proformas/${encodeURIComponent(token)}`;

  // "Seen" is reported by the page once it is open in a browser; merely fetching the link changes nothing.
  useEffect(() => {
    if (initial.status !== "sent") return;
    fetch(`${base}/seen`, { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      // A slow reply must never overwrite an answer the customer has already given.
      .then((next: PublicProforma | null) => next && setData((now) => (now.status === "sent" ? next : now)))
      .catch(() => undefined);
  }, [base, initial.status]);

  const answer = async (kind: "approve" | "reject") => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${base}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "reject" ? { reason: reason.trim() } : {}),
      });
      if (res.ok) {
        setData((await res.json()) as PublicProforma);
        setRejecting(false);
      } else if (res.status === 429) {
        setError(labels.errorRate);
      } else {
        // 409: someone answered meanwhile, or it expired/was replaced. Show the real state instead of guessing.
        const fresh = await fetch(base);
        if (fresh.ok) setData((await fresh.json()) as PublicProforma);
        else setError(labels.errorGeneric);
      }
    } catch {
      setError(labels.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  const money = (n: number) => `${formatToman(n, locale)} ${labels.toman}`;
  const issuer = (data.issuer ?? {}) as Issuer;
  const open = data.status === "sent" || data.status === "viewed";
  const banner = BANNERS[data.status as keyof typeof BANNERS];
  const percent = (value: string) => `${formatToman(Number(value), locale)}٪`;

  return (
    <article aria-labelledby="proforma-title" className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 id="proforma-title" className="text-3xl font-bold">
            {labels.title}
          </h1>
          <p className="text-muted">
            {labels.number}: <span dir="ltr">{data.number}</span>
          </p>
        </div>
        <div className="text-sm text-muted">
          {issuer.name && <p className="font-semibold text-text">{issuer.name}</p>}
          {issuer.phone && <p dir="ltr">{issuer.phone}</p>}
          {issuer.address && <p>{issuer.address}</p>}
        </div>
      </header>

      {banner && (
        <section
          role="status"
          className={`rounded-brand border p-4 ${banner[2] === "success" ? "border-success" : "border-line"}`}
        >
          <h2 className="font-bold">{labels[banner[0]]}</h2>
          <p className="text-muted">{labels[banner[1]]}</p>
          {data.status === "rejected" && data.rejection_reason && (
            <p className="mt-2 text-sm">
              {labels.reasonShown}: <span dir="auto">{data.rejection_reason}</span>
            </p>
          )}
        </section>
      )}

      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">{labels.customer}</dt>
          <dd className="font-semibold" dir="auto">
            {data.customer_name}
            {data.customer_company ? ` · ${data.customer_company}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{labels.issued}</dt>
          <dd>{formatDate(data.issue_date, locale)}</dd>
        </div>
        {data.valid_until && (
          <div>
            <dt className="text-sm text-muted">{labels.validUntil}</dt>
            <dd>{formatDate(data.valid_until, locale)}</dd>
          </div>
        )}
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-start">
          <thead>
            <tr className="border-b border-line text-sm text-muted">
              <th scope="col" className="py-2 text-start font-medium">
                {labels.description}
              </th>
              <th scope="col" className="py-2 text-end font-medium">
                {labels.quantity}
              </th>
              <th scope="col" className="py-2 text-end font-medium">
                {labels.unitPrice}
              </th>
              <th scope="col" className="py-2 text-end font-medium">
                {labels.amount}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, i) => (
              <tr key={i} className="border-b border-line align-top">
                <td className="py-2 pe-3" dir="auto">
                  {item.description}
                </td>
                <td className="py-2 text-end">{formatToman(item.quantity, locale)}</td>
                <td className="py-2 text-end whitespace-nowrap">{formatToman(item.unit_price, locale)}</td>
                <td className="py-2 text-end whitespace-nowrap">{formatToman(item.line_total, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="ms-auto grid w-full max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1">
        <dt className="text-muted">{labels.subtotal}</dt>
        <dd>{money(data.subtotal)}</dd>
        {data.discount > 0 && (
          <>
            <dt className="text-muted">{labels.discount}</dt>
            <dd>{`− ${money(data.discount)}`}</dd>
          </>
        )}
        {data.tax > 0 && (
          <>
            <dt className="text-muted">{`${labels.tax} (${percent(data.tax_percent)})`}</dt>
            <dd>{money(data.tax)}</dd>
          </>
        )}
        <dt className="border-t border-line pt-2 text-lg font-bold">{labels.total}</dt>
        <dd className="border-t border-line pt-2 text-lg font-bold">{money(data.total)}</dd>
      </dl>

      {data.terms && (
        <section>
          <h2 className="mb-1 font-bold">{labels.terms}</h2>
          <p className="whitespace-pre-line text-muted" dir="auto">
            {data.terms}
          </p>
        </section>
      )}

      {open && (
        <section aria-labelledby="decision-title" className="rounded-brand border border-line bg-surface p-4">
          <h2 id="decision-title" className="font-bold">
            {labels.decision}
          </h2>
          <p className="mb-3 text-sm text-muted">{labels.decisionHint}</p>
          {error && (
            <p role="alert" className="mb-3 rounded-brand border border-accent-2 px-3 py-2 text-sm">
              {error}
            </p>
          )}
          {!rejecting ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => answer("approve")}
                className="min-h-11 rounded-brand bg-accent px-6 font-semibold text-bg hover:opacity-90 disabled:opacity-50"
              >
                {busy ? labels.working : labels.approve}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejecting(true)}
                className="min-h-11 rounded-brand border border-line px-6 hover:border-accent disabled:opacity-50"
              >
                {labels.reject}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <label htmlFor="reject-reason" className="text-sm text-muted">
                {labels.reasonLabel}
              </label>
              <textarea
                id="reject-reason"
                rows={3}
                maxLength={500}
                dir="auto"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-none border-0 border-b border-text/60 bg-transparent px-0 py-2 text-text outline-none focus:border-accent"
              />
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => answer("reject")}
                  className="min-h-11 rounded-brand bg-accent px-6 font-semibold text-bg hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? labels.working : labels.confirmReject}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRejecting(false)}
                  className="min-h-11 rounded-brand border border-line px-6 hover:border-accent"
                >
                  {labels.cancel}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <p>
        <a
          href={`${base}/pdf`}
          className="inline-flex min-h-11 items-center rounded-brand border border-line px-5 hover:border-accent"
        >
          {labels.downloadPdf}
        </a>
      </p>
      {issuer.footer && <p className="text-center text-sm text-muted">{issuer.footer}</p>}
    </article>
  );
}
