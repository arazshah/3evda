"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import {
  useDeleteQuoteRule,
  usePreviewQuote,
  useQuoteRules,
  useQuoteSettings,
  useReorderQuoteRules,
  useSaveQuoteRule,
  useSaveQuoteSettings,
  type QuotePreview,
  type QuoteRule,
} from "@/lib/api/queries";
import { formatNumber } from "@/lib/format";
import { EditorDialog } from "./EditorDialog";
import { ResourceList } from "./ResourceList";
import { Alert, Button, Card, Field } from "./ui";

const KINDS = [
  { value: "service", label: "قیمت پایه‌ی خدمت (به‌ازای هر محصول)" },
  { value: "tier", label: "پله‌ی تعداد (ضریب از تعداد مشخص به بعد)" },
  { value: "addon_fixed", label: "افزونه‌ی ثابت (یک‌بار)" },
  { value: "addon_per_item", label: "افزونه به‌ازای هر محصول" },
  { value: "multiplier", label: "ضریب (مثل فوریت)" },
] as const;

const kindLabel = (kind: string) => KINDS.find((k) => k.value === kind)?.label ?? kind;

function ruleDetail(rule: QuoteRule): string {
  const parts = [kindLabel(rule.kind).split(" (")[0]];
  if (rule.amount != null) parts.push(`${formatNumber(rule.amount)} تومان`);
  if (rule.kind === "tier" && rule.min_quantity) parts.push(`از ${formatNumber(rule.min_quantity)} محصول`);
  if (rule.factor != null) parts.push(`ضریب ${formatNumber(Number(rule.factor))}`);
  return parts.join(" · ");
}

