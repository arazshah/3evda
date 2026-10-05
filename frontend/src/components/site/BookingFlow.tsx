"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InputField, TextareaField } from "@/components/ui/Field";
import type { Locale } from "@/i18n/config";
import { formatDay } from "@/lib/calendar/format";
import type { BookingLabels } from "@/lib/site/booking-labels";
import type { BookingOptions } from "@/lib/site/booking-api";

type Days = Record<string, string[]>;
/** The server's answer. A trapped bot is told "pending" and nothing else, so every detail may be missing. */
type Done = { link?: string; date?: string; time?: string; session_label?: string };
const FIELDS = ["name", "brand", "phone", "whatsapp", "telegram", "email", "notes"] as const;
type Field = (typeof FIELDS)[number];
type Errors = Partial<Record<Field | "time" | "form", string>>;

/** `10:00` written with the reader's digits. */
export function timeText(hhmm: string, locale: Locale): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const nf = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  return `${nf.format(h)}:${nf.format(m)}`;
}

export function BookingFlow({
  options,
  locale,
  labels,
  initialType,
  packageId,
}: {
  options: BookingOptions;
  locale: Locale;
  labels: BookingLabels;
  initialType?: string;
  /** A package the visitor came from (stored with the booking). */
  packageId?: number;
}) {
  const types = options.session_types;
  const [type, setType] = useState(types.find((t) => t.key === initialType)?.key ?? types[0]?.key ?? "");
  const [range, setRange] = useState<[string, string] | null>(null);
  const [result, setResult] = useState<{ key: string; days: Days } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [text, setText] = useState<Record<Field, string>>({
    name: "",
    brand: "",
    phone: "",
    whatsapp: "",
    telegram: "",
    email: "",
    notes: "",
  });
  const [trap, setTrap] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"idle" | "sending" | "done">("idle");
  const [done, setDone] = useState<Done | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const thanksRef = useRef<HTMLDivElement>(null);

  // The free days of the month on screen. The result carries the request it answers, so a reply that arrives
  // after the visitor has moved on is simply not shown, and "loading" is just "no answer for this request yet".
  const requestKey = range ? `${type}|${range[0]}|${range[1]}|${refresh}` : "";
  const days = result && result.key === requestKey ? result.days : null;

  useEffect(() => {
    if (!range || !type) return;
    const key = `${type}|${range[0]}|${range[1]}|${refresh}`;
    let current = true;
    fetch(`/api/public/booking/availability?type=${encodeURIComponent(type)}&from=${range[0]}&to=${range[1]}`)
      .then((res) =>
        res.ok ? (res.json() as Promise<{ days: { date: string; times: string[] }[] }>) : { days: [] },
      )
      .catch(() => ({ days: [] }))
      .then((body) => {
        if (current) setResult({ key, days: Object.fromEntries(body.days.map((d) => [d.date, d.times])) });
      });
    return () => {
      current = false;
    };
  }, [range, type, refresh]);

  useEffect(() => {
    if (attempt > 0) summaryRef.current?.focus();
  }, [attempt]);
  useEffect(() => {
    if (phase === "done") thanksRef.current?.focus();
  }, [phase]);

  const onMonth = useCallback((first: string, last: string) => {
    setRange([first, last]);
    // The day on screen belongs to the month it was picked in.
    setDay((d) => (d && d >= first && d <= last ? d : null));
    setTime((t) => t);
  }, []);

  const times = day && days ? (days[day] ?? []) : [];
  const monthHasDays = days ? Object.keys(days).length > 0 : true;

  const choose = (iso: string) => {
    setDay(iso);
    setTime(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found: Errors = {};
    if (!day || !time) found.time = labels.errorNeedTime;
    if (!text.name.trim()) found.name = labels.errorRequired;
    // Each contact field is trimmed on its own: a blank phone must not hide a real email.
    if (![text.phone, text.whatsapp, text.telegram, text.email].some((v) => v.trim()))
      found.phone = labels.errorContact;
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setAttempt((n) => n + 1);
      return;
    }
    setErrors({});
    setPhase("sending");
    try {
      const res = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          date: day,
          time,
          language: locale,
          website: trap,
          ...Object.fromEntries(FIELDS.map((f) => [f, text[f].trim()])),
          ...(packageId ? { package: packageId } : {}),
        }),
      });
      if (res.status === 201) {
        const body = (await res.json()) as Done & { status: string };
        setDone({ link: body.link, date: body.date, time: body.time, session_label: body.session_label });
        setPhase("done");
        return;
      }
      const failure: Errors = {};
      const data = (await res.json().catch(() => null)) as {
        code?: string;
        detail?: string;
        fields?: Record<string, string[]>;
      } | null;
      if (res.status === 429) failure.form = labels.errorRate;
      else if (res.status === 409) {
        // Someone took it first: say so, and show what is free now.
        failure.time = data?.detail ?? labels.errorGeneric;
        setTime(null);
        setRefresh((n) => n + 1);
      } else if (res.status === 400) {
        for (const [name, messages] of Object.entries(data?.fields ?? {})) {
          failure[name === "non_field_errors" ? "form" : (name as keyof Errors)] = messages[0];
        }
        if (Object.keys(failure).length === 0) failure.form = data?.detail ?? labels.errorGeneric;
      } else failure.form = labels.errorGeneric;
      setErrors(failure);
      setAttempt((n) => n + 1);
    } catch {
      setErrors({ form: labels.errorGeneric });
      setAttempt((n) => n + 1);
    }
    setPhase("idle");
  };

  if (phase === "done" && done) {
    const path = done.link ? new URL(done.link, "http://x").pathname : null;
    const when =
      done.date && done.time
        ? `${formatDay(done.date, locale, "full")} · ${timeText(done.time, locale)}`
        : "";
    return (
      <Card className="max-w-2xl space-y-4">
        <div ref={thanksRef} tabIndex={-1} role="status" className="space-y-3 outline-none">
          <h2 className="font-display text-3xl">{labels.thanksTitle}</h2>
          {when && (
            <p>
              {done.session_label ? `${done.session_label} · ` : ""}
              {when}
            </p>
          )}
          <p className="text-muted">{labels.thanksBody}</p>
        </div>
        {path && <ButtonLink href={path}>{labels.statusLink}</ButtonLink>}
      </Card>
    );
  }

  const bind = (field: Field) => ({
    value: text[field],
    onChange: (e: { target: { value: string } }) => setText({ ...text, [field]: e.target.value }),
    error: errors[field],
  });
  const summary = Object.entries(errors).filter(([, message]) => message);
  const dayList = days ?? {};

  return (
    <form onSubmit={submit} noValidate className="grid max-w-3xl gap-8">
      {summary.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role={errors.form ? "alert" : undefined}
          className="rounded-brand border border-accent-2 p-4 outline-none"
        >
          <p className="font-semibold">{errors.form ?? labels.errorsTitle}</p>
          {!errors.form && (
            <ul className="mt-1 list-disc ps-5 text-sm">
              {summary.map(([field, message]) => (
                <li key={field}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {types.length > 1 && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">{labels.sessionType}</legend>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <label
                key={t.key}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-brand border px-4 ${type === t.key ? "border-accent bg-elevated" : "border-line"}`}
              >
                <input
                  type="radio"
                  name="session-type"
                  value={t.key}
                  checked={type === t.key}
                  onChange={() => {
                    setType(t.key);
                    setDay(null);
                    setTime(null);
                  }}
                />
                <span>{locale === "en" ? t.title_en || t.title_fa : t.title_fa}</span>
                <span className="text-sm text-muted">
                  {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(t.duration_minutes)}{" "}
                  {labels.minutes}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Card className="grid gap-5">
        <h2 className="font-display text-3xl">{labels.pickDay}</h2>
        <MonthCalendar
          locale={locale}
          value={day}
          onSelect={choose}
          onMonthChange={onMonth}
          isDisabled={(iso) => !dayList[iso]}
          labels={{ previous: labels.previousMonth, next: labels.nextMonth, grid: labels.calendar }}
        />
        <p aria-live="polite" className="text-sm text-muted">
          {days === null ? labels.loading : !monthHasDays ? labels.noDays : ""}
        </p>
        {day && (
          <div role="group" aria-labelledby="times-title" className="grid gap-2">
            <h3 id="times-title" className="font-semibold">
              {labels.times} — {formatDay(day, locale, "full")}
            </h3>
            {times.length === 0 ? (
              <p className="text-muted">{labels.noTimes}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {times.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={time === t}
                    onClick={() => setTime(t)}
                    className={`min-h-11 min-w-20 rounded-brand border px-4 font-semibold ${time === t ? "border-accent bg-accent text-bg" : "border-line hover:border-accent"}`}
                  >
                    {timeText(t, locale)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {errors.time && (
          <p role="alert" className="text-sm text-accent-2">
            {errors.time}
          </p>
        )}
        {day && time && (
          <p className="font-semibold">
            {labels.chosen}: {formatDay(day, locale, "full")} · {timeText(time, locale)}
          </p>
        )}
      </Card>

      <Card className="grid gap-5">
        <h2 className="font-display text-3xl">{labels.details}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField label={labels.name} autoComplete="name" required {...bind("name")} />
          <InputField label={labels.brand} {...bind("brand")} />
          <InputField label={labels.phone} type="tel" dir="ltr" autoComplete="tel" {...bind("phone")} />
          <InputField label={labels.whatsapp} dir="ltr" {...bind("whatsapp")} />
          <InputField label={labels.telegram} dir="ltr" {...bind("telegram")} />
          <InputField label={labels.email} type="email" dir="ltr" autoComplete="email" {...bind("email")} />
        </div>
        <TextareaField label={labels.notes} hint={labels.notesHint} maxLength={2000} {...bind("notes")} />
        {/* A field no person sees: bots that fill every input give themselves away. */}
        <div aria-hidden="true" className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
          </label>
        </div>
      </Card>

      <div>
        <Button type="submit" disabled={phase === "sending"}>
          {phase === "sending" ? labels.sending : labels.submit}
        </Button>
      </div>
    </form>
  );
}
