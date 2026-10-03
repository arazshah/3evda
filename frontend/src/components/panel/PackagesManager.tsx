"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import {
  useDeleteGroup,
  useDeletePackage,
  usePackageGroups,
  usePackages,
  useReorderGroups,
  useReorderPackages,
  useSaveGroup,
  useSavePackage,
  type Package,
  type PackageGroup,
} from "@/lib/api/queries";
import { formatNumber } from "@/lib/format";
import { moveId } from "@/lib/reorder";
import { EditorDialog } from "./EditorDialog";
import { ResourceList } from "./ResourceList";
import { Alert, Button, Field, TextArea } from "./ui";

const PRICE_MODES = [
  { value: "from", label: "از … تومان (شروع قیمت)" },
  { value: "fixed", label: "قیمت ثابت" },
  { value: "inquiry", label: "استعلام قیمت (بدون عدد)" },
] as const;

export function PackagesManager() {
  const groups = usePackageGroups();
  const reorderGroups = useReorderGroups();
  const removeGroup = useDeleteGroup();
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<PackageGroup | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = groups.data ?? [];
  const current = list.find((g) => g.id === selected) ?? list[0];

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
      <section className="flex flex-col gap-4" aria-labelledby="groups-title">
        <h1 id="groups-title" className="text-2xl font-bold">
          پکیج‌ها و قیمت‌ها
        </h1>
        <p className="text-sm text-muted">
          پکیج‌ها در گروه‌ها دسته‌بندی می‌شوند (مثلاً «عکاسی غذا»). گروهی که پکیج دارد حذف نمی‌شود مگر با حذف
          پکیج‌هایش.
        </p>
        {error && <Alert>{error}</Alert>}
        {groups.isError && <Alert>بارگذاری گروه‌ها ناموفق بود.</Alert>}
        <div>
          <Button onClick={() => setEditing("new")}>افزودن گروه</Button>
        </div>
        <ResourceList
          label="گروه‌های پکیج"
          rows={list.map((g) => ({
            id: g.id,
            title: g.title_fa || g.title_en || `گروه ${g.id}`,
            detail: `${formatNumber(g.package_count)} پکیج`,
            published: g.is_published ?? true,
          }))}
          disabled={reorderGroups.isPending}
          onReorder={(ids) => act(() => reorderGroups.mutateAsync(ids))}
          onEdit={(id) => setEditing(list.find((g) => g.id === id) ?? null)}
          onDelete={(id) => {
            if (window.confirm("این گروه حذف شود؟")) void act(() => removeGroup.mutateAsync(id));
          }}
        />
      </section>

      {list.length > 0 && current && (
        <section className="flex flex-col gap-4" aria-labelledby="packages-title">
          <h2 id="packages-title" className="text-xl font-bold">
            پکیج‌های گروه
          </h2>
          <div role="group" aria-label="گروه" className="flex flex-wrap gap-2">
            {list.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={g.id === current.id}
                onClick={() => setSelected(g.id)}
                className={`min-h-11 rounded-full border px-4 text-sm ${
                  g.id === current.id
                    ? "border-accent bg-accent text-bg"
                    : "border-line text-muted hover:border-accent"
                }`}
              >
                {g.title_fa || g.title_en}
              </button>
            ))}
          </div>
          <GroupPackages key={current.id} group={current} />
        </section>
      )}

      <EditorDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "گروه‌ی جدید" : "ویرایش گروه"}
      >
        {editing !== null && (
          <GroupForm group={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        )}
      </EditorDialog>
    </div>
  );
}

