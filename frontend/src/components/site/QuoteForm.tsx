"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InputField, TextareaField } from "@/components/ui/Field";
import type { Locale } from "@/i18n/config";
import { formatToman } from "@/lib/site/text";
import type { QuoteOptions } from "@/lib/site/types";

export type QuoteLabels = Record<
  | "calculator"
  | "service"
  | "quantity"
  | "extras"
  | "options"
  | "estimateLabel"
  | "estimateRange"
  | "estimateNote"
  | "estimateUnavailable"
  | "toman"
  | "details"
  | "detailsIntro"
  | "name"
  | "brand"
  | "phone"
  | "whatsapp"
  | "telegram"
  | "email"
  | "message"
  | "messageHint"
  | "attachments"
  | "attachmentsHint"
  | "selectedFiles"
  | "remove"
  | "submit"
  | "sending"
  | "thanksTitle"
  | "thanksBody"
  | "errorGeneric"
  | "errorRate"
  | "errorTooLarge"
  | "errorRequired"
  | "errorQuantity"
  | "errorFileCount"
  | "errorFileSize"
  | "errorFileType"
  | "errorsTitle",
  string
>; // fmt: skip

const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const FIELDS = ["name", "brand", "phone", "whatsapp", "telegram", "email", "message"] as const;
type Field = (typeof FIELDS)[number];

type Estimate = { key: string; low: number; high: number };
type Errors = Partial<Record<Field | "quantity" | "attachments" | "form", string>>;

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

function checkFiles(files: File[], labels: QuoteLabels): string | undefined {
  if (files.length > MAX_FILES) return labels.errorFileCount;
  if (files.some((f) => f.size > MAX_BYTES)) return labels.errorFileSize;
  if (files.some((f) => !FILE_TYPES.includes(f.type))) return labels.errorFileType;
  return undefined;
}

/**
 * The calculator and the enquiry form. The estimate is computed by the server (it never sees the rules);
 * this component only sends choices and shows the range it gets back.
 */