export function QuoteRulesManager() {
  const rules = useQuoteRules();
  const reorder = useReorderQuoteRules();
  const remove = useDeleteQuoteRule();
  const [editing, setEditing] = useState<QuoteRule | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = rules.data ?? [];

  const act = async (run: () => Promise<unknown>) => {
    setError(null);
    try {
      await run();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" aria-labelledby="rules-title">
        <h1 id="rules-title" className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight">
          قواعد قیمت
        </h1>
        <p className="text-sm text-muted">
          ماشین‌حساب سایت از این قواعد برآورد را حساب می‌کند. بازدیدکننده فقط نام گزینه‌ها و یک بازه‌ی تقریبی
          می‌بیند؛ مبلغ و ضریب‌ها هیچ‌وقت در سایت نمایش داده نمی‌شود. فرمول: ((قیمت پایه × تعداد) × ضریب پله +
          افزونه‌ها) × ضریب‌ها.
        </p>
        {error && <Alert>{error}</Alert>}
        {rules.isError && <Alert>بارگذاری قواعد ناموفق بود.</Alert>}
        <div>
          <Button onClick={() => setEditing("new")}>افزودن قاعده</Button>
        </div>
        <ResourceList
          label="قواعد قیمت"
          rows={list.map((r) => ({
            id: r.id,
            title: r.label_fa || r.key,
            detail: ruleDetail(r),
            published: r.is_active ?? true,
            stateLabel: r.is_active === false ? "غیرفعال" : "فعال",
          }))}
          disabled={reorder.isPending}
          onReorder={(ids) => act(() => reorder.mutateAsync(ids))}
          onEdit={(id) => setEditing(list.find((r) => r.id === id) ?? null)}
          onDelete={(id) => {
            if (window.confirm("این قاعده حذف شود؟")) void act(() => remove.mutateAsync(id));
          }}
        />
      </section>

      <SettingsSection />
      <PreviewSection rules={list} />

      <EditorDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "قاعده‌ی جدید" : "ویرایش قاعده"}
      >
        {editing !== null && (
          <RuleForm rule={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        )}
      </EditorDialog>
    </div>
  );
}

function SettingsSection() {
  const settings = useQuoteSettings();
  return (
    <section className="flex flex-col gap-4" aria-labelledby="quote-settings-title">
      <h2 id="quote-settings-title" className="font-display text-3xl">
        بازه‌ی برآورد
      </h2>
      {settings.isError && <Alert>بارگذاری تنظیمات ناموفق بود.</Alert>}
      {/* Mounted once: keying it by the saved values would remount it and lose the «saved» message. */}
      {settings.data && <SettingsForm initial={settings.data} />}
    </section>
  );
}

function SettingsForm({
  initial,
}: {
  initial: { range_percent?: number; rounding_step?: number; min_quantity?: number; max_quantity?: number };
}) {
  const save = useSaveQuoteSettings();
  const [values, setValues] = useState({
    range_percent: String(initial.range_percent ?? 15),
    rounding_step: String(initial.rounding_step ?? 10000),
    min_quantity: String(initial.min_quantity ?? 1),
    max_quantity: String(initial.max_quantity ?? 200),
  });
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const field = (key: keyof typeof values) => ({
    value: values[key],
    onChange: (e: { target: { value: string } }) => setValues({ ...values, [key]: e.target.value }),
    error: fieldErrors[key]?.[0],
    type: "number" as const,
    inputMode: "numeric" as const,
    dir: "ltr" as const,
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setFieldErrors({});
    try {
      await save.mutateAsync({
        range_percent: Number(values.range_percent),
        rounding_step: Number(values.rounding_step),
        min_quantity: Number(values.min_quantity),
        max_quantity: Number(values.max_quantity),
      });
      setMessage({ tone: "success", text: "ذخیره شد." });
    } catch (err) {
      const fields = (err as { fields?: Record<string, string[]> })?.fields;
      if (fields) setFieldErrors(fields);
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="درصد بازه (± درصد)"
          hint="برآورد به‌صورت «از … تا …» و با همین درصد بالا و پایین نشان داده می‌شود."
          min={0}
          max={50}
          {...field("range_percent")}
        />
        <Field
          label="گرد کردن بازه به (تومان)"
          hint="دو سر بازه به نزدیک‌ترین مضرب این عدد گرد می‌شود."
          min={1}
          {...field("rounding_step")}
        />
        <Field label="حداقل تعداد محصول" min={1} {...field("min_quantity")} />
        <Field label="حداکثر تعداد محصول" min={1} {...field("max_quantity")} />
      </div>
      <div>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "در حال ذخیره…" : "ذخیره‌ی تنظیمات"}
        </Button>
      </div>
    </form>
  );
}

function RuleForm({ rule, onDone }: { rule: QuoteRule | null; onDone: () => void }) {
  const save = useSaveQuoteRule();
  const [kind, setKind] = useState<string>(rule?.kind ?? "service");
  const [text, setText] = useState({
    key: rule?.key ?? "",
    label_fa: rule?.label_fa ?? "",
    label_en: rule?.label_en ?? "",
    amount: rule?.amount != null ? String(rule.amount) : "",
    factor: rule?.factor != null ? String(Number(rule.factor)) : "",
    min_quantity: rule?.min_quantity != null ? String(rule.min_quantity) : "",
  });
  const [active, setActive] = useState(rule?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const priced = kind === "service" || kind === "addon_fixed" || kind === "addon_per_item";
  const hasFactor = kind === "tier" || kind === "multiplier";

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
        id: rule?.id,
        key: text.key.trim(),
        kind: kind as QuoteRule["kind"],
        label_fa: text.label_fa,
        label_en: text.label_en,
        amount: priced && text.amount !== "" ? Number(text.amount) : null,
        factor: hasFactor && text.factor !== "" ? text.factor : null,
        min_quantity: kind === "tier" && text.min_quantity !== "" ? Number(text.min_quantity) : null,
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
      <label className="flex flex-col gap-1 text-sm text-muted">
        نوع قاعده
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان در سایت (فارسی)" dir="rtl" required {...set("label_fa")} />
        <Field label="عنوان در سایت (English)" dir="ltr" {...set("label_en")} />
        <Field
          label="شناسه (انگلیسی)"
          dir="ltr"
          required
          pattern="[A-Za-z0-9_\-]+"
          hint="فقط حروف انگلیسی، عدد و خط تیره؛ یکتا است (مثلاً food یا urgent)."
          {...set("key")}
        />
        {priced && (
          <Field
            label="مبلغ (تومان)"
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={0}
            required
            {...set("amount")}
          />
        )}
        {hasFactor && (
          <Field
            label="ضریب"
            type="number"
            inputMode="decimal"
            dir="ltr"
            step="0.01"
            min={0.01}
            max={20}
            required
            hint={kind === "tier" ? "مثلاً ۰٫۹ یعنی ۱۰٪ تخفیف." : "مثلاً ۱٫۵ یعنی ۵۰٪ گران‌تر."}
            {...set("factor")}
          />
        )}
        {kind === "tier" && (
          <Field
            label="از چند محصول به بعد"
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={1}
            required
            {...set("min_quantity")}
          />
        )}
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-5 w-5 accent-[var(--color-accent)]"
        />
        فعال باشد (در ماشین‌حساب سایت استفاده شود)
      </label>
      <div className="flex gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "در حال ذخیره…" : "ذخیره"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          انصراف
        </Button>
      </div>
    </form>
  );
}

function PreviewSection({ rules }: { rules: QuoteRule[] }) {
  const preview = usePreviewQuote();
  const active = rules.filter((r) => r.is_active !== false);
  const services = active.filter((r) => r.kind === "service");
  const addons = active.filter((r) => r.kind === "addon_fixed" || r.kind === "addon_per_item");
  const multipliers = active.filter((r) => r.kind === "multiplier");

  const [service, setService] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [chosenAddons, setChosenAddons] = useState<string[]>([]);
  const [chosenMultipliers, setChosenMultipliers] = useState<string[]>([]);
  const [result, setResult] = useState<QuotePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A rule can be deleted, deactivated or changed after it was ticked: only what is still on offer is sent.
  const activeService = services.some((s) => s.key === service) ? service : (services[0]?.key ?? "");
  const pickAvailable = (chosen: string[], offered: QuoteRule[]) =>
    chosen.filter((key) => offered.some((r) => r.key === key));

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const run = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setResult(null);
    try {
      setResult(
        await preview.mutateAsync({
          service: activeService,
          quantity: Number(quantity),
          addons: pickAvailable(chosenAddons, addons),
          multipliers: pickAvailable(chosenMultipliers, multipliers),
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const label = (key: string) => rules.find((r) => r.key === key)?.label_fa ?? key;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="preview-title">
      <h2 id="preview-title" className="font-display text-3xl">
        امتحان قیمت
      </h2>
      <p className="text-sm text-muted">
        با قواعد ذخیره‌شده یک برآورد بگیرید و ببینید عدد چطور ساخته می‌شود. چیزی ذخیره نمی‌شود.
      </p>
      {services.length === 0 ? (
        <p className="text-muted">برای امتحان، دست‌کم یک «قیمت پایه‌ی خدمت» فعال اضافه کنید.</p>
      ) : (
        <Card>
          <form onSubmit={run} className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-muted">
                خدمت
                <select
                  value={activeService}
                  onChange={(e) => setService(e.target.value)}
                  className="min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text"
                >
                  {services.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label_fa}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="تعداد محصول"
                type="number"
                inputMode="numeric"
                dir="ltr"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            {addons.length > 0 && (
              <fieldset className="flex flex-wrap gap-4">
                <legend className="mb-1 text-sm text-muted">افزونه‌ها</legend>
                {addons.map((a) => (
                  <label key={a.key} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={chosenAddons.includes(a.key)}
                      onChange={() => toggle(chosenAddons, setChosenAddons, a.key)}
                      className="h-5 w-5 accent-[var(--color-accent)]"
                    />
                    {a.label_fa}
                  </label>
                ))}
              </fieldset>
            )}
            {multipliers.length > 0 && (
              <fieldset className="flex flex-wrap gap-4">
                <legend className="mb-1 text-sm text-muted">ضریب‌ها</legend>
                {multipliers.map((m) => (
                  <label key={m.key} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={chosenMultipliers.includes(m.key)}
                      onChange={() => toggle(chosenMultipliers, setChosenMultipliers, m.key)}
                      className="h-5 w-5 accent-[var(--color-accent)]"
                    />
                    {m.label_fa}
                  </label>
                ))}
              </fieldset>
            )}
            <div>
              <Button type="submit" disabled={preview.isPending}>
                {preview.isPending ? "در حال محاسبه…" : "محاسبه"}
              </Button>
            </div>
          </form>
        </Card>
      )}
      {error && <Alert>{error}</Alert>}
      {result && (
        <Card>
          <dl aria-label="نتیجه‌ی برآورد" className="flex flex-col gap-2">
            <div className="flex gap-2">
              <dt className="text-muted">بازه‌ی نمایش‌داده‌شده به بازدیدکننده:</dt>
              <dd className="font-bold">
                از {formatNumber(result.low)} تا {formatNumber(result.high)} تومان
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted">مبلغ دقیق محاسبه‌شده:</dt>
              <dd>{formatNumber(result.total)} تومان</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted">قیمت پایه × تعداد:</dt>
              <dd>{formatNumber(result.base)} تومان</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted">ضریب پله‌ی تعداد:</dt>
              <dd>{formatNumber(Number(result.tier_factor))}</dd>
            </div>
            {result.addons.map(([key, amount]) => (
              <div key={key} className="flex gap-2">
                <dt className="text-muted">افزونه «{label(key!)}»:</dt>
                <dd>{formatNumber(Number(amount))} تومان</dd>
              </div>
            ))}
            {result.multipliers.map(([key, factor]) => (
              <div key={key} className="flex gap-2">
                <dt className="text-muted">ضریب «{label(key!)}»:</dt>
                <dd>{formatNumber(Number(factor))}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </section>
  );
}