function GroupPackages({ group }: { group: PackageGroup }) {
  const packages = usePackages(group.id);
  const reorder = useReorderPackages();
  const remove = useDeletePackage();
  const [editing, setEditing] = useState<Package | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = packages.data ?? [];
  const act = async (run: () => Promise<unknown>) => {
    setError(null);
    try {
      await run();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      {packages.isError && <Alert>بارگذاری پکیج‌ها ناموفق بود.</Alert>}
      <div>
        <Button onClick={() => setEditing("new")}>افزودن پکیج</Button>
      </div>
      <ResourceList
        label="پکیج‌ها"
        rows={list.map((p) => ({
          id: p.id,
          title: p.title_fa || p.title_en || `پکیج ${p.id}`,
          detail: priceSummary(p),
          published: p.is_published ?? true,
        }))}
        disabled={reorder.isPending}
        onReorder={(ids) => act(() => reorder.mutateAsync(ids))}
        onEdit={(id) => setEditing(list.find((p) => p.id === id) ?? null)}
        onDelete={(id) => {
          if (window.confirm("این پکیج حذف شود؟")) void act(() => remove.mutateAsync(id));
        }}
      />
      <EditorDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "پکیج جدید" : "ویرایش پکیج"}
      >
        {editing !== null && (
          <PackageForm
            groupId={group.id}
            pkg={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </EditorDialog>
    </div>
  );
}

function priceSummary(p: Package): string {
  if (p.price_mode === "inquiry" || p.price_amount == null) return "استعلام قیمت";
  return `${p.price_mode === "from" ? "از " : ""}${formatNumber(p.price_amount)} تومان`;
}

function GroupForm({ group, onDone }: { group: PackageGroup | null; onDone: () => void }) {
  const save = useSaveGroup();
  const [text, setText] = useState({
    title_fa: group?.title_fa ?? "",
    title_en: group?.title_en ?? "",
    description_fa: group?.description_fa ?? "",
    description_en: group?.description_en ?? "",
  });
  const [published, setPublished] = useState(group?.is_published ?? true);
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
      await save.mutateAsync({ id: group?.id, ...text, is_published: published });
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
        <Field label="نام گروه (فارسی)" dir="rtl" required {...set("title_fa")} />
        <Field label="نام گروه (English)" dir="ltr" {...set("title_en")} />
        <TextArea label="توضیح (فارسی)" dir="rtl" rows={3} {...set("description_fa")} />
        <TextArea label="توضیح (English)" dir="ltr" rows={3} {...set("description_en")} />
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
          className="h-5 w-5 accent-[var(--color-accent)]"
        />
        در سایت نمایش داده شود
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

type FeatureRow = { text_fa: string; text_en: string; included: boolean };

function PackageForm({ groupId, pkg, onDone }: { groupId: number; pkg: Package | null; onDone: () => void }) {
  const save = useSavePackage();
  const [text, setText] = useState({
    title_fa: pkg?.title_fa ?? "",
    title_en: pkg?.title_en ?? "",
    summary_fa: pkg?.summary_fa ?? "",
    summary_en: pkg?.summary_en ?? "",
    price_unit_fa: pkg?.price_unit_fa ?? "",
    price_unit_en: pkg?.price_unit_en ?? "",
    badge_fa: pkg?.badge_fa ?? "",
    badge_en: pkg?.badge_en ?? "",
  });
  const [mode, setMode] = useState<string>(pkg?.price_mode ?? "from");
  const [amount, setAmount] = useState(pkg?.price_amount != null ? String(pkg.price_amount) : "");
  const [features, setFeatures] = useState<FeatureRow[]>(
    () =>
      pkg?.features?.map((f) => ({
        text_fa: f.text_fa,
        text_en: f.text_en ?? "",
        included: f.included ?? true,
      })) ?? [],
  );
  const [featured, setFeatured] = useState(pkg?.is_featured ?? false);
  const [published, setPublished] = useState(pkg?.is_published ?? true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const set = (key: keyof typeof text) => ({
    value: text[key],
    onChange: (e: { target: { value: string } }) => setText({ ...text, [key]: e.target.value }),
    error: fieldErrors[key]?.[0],
  });
  const patchFeature = (index: number, change: Partial<FeatureRow>) =>
    setFeatures((list) => list.map((f, i) => (i === index ? { ...f, ...change } : f)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      await save.mutateAsync({
        id: pkg?.id,
        group: groupId,
        ...text,
        price_mode: mode as Package["price_mode"],
        price_amount: mode === "inquiry" || amount === "" ? null : Number(amount),
        is_featured: featured,
        is_published: published,
        features: features.filter((f) => f.text_fa.trim() || f.text_en.trim()),
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
        <Field label="نام پکیج (فارسی)" dir="rtl" required {...set("title_fa")} />
        <Field label="نام پکیج (English)" dir="ltr" {...set("title_en")} />
        <TextArea label="توضیح کوتاه (فارسی)" dir="rtl" rows={2} {...set("summary_fa")} />
        <TextArea label="توضیح کوتاه (English)" dir="ltr" rows={2} {...set("summary_en")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-muted">
          نوع قیمت
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="min-h-11 rounded-brand border border-line bg-elevated px-3 text-text"
          >
            {PRICE_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {mode !== "inquiry" && (
          <Field
            label="مبلغ (تومان)"
            type="number"
            dir="ltr"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={fieldErrors.price_amount?.[0]}
          />
        )}
        <Field label="واحد قیمت (فارسی)" dir="rtl" hint="مثل «به ازای هر محصول»" {...set("price_unit_fa")} />
        <Field label="واحد قیمت (English)" dir="ltr" {...set("price_unit_en")} />
        <Field label="برچسب (فارسی)" dir="rtl" hint="مثل «محبوب»" {...set("badge_fa")} />
        <Field label="برچسب (English)" dir="ltr" {...set("badge_en")} />
      </div>

      <fieldset className="flex flex-col gap-3 rounded-brand border border-line p-3">
        <legend className="px-2 text-sm text-muted">ویژگی‌ها</legend>
        <ul aria-label="ویژگی‌ها" className="flex flex-col gap-3">
          {features.map((f, index) => (
            <li key={index} className="flex flex-wrap items-end gap-3">
              <div className="grid min-w-48 flex-1 gap-2 sm:grid-cols-2">
                <Field
                  label={`ویژگی ${index + 1} (فارسی)`}
                  dir="rtl"
                  value={f.text_fa}
                  onChange={(e) => patchFeature(index, { text_fa: e.target.value })}
                />
                <Field
                  label={`ویژگی ${index + 1} (English)`}
                  dir="ltr"
                  value={f.text_en}
                  onChange={(e) => patchFeature(index, { text_en: e.target.value })}
                />
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={f.included}
                  onChange={(e) => patchFeature(index, { included: e.target.checked })}
                  className="h-5 w-5 accent-[var(--color-accent)]"
                />
                شامل می‌شود
              </label>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="min-w-11 px-3"
                  disabled={index === 0}
                  aria-label={`بالا بردن ویژگی ${index + 1}`}
                  onClick={() => setFeatures(moveId(features, index, -1))}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  className="min-w-11 px-3"
                  disabled={index === features.length - 1}
                  aria-label={`پایین بردن ویژگی ${index + 1}`}
                  onClick={() => setFeatures(moveId(features, index, 1))}
                >
                  ↓
                </Button>
                <Button
                  variant="danger"
                  aria-label={`حذف ویژگی ${index + 1}`}
                  onClick={() => setFeatures(features.filter((_, i) => i !== index))}
                >
                  حذف
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div>
          <Button
            variant="ghost"
            onClick={() => setFeatures([...features, { text_fa: "", text_en: "", included: true }])}
          >
            افزودن ویژگی
          </Button>
        </div>
      </fieldset>

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={featured}
          onChange={(e) => setFeatured(e.target.checked)}
          className="h-5 w-5 accent-[var(--color-accent)]"
        />
        پکیج ویژه (در صفحه‌ی خانه نمایش داده شود)
      </label>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
          className="h-5 w-5 accent-[var(--color-accent)]"
        />
        در سایت نمایش داده شود
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
