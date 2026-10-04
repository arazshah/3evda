"use client";

import { useState, type FormEvent } from "react";
import { JalaliDateInput } from "@/components/calendar/JalaliDateInput";
import { isoOf } from "@/lib/calendar/jalali";
import { formatDay } from "@/lib/calendar/format";
import { errorMessage } from "@/lib/api/client";
import {
  useBookingHours,
  useBookingSettings,
  useClosedPeriods,
  useDeleteClosedPeriod,
  useDeleteSessionType,
  useReorderSessionTypes,
  useSaveBookingHours,
  useSaveBookingSettings,
  useSaveClosedPeriod,
  useSaveSessionType,
  useSessionTypes,
  type BookingSettings,
  type SessionType,
  type WorkingHours,
} from "@/lib/api/queries";
import { formatNumber } from "@/lib/format";
import { EditorDialog } from "../EditorDialog";
import { ResourceList } from "../ResourceList";
import { Alert, Button, Card, Field } from "../ui";

/** Saturday first, as the week is lived; the number is Python's `date.weekday()` that the server uses. */
const WEEK: { weekday: number; name: string }[] = [
  { weekday: 5, name: "شنبه" },
  { weekday: 6, name: "یکشنبه" },
  { weekday: 0, name: "دوشنبه" },
  { weekday: 1, name: "سه‌شنبه" },
  { weekday: 2, name: "چهارشنبه" },
  { weekday: 3, name: "پنجشنبه" },
  { weekday: 4, name: "جمعه" },
];

type Message = { tone: "success" | "error"; text: string } | null;

export function BookingSettingsManager() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold">تنظیمات رزرو</h1>
        <p className="mt-1 text-sm text-muted">
          مشتری فقط ساعت‌هایی را می‌بیند که در ساعت کاری باشد، روز بسته نباشد، سقف روزانه پر نشده باشد و با
          رزرو دیگری هم‌پوشانی نداشته باشد.
        </p>
      </div>
      <TypesSection />
      <HoursSection />
      <ClosedSection />
      <LimitsSection />
    </div>
  );
}

// ---- session types --------------------------------------------------------------------------------

