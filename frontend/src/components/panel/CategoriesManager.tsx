"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import {
  useCategories,
  useDeleteCategory,
  useReorderCategories,
  useSaveCategory,
  type Category,
} from "@/lib/api/queries";
import { EditorDialog } from "./EditorDialog";
import { previewUrl } from "./media-utils";
import { MediaPicker, type PickedMedia } from "./MediaPicker";
import { ResourceList } from "./ResourceList";
import { Alert, Button, Field, TextArea } from "./ui";

export function CategoriesManager() {
  const categories = useCategories();
  const reorder = useReorderCategories();
  const remove = useDeleteCategory();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = categories.data ?? [];
  const rows = list.map((c) => ({
    id: c.id,
    title: c.title_fa || c.title_en || `دسته ${c.id}`,
    detail: `${c.project_count} پروژه`,
    published: c.is_published ?? true,
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
      <h1 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] leading-tight">دسته‌های نمونه‌کار</h1>
      <p className="text-sm text-muted">مثل «غذا» یا «محصول». دسته‌ای که پروژه دارد حذف نمی‌شود.</p>
      {error && <Alert>{error}</Alert>}
      {categories.isError && <Alert>بارگذاری فهرست ناموفق بود.</Alert>}
      <div>
        <Button onClick={() => setEditing("new")}>افزودن دسته</Button>
      </div>
      <ResourceList
        label="دسته‌ها"
        rows={rows}
        disabled={reorder.isPending}
        onReorder={(ids) => act(() => reorder.mutateAsync(ids))}
        onEdit={(id) => setEditing(list.find((c) => c.id === id) ?? null)}
        onDelete={(id) => {
          if (window.confirm("این دسته حذف شود؟")) void act(() => remove.mutateAsync(id));
        }}
      />
      <EditorDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "دسته‌ی جدید" : "ویرایش دسته"}
      >
        {editing !== null && (
          <CategoryForm category={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        )}
      </EditorDialog>
    </div>
  );
}

function CategoryForm({ category, onDone }: { category: Category | null; onDone: () => void }) {
  const save = useSaveCategory();
  const [text, setText] = useState({
    title_fa: category?.title_fa ?? "",
    title_en: category?.title_en ?? "",
    description_fa: category?.description_fa ?? "",
    description_en: category?.description_en ?? "",
    slug: category?.slug ?? "",
  });
  const [cover, setCover] = useState<PickedMedia | null>(
    category?.cover
      ? {
          id: category.cover,
          src: category.cover_detail ? (previewUrl(category.cover_detail) ?? null) : null,
          label: "تصویر دسته",
        }
      : null,
  );
  const [published, setPublished] = useState(category?.is_published ?? true);
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
        id: category?.id,
        ...text,
        cover: cover?.id ?? null,
        is_published: published,
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
        <Field label="نام دسته (فارسی)" dir="rtl" required {...set("title_fa")} />
        <Field label="نام دسته (English)" dir="ltr" {...set("title_en")} />
        <TextArea label="توضیح (فارسی)" dir="rtl" rows={3} {...set("description_fa")} />
        <TextArea label="توضیح (English)" dir="ltr" rows={3} {...set("description_en")} />
      </div>
      <MediaPicker label="تصویر دسته" value={cover} onChange={setCover} />
      <Field
        label="نشانی در لینک (اختیاری)"
        dir="ltr"
        hint="خالی بگذارید تا از عنوان انگلیسی ساخته شود."
        {...set("slug")}
      />
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
