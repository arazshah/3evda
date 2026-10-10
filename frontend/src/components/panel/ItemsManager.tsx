"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import {
  useDeleteItem,
  useItems,
  useReorderItems,
  useSaveItem,
  type Collection,
  type ContentItem,
} from "@/lib/api/queries";
import type { ImageSpecKey } from "@/lib/image-specs";
import { EditorDialog } from "./EditorDialog";
import { previewUrl } from "./media-utils";
import { MediaPicker, type PickedMedia } from "./MediaPicker";
import { ResourceList } from "./ResourceList";
import { Alert, Button, Field, TextArea } from "./ui";

type FieldName = "title" | "subtitle" | "body" | "link_url" | "media";

type Spec = {
  spec?: ImageSpecKey;
  label: string;
  noun: string;
  fields: Partial<Record<FieldName, string>>;
  hint?: string;
};

/** What each collection needs, in the owner's words. */
const SPECS: Record<Collection, Spec> = {
  hero_slide: {
    spec: "hero",
    label: "اسلایدهای صفحه‌ی اول",
    noun: "اسلاید",
    fields: { title: "عنوان بزرگ", subtitle: "متن زیر عنوان", media: "تصویر" },
    hint: "اگر خالی بماند، متن معرفی صفحه‌ی خانه نمایش داده می‌شود.",
  },
  service: {
    spec: "service",
    label: "خدمات",
    noun: "خدمت",
    fields: { title: "نام خدمت", subtitle: "توضیح کوتاه", body: "توضیح کامل", media: "تصویر" },
  },
  process_step: {
    label: "مراحل همکاری",
    noun: "مرحله",
    fields: { title: "عنوان مرحله", body: "توضیح" },
  },
  client: { spec: "client", label: "مشتریان", noun: "مشتری", fields: { title: "نام برند", media: "لوگو" } },
  testimonial: {
    label: "نظر مشتریان",
    noun: "نظر",
    fields: { title: "نام", subtitle: "سمت یا نام برند", body: "متن نظر" },
  },
  behind_scenes: {
    spec: "behind",
    label: "پشت صحنه",
    noun: "تصویر",
    fields: { title: "توضیح تصویر (برای نابینایان)", media: "تصویر" },
  },
  faq: { label: "پرسش‌های پرتکرار", noun: "پرسش", fields: { title: "پرسش", body: "پاسخ" } },
  nav_link: {
    label: "منوی بالای سایت",
    noun: "پیوند",
    fields: { title: "عنوان", link_url: "آدرس، مثل /portfolio یا https://…" },
    hint: "اگر هیچ پیوندی اضافه نکنید، منوی پیش‌فرض نمایش داده می‌شود.",
  },
};

const ORDER = Object.keys(SPECS) as Collection[];

export function ItemsManager() {
  const [collection, setCollection] = useState<Collection>("hero_slide");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] leading-tight">بخش‌های تکرارشونده</h1>
      <div role="group" aria-label="نوع محتوا" className="flex flex-wrap gap-2">
        {ORDER.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={c === collection}
            onClick={() => setCollection(c)}
            className={`min-h-11 rounded-full border px-4 text-sm ${
              c === collection
                ? "border-accent bg-accent text-bg"
                : "border-line text-muted hover:border-accent"
            }`}
          >
            {SPECS[c].label}
          </button>
        ))}
      </div>
      <CollectionEditor key={collection} collection={collection} />
    </div>
  );
}

function CollectionEditor({ collection }: { collection: Collection }) {
  const spec = SPECS[collection];
  const items = useItems(collection);
  const reorder = useReorderItems();
  const remove = useDeleteItem();
  const [editing, setEditing] = useState<ContentItem | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = items.data ?? [];
  const rows = list.map((i) => ({
    id: i.id,
    title: i.title_fa || i.title_en || i.subtitle_fa || i.body_fa || `${spec.noun} ${i.id}`,
    detail: i.title_en || undefined,
    published: i.is_published ?? true,
  }));

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
      {spec.hint && <p className="text-sm text-muted">{spec.hint}</p>}
      {error && <Alert>{error}</Alert>}
      {items.isError && <Alert>بارگذاری فهرست ناموفق بود.</Alert>}
      <div>
        <Button onClick={() => setEditing("new")}>افزودن {spec.noun}</Button>
      </div>
      <ResourceList
        label={spec.label}
        rows={rows}
        disabled={reorder.isPending}
        onReorder={(ids) => act(() => reorder.mutateAsync({ collection, ids }))}
        onEdit={(id) => setEditing(list.find((i) => i.id === id) ?? null)}
        onDelete={(id) => {
          if (window.confirm("این مورد حذف شود؟")) void act(() => remove.mutateAsync(id));
        }}
      />
      <EditorDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? `${spec.noun} جدید` : `ویرایش ${spec.noun}`}
      >
        {editing !== null && (
          <ItemForm
            collection={collection}
            spec={spec}
            item={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </EditorDialog>
    </div>
  );
}

function ItemForm({
  collection,
  spec,
  item,
  onDone,
}: {
  collection: Collection;
  spec: Spec;
  item: ContentItem | null;
  onDone: () => void;
}) {
  const save = useSaveItem();
  const [text, setText] = useState({
    title_fa: item?.title_fa ?? "",
    title_en: item?.title_en ?? "",
    subtitle_fa: item?.subtitle_fa ?? "",
    subtitle_en: item?.subtitle_en ?? "",
    body_fa: item?.body_fa ?? "",
    body_en: item?.body_en ?? "",
    link_url: item?.link_url ?? "",
  });
  const [media, setMedia] = useState<PickedMedia | null>(
    item?.media
      ? {
          id: item.media,
          src: item.media_detail ? (previewUrl(item.media_detail) ?? null) : null,
          label: "تصویر",
        }
      : null,
  );
  const [published, setPublished] = useState(item?.is_published ?? true);
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
    const f = spec.fields;
    try {
      await save.mutateAsync({
        id: item?.id,
        collection,
        is_published: published,
        ...(f.title ? { title_fa: text.title_fa, title_en: text.title_en } : {}),
        ...(f.subtitle ? { subtitle_fa: text.subtitle_fa, subtitle_en: text.subtitle_en } : {}),
        ...(f.body ? { body_fa: text.body_fa, body_en: text.body_en } : {}),
        ...(f.link_url ? { link_url: text.link_url } : {}),
        ...(f.media ? { media: media?.id ?? null } : {}),
      });
      onDone();
    } catch (err) {
      const fields = (err as { fields?: Record<string, string[]> })?.fields;
      if (fields) setFieldErrors(fields);
      setError(errorMessage(err));
    }
  };

  const f = spec.fields;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      {f.title && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`${f.title} (فارسی)`} dir="rtl" {...set("title_fa")} />
          <Field label={`${f.title} (English)`} dir="ltr" {...set("title_en")} />
        </div>
      )}
      {f.subtitle && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`${f.subtitle} (فارسی)`} dir="rtl" {...set("subtitle_fa")} />
          <Field label={`${f.subtitle} (English)`} dir="ltr" {...set("subtitle_en")} />
        </div>
      )}
      {f.body && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextArea label={`${f.body} (فارسی)`} dir="rtl" {...set("body_fa")} />
          <TextArea label={`${f.body} (English)`} dir="ltr" {...set("body_en")} />
        </div>
      )}
      {f.link_url && <Field label={f.link_url} dir="ltr" {...set("link_url")} />}
      {f.media && <MediaPicker label={f.media} value={media} onChange={setMedia} spec={spec.spec} />}
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
