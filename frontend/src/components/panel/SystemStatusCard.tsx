"use client";

import { formatDate, toFaDigits } from "@/lib/format";
import { useSystemStatus, type StatusCheck } from "@/lib/api/system-queries";
import { Card } from "./ui";

type Level = StatusCheck["level"] | "ok" | "warning" | "error";

const WORDS: Record<Level, string> = { ok: "سالم", warning: "هشدار", error: "خطا", unknown: "نامشخص" };
const FRAME: Record<Level, string> = {
  ok: "border-line",
  warning: "border-accent",
  error: "border-accent-2",
  unknown: "border-line",
};
const DOT: Record<Level, string> = {
  ok: "bg-success",
  warning: "bg-accent",
  error: "bg-accent-2",
  unknown: "bg-muted",
};

/** The level is always written out as a word; the colour only repeats it. */
function Badge({ level }: { level: Level }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${FRAME[level]}`}>
      <span aria-hidden="true" className={`size-2.5 rounded-full ${DOT[level]}`} />
      {WORDS[level]}
    </span>
  );
}

const SUMMARY: Record<"ok" | "warning" | "error", string> = {
  ok: "همه‌چیز عادی است.",
  warning: "چیزی نیاز به توجه دارد.",
  error: "مشکلی هست که باید بررسی شود.",
};

export function SystemStatusCard() {
  const { data, isPending, isError, refetch, isFetching } = useSystemStatus();

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl">وضعیت سیستم</h2>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="min-h-11 rounded-full border border-text/50 px-5 text-sm hover:border-text disabled:opacity-50"
        >
          {isFetching ? "در حال بررسی…" : "بررسی دوباره"}
        </button>
      </div>

      {isPending && <p className="mt-3 text-muted">در حال بررسی…</p>}
      {isError && (
        <p className="mt-3 text-accent-2" role="status">
          وضعیت سیستم خوانده نشد. اگر این پیام می‌ماند، خود سایت یا سرویس‌ها مشکل دارند.
        </p>
      )}

      {data && (
        <>
          <p className="mt-3 flex flex-wrap items-center gap-3" data-testid="status-summary">
            <Badge level={data.level} />
            <span>{SUMMARY[data.level]}</span>
          </p>
          <ul className="mt-4 divide-y divide-line">
            {data.checks.map((check) => (
              <li key={check.key} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{check.label}</p>
                  <p className="text-sm text-muted">{toFaDigits(check.detail)}</p>
                </div>
                <Badge level={check.level} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            آخرین بررسی: {formatDate(data.checked_at)} · نسخه‌ی سایت: {data.version.slice(0, 7)}
          </p>
        </>
      )}
    </Card>
  );
}