function TypesSection() {
  const types = useSessionTypes();
  const reorder = useReorderSessionTypes();
  const remove = useDeleteSessionType();
  const [editing, setEditing] = useState<SessionType | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = types.data ?? [];

  const act = async (run: () => Promise<unknown>) => {
    setError(null);
    try {
      await run();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="types-title">
      <h2 id="types-title" className="text-xl font-bold">
        انواع جلسه
      </h2>
      {error && <Alert>{error}</Alert>}
      {types.isError && <Alert>بارگذاری انواع جلسه ناموفق بود.</Alert>}
      <div>
        <Button onClick={() => setEditing("new")}>افزودن نوع جلسه</Button>
      </div>
      <ResourceList
        label="انواع جلسه"
        rows={list.map((t) => ({
          id: t.id,
          title: t.title_fa,
          detail: `${formatNumber(t.duration_minutes)} دقیقه${t.buffer_minutes ? ` + ${formatNumber(t.buffer_minutes)} دقیقه فاصله` : ""}`,
          published: t.is_active ?? true,
          stateLabel: t.is_active === false ? "غیرفعال" : "فعال",
        }))}
        disabled={reorder.isPending}
        onReorder={(ids) => act(() => reorder.mutateAsync(ids))}
        onEdit={(id) => setEditing(list.find((t) => t.id === id) ?? null)}
        onDelete={(id) => {
          if (window.confirm("این نوع جلسه حذف شود؟")) void act(() => remove.mutateAsync(id));
        }}
      />
      <EditorDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "نوع جلسه‌ی جدید" : "ویرایش نوع جلسه"}
      >
        {editing !== null && (
          <TypeForm type={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        )}
      </EditorDialog>
    </section>
  );
}

function TypeForm({ type, onDone }: { type: SessionType | null; onDone: () => void }) {
  const save = useSaveSessionType();
  const [text, setText] = useState({
    key: type?.key ?? "",
    title_fa: type?.title_fa ?? "",
    title_en: type?.title_en ?? "",
    duration_minutes: String(type?.duration_minutes ?? 60),
    buffer_minutes: String(type?.buffer_minutes ?? 0),
  });
  const [active, setActive] = useState(type?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const set = (key: keyof typeof text) => ({
    value: text[key],
    onChange: (e: { target: { value: string } }) => setText({ ...text, [key]: e.target.value }),
    error: fieldErrors[key]?.[0],
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      await save.mutateAsync({
        id: type?.id,
        key: text.key.trim(),
        title_fa: text.title_fa,
        title_en: text.title_en,
        duration_minutes: Number(text.duration_minutes),
        buffer_minutes: Number(text.buffer_minutes),
        is_active: active,
      });
      onDone();
    } catch (err) {
      const fields = (err as { fields?: Record<string, string[]> })?.fields;
      if (fields) setFieldErrors(fields);
      setError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان در سایت (فارسی)" dir="rtl" required {...set("title_fa")} />
        <Field label="عنوان در سایت (English)" dir="ltr" {...set("title_en")} />
        <Field
          label="کلید"
          dir="ltr"
          required
          pattern="[A-Za-z0-9_\-]+"
          hint="انگلیسی و بدون فاصله، مثل studio"
          {...set("key")}
        />
        <span />
        <Field
          label="مدت جلسه (دقیقه)"
          type="number"
          min={15}
          max={720}
          dir="ltr"
          {...set("duration_minutes")}
        />
        <Field
          label="فاصله بعد از جلسه (دقیقه)"
          type="number"
          min={0}
          max={240}
          dir="ltr"
          hint="برای رفت‌وآمد و جمع کردن وسایل؛ در این مدت رزرو دیگری شروع نمی‌شود."
          {...set("buffer_minutes")}
        />
      </div>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        فعال (در سایت قابل رزرو باشد)
      </label>
      <div>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "در حال ذخیره…" : "ذخیره"}
        </Button>
      </div>
    </form>
  );
}

// ---- weekly hours ---------------------------------------------------------------------------------

type Row = { weekday: number; start: string; end: string };
const short = (time: string) => time.slice(0, 5);

function HoursSection() {
  const hours = useBookingHours();
  return (
    <section className="flex flex-col gap-3" aria-labelledby="hours-title">
      <h2 id="hours-title" className="text-xl font-bold">
        ساعت کاری هفتگی
      </h2>
      {hours.isError && <Alert>بارگذاری ساعت کاری ناموفق بود.</Alert>}
      {hours.data && (
        <HoursForm
          initial={hours.data.hours.map((h) => ({ ...h, start: short(h.start), end: short(h.end) }))}
        />
      )}
    </section>
  );
}

function HoursForm({ initial }: { initial: Row[] }) {
  const save = useSaveBookingHours();
  const [rows, setRows] = useState<Row[]>(initial);
  const [message, setMessage] = useState<Message>(null);

  const patch = (target: Row, change: Partial<Row>) =>
    setRows(rows.map((r) => (r === target ? { ...r, ...change } : r)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await save.mutateAsync(rows as WorkingHours[]);
      setMessage({ tone: "success", text: "ساعت کاری ذخیره شد." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Card className="flex flex-col gap-4">
        {WEEK.map(({ weekday, name }) => {
          const mine = rows.filter((r) => r.weekday === weekday);
          return (
            <div
              key={weekday}
              className="flex flex-col gap-2 border-b border-line pb-3 last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{name}</h3>
                <Button
                  variant="ghost"
                  aria-label={`افزودن بازه برای ${name}`}
                  onClick={() => setRows([...rows, { weekday, start: "10:00", end: "18:00" }])}
                >
                  افزودن بازه
                </Button>
              </div>
              {mine.length === 0 && <p className="text-sm text-muted">تعطیل</p>}
              {mine.map((row, i) => (
                <div key={i} className="flex flex-wrap items-end gap-3">
                  <Field
                    label={`از (${name})`}
                    type="time"
                    dir="ltr"
                    value={row.start}
                    onChange={(e) => patch(row, { start: e.target.value })}
                  />
                  <Field
                    label={`تا (${name})`}
                    type="time"
                    dir="ltr"
                    value={row.end}
                    onChange={(e) => patch(row, { end: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    aria-label={`حذف بازه‌ی ${name}`}
                    onClick={() => setRows(rows.filter((r) => r !== row))}
                  >
                    حذف
                  </Button>
                </div>
              ))}
            </div>
          );
        })}
      </Card>
      <div>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "در حال ذخیره…" : "ذخیره‌ی ساعت کاری"}
        </Button>
      </div>
    </form>
  );
}

// ---- closed days ----------------------------------------------------------------------------------

function todayIso(): string {
  const d = new Date();
  return isoOf({ gy: d.getFullYear(), gm: d.getMonth() + 1, gd: d.getDate() });
}

function ClosedSection() {
  const closed = useClosedPeriods();
  const add = useSaveClosedPeriod();
  const remove = useDeleteClosedPeriod();
  const [start, setStart] = useState(todayIso);
  const [end, setEnd] = useState(todayIso);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<Message>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await add.mutateAsync({ start_date: start, end_date: end, reason });
      setReason("");
      setMessage({ tone: "success", text: "روز بسته اضافه شد." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="closed-title">
      <h2 id="closed-title" className="text-xl font-bold">
        روزهای بسته
      </h2>
      <p className="text-sm text-muted">تعطیلی یا مسافرت. رزروهای قبلی همان روزها دست‌نخورده می‌ماند.</p>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {closed.isError && <Alert>بارگذاری روزهای بسته ناموفق بود.</Alert>}
      {closed.data && closed.data.length > 0 && (
        <ul aria-label="روزهای بسته" className="flex flex-col gap-2">
          {closed.data.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-brand border border-line bg-surface p-3"
            >
              <span className="flex-1" dir="auto">
                {c.start_date === c.end_date
                  ? formatDay(c.start_date)
                  : `${formatDay(c.start_date)} تا ${formatDay(c.end_date)}`}
                {c.reason ? ` · ${c.reason}` : ""}
              </span>
              <Button
                variant="danger"
                aria-label={`حذف روز بسته ${formatDay(c.start_date)}`}
                onClick={() => {
                  if (window.confirm("این بازه‌ی بسته حذف شود؟")) remove.mutate(c.id);
                }}
              >
                حذف
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit}>
        <Card className="flex flex-col gap-4">
          <h3 className="font-semibold">افزودن روز بسته</h3>
          <div className="flex flex-wrap gap-4">
            <JalaliDateInput
              label="از تاریخ"
              value={start}
              onChange={(v) => {
                setStart(v);
                if (end < v) setEnd(v);
              }}
            />
            <JalaliDateInput label="تا تاریخ" value={end} onChange={setEnd} />
          </div>
          <Field
            label="دلیل (فقط برای خودتان)"
            dir="auto"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
          />
          <div>
            <Button type="submit" disabled={add.isPending}>
              افزودن
            </Button>
          </div>
        </Card>
      </form>
    </section>
  );
}

// ---- limits ---------------------------------------------------------------------------------------

function LimitsSection() {
  const settings = useBookingSettings();
  return (
    <section className="flex flex-col gap-3" aria-labelledby="limits-title">
      <h2 id="limits-title" className="text-xl font-bold">
        سقف‌ها
      </h2>
      {settings.isError && <Alert>بارگذاری تنظیمات ناموفق بود.</Alert>}
      {settings.data && <LimitsForm initial={settings.data} />}
    </section>
  );
}

function LimitsForm({ initial }: { initial: BookingSettings }) {
  const save = useSaveBookingSettings();
  const [values, setValues] = useState({
    max_per_day: String(initial.max_per_day ?? 3),
    min_notice_hours: String(initial.min_notice_hours ?? 24),
    horizon_days: String(initial.horizon_days ?? 60),
  });
  const [message, setMessage] = useState<Message>(null);
  const field = (key: keyof typeof values) => ({
    value: values[key],
    onChange: (e: { target: { value: string } }) => setValues({ ...values, [key]: e.target.value }),
    type: "number" as const,
    dir: "ltr" as const,
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await save.mutateAsync({
        max_per_day: Number(values.max_per_day),
        min_notice_hours: Number(values.min_notice_hours),
        horizon_days: Number(values.horizon_days),
      });
      setMessage({ tone: "success", text: "سقف‌ها ذخیره شد." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="حداکثر رزرو در یک روز" min={1} max={50} {...field("max_per_day")} />
        <Field
          label="حداقل ساعت قبل از جلسه"
          min={0}
          max={720}
          hint="مشتری نمی‌تواند نزدیک‌تر از این رزرو کند."
          {...field("min_notice_hours")}
        />
        <Field label="دورترین روز قابل رزرو (روز)" min={1} max={365} {...field("horizon_days")} />
      </div>
      <div>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "در حال ذخیره…" : "ذخیره‌ی سقف‌ها"}
        </Button>
      </div>
    </form>
  );
}