export function QuoteForm({
  options,
  locale,
  labels,
}: {
  options: QuoteOptions;
  locale: Locale;
  labels: QuoteLabels;
}) {
  const hasCalculator = options.services.length > 0;
  const [service, setService] = useState(options.services[0]?.key ?? "");
  const [quantity, setQuantity] = useState(String(options.min_quantity));
  const [addons, setAddons] = useState<string[]>([]);
  const [multipliers, setMultipliers] = useState<string[]>([]);
  const [text, setText] = useState<Record<Field, string>>({
    name: "",
    brand: "",
    phone: "",
    whatsapp: "",
    telegram: "",
    email: "",
    message: "",
  }); // fmt: skip
  const [trap, setTrap] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [phase, setPhase] = useState<"idle" | "sending" | "done">("idle");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [attempt, setAttempt] = useState(0);
  const thanks = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const qty = Number(quantity);
  const quantityOk = Number.isInteger(qty) && qty >= options.min_quantity && qty <= options.max_quantity;
  const choiceKey = JSON.stringify([service, qty, addons, multipliers]);

  // A short pause after the last change, then one request; an older request is dropped when a newer starts.
  useEffect(() => {
    if (!hasCalculator || !quantityOk || !service) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/public/quote/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service, quantity: qty, addons, multipliers }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { low: number; high: number };
        setEstimate({ key: choiceKey, low: body.low, high: body.high });
      } catch {
        // Aborted by a newer choice, or offline: the previous estimate is simply not shown for these choices.
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [hasCalculator, quantityOk, service, qty, addons, multipliers, choiceKey]);

  useEffect(() => {
    if (phase === "done") thanks.current?.focus();
  }, [phase]);

  // After a refused submit, move to the list of problems; the field messages are announced as well.
  useEffect(() => {
    if (attempt > 0) summaryRef.current?.focus();
  }, [attempt]);

  // Only an estimate for the choices on screen is shown.
  const current = estimate && estimate.key === choiceKey && quantityOk ? estimate : null;

  const toggle = (list: string[], set: (value: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const pickFiles = (picked: FileList | null) => {
    const next = [...files, ...Array.from(picked ?? [])];
    setFiles(next);
    setErrors((e) => ({ ...e, attachments: checkFiles(next, labels) }));
  };
  const removeFile = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    setErrors((e) => ({ ...e, attachments: checkFiles(next, labels) }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found: Errors = {};
    if (!text.name.trim()) found.name = labels.errorRequired;
    if (hasCalculator && !quantityOk) {
      found.quantity = fill(labels.errorQuantity, { min: options.min_quantity, max: options.max_quantity });
    }
    const fileError = checkFiles(files, labels);
    if (fileError) found.attachments = fileError;
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setAttempt((n) => n + 1);
      return;
    }

    const body = new FormData();
    for (const field of FIELDS) body.append(field, text[field].trim());
    body.append("language", locale);
    body.append("website", trap);
    if (hasCalculator) {
      body.append("service", service);
      body.append("quantity", String(qty));
      for (const key of addons) body.append("addons", key);
      for (const key of multipliers) body.append("multipliers", key);
    }
    for (const file of files) body.append("attachments", file);

    setErrors({});
    setPhase("sending");
    try {
      const res = await fetch("/api/public/inquiries", { method: "POST", body });
      if (res.status === 201) {
        setPhase("done");
        return;
      }
      const failure: Errors = {};
      if (res.status === 429) failure.form = labels.errorRate;
      else if (res.status === 413) failure.form = labels.errorTooLarge;
      else if (res.status === 400) {
        const data = (await res.json().catch(() => null)) as {
          detail?: string;
          fields?: Record<string, string[]>;
        } | null;
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

  if (phase === "done") {
    return (
      <Card className="max-w-2xl space-y-3">
        <div ref={thanks} tabIndex={-1} role="status" className="space-y-3 outline-none">
          <h2 className="font-display text-2xl font-extrabold">{labels.thanksTitle}</h2>
          <p className="text-muted">{labels.thanksBody}</p>
        </div>
      </Card>
    );
  }

  const bind = (field: Field) => ({
    value: text[field],
    onChange: (e: { target: { value: string } }) => setText({ ...text, [field]: e.target.value }),
    error: errors[field],
  });
  const summary = Object.entries(errors).filter(([, message]) => message);

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

      {hasCalculator && (
        <Card className="grid gap-5">
          <h2 className="font-display text-2xl font-extrabold">{labels.calculator}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="quote-service" className="text-sm font-semibold">
                {labels.service}
              </label>
              <select
                id="quote-service"
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="min-h-11 w-full rounded-brand border border-line bg-elevated px-3 text-text"
              >
                {options.services.map((s) => (
                  <option key={s.key} value={s.key}>
                    {locale === "fa" ? s.label_fa : s.label_en || s.label_fa}
                  </option>
                ))}
              </select>
            </div>
            <InputField
              label={labels.quantity}
              type="number"
              inputMode="numeric"
              min={options.min_quantity}
              max={options.max_quantity}
              dir="ltr"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              error={errors.quantity}
            />
          </div>

          {options.addons.length > 0 && (
            <fieldset className="flex flex-wrap gap-x-6 gap-y-1">
              <legend className="mb-1 text-sm font-semibold">{labels.extras}</legend>
              {options.addons.map((a) => (
                <label key={a.key} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={addons.includes(a.key)}
                    onChange={() => toggle(addons, setAddons, a.key)}
                    className="h-5 w-5 accent-[var(--color-accent)]"
                  />
                  {locale === "fa" ? a.label_fa : a.label_en || a.label_fa}
                </label>
              ))}
            </fieldset>
          )}
          {options.multipliers.length > 0 && (
            <fieldset className="flex flex-wrap gap-x-6 gap-y-1">
              <legend className="mb-1 text-sm font-semibold">{labels.options}</legend>
              {options.multipliers.map((m) => (
                <label key={m.key} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={multipliers.includes(m.key)}
                    onChange={() => toggle(multipliers, setMultipliers, m.key)}
                    className="h-5 w-5 accent-[var(--color-accent)]"
                  />
                  {locale === "fa" ? m.label_fa : m.label_en || m.label_fa}
                </label>
              ))}
            </fieldset>
          )}

          <div role="status" aria-live="polite" className="rounded-brand border border-line bg-elevated p-4">
            <p className="text-sm text-muted">{labels.estimateLabel}</p>
            {current ? (
              <p className="mt-1 text-xl font-bold" data-testid="estimate">
                {fill(labels.estimateRange, {
                  low: formatToman(current.low, locale),
                  high: formatToman(current.high, locale),
                  toman: labels.toman,
                })}
              </p>
            ) : (
              <p className="mt-1 text-muted">{labels.estimateUnavailable}</p>
            )}
            <p className="mt-2 text-sm text-muted">{labels.estimateNote}</p>
          </div>
        </Card>
      )}

      <Card className="grid gap-4">
        <div>
          <h2 className="font-display text-2xl font-extrabold">{labels.details}</h2>
          <p className="mt-1 text-sm text-muted">{labels.detailsIntro}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField label={labels.name} autoComplete="name" required maxLength={120} {...bind("name")} />
          <InputField label={labels.brand} autoComplete="organization" maxLength={120} {...bind("brand")} />
          <InputField
            label={labels.phone}
            type="tel"
            autoComplete="tel"
            dir="ltr"
            maxLength={40}
            {...bind("phone")}
          />
          <InputField label={labels.whatsapp} dir="ltr" maxLength={120} {...bind("whatsapp")} />
          <InputField label={labels.telegram} dir="ltr" maxLength={120} {...bind("telegram")} />
          <InputField
            label={labels.email}
            type="email"
            autoComplete="email"
            dir="ltr"
            maxLength={254}
            {...bind("email")}
          />
        </div>
        <TextareaField
          label={labels.message}
          hint={labels.messageHint}
          maxLength={4000}
          {...bind("message")}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="quote-files" className="text-sm font-semibold">
            {labels.attachments}
          </label>
          <input
            id="quote-files"
            type="file"
            multiple
            accept={FILE_TYPES.join(",")}
            onChange={(e) => {
              pickFiles(e.target.files);
              e.target.value = ""; // the same file can be chosen again after removing it
            }}
            aria-invalid={errors.attachments ? true : undefined}
            aria-describedby="quote-files-note"
            className="min-h-11 w-full rounded-brand border border-line bg-elevated p-2 text-sm"
          />
          <p
            id="quote-files-note"
            className={errors.attachments ? "text-sm text-accent-2" : "text-sm text-muted"}
          >
            {errors.attachments ?? labels.attachmentsHint}
          </p>
          {files.length > 0 && (
            <ul aria-label={labels.selectedFiles} className="flex flex-col gap-1">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                  <span dir="auto" className="truncate">
                    {file.name}
                  </span>
                  <Button
                    variant="ghost"
                    className="min-h-11 px-3 text-sm"
                    aria-label={fill(labels.remove, { name: file.name })}
                    onClick={() => removeFile(index)}
                  >
                    ×
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* A field for bots: invisible and unreachable for people, so only a script fills it in. */}
        <div
          aria-hidden="true"
          className="absolute h-0 w-0 overflow-hidden"
          style={{ insetInlineStart: "-9999px" }}
        >
          <label>
            Website
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
            />
          </label>
        </div>

        <div>
          <Button type="submit" disabled={phase === "sending"}>
            {phase === "sending" ? labels.sending : labels.submit}
          </Button>
        </div>
      </Card>
    </form>
  );
}
