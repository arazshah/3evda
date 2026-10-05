"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import {
  useBlogCategories,
  useBlogTags,
  useDeleteBlogCategory,
  useDeleteBlogTag,
  useSaveBlogCategory,
  useSaveBlogTag,
  type BlogCategory,
  type BlogTag,
} from "@/lib/api/queries";
import { formatNumber } from "@/lib/format";
import { EditorDialog } from "../EditorDialog";
import { ResourceList } from "../ResourceList";
import { Alert, Button, Field, TextArea } from "../ui";

export function BlogTaxonomyManager() {
  return (
    <div className="flex flex-col gap-10">
      <Categories />
      <Tags />
    </div>
  );
}

function Categories() {
  const categories = useBlogCategories();
  const remove = useDeleteBlogCategory();
  const [editing, setEditing] = useState<BlogCategory | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = categories.data ?? [];
  return (
    <section className="flex flex-col gap-4" aria-labelledby="blog-categories">
      <h1 id="blog-categories" className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight">
        دسته‌های مجله
      </h1>
      <p className="text-sm text-muted">با حذف یک دسته، مقاله‌هایش حذف نمی‌شوند و فقط بی‌دسته می‌شوند.</p>
      {error && <Alert>{error}</Alert>}
      <div>
        <Button onClick={() => setEditing("new")}>افزودن دسته</Button>
      </div>
      <ResourceList
        label="دسته‌های مجله"
        rows={list.map((c) => ({
          id: c.id,
          title: c.title_fa || c.title_en || "",
          detail: `${formatNumber(c.article_count)} مقاله`,
          published: true,
        }))}
        onEdit={(id) => setEditing(list.find((c) => c.id === id) ?? null)}
        onDelete={(id) => {
          if (window.confirm("این دسته حذف شود؟"))
            remove.mutateAsync(id).catch((e) => setError(errorMessage(e)));
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
    </section>
  );
}

function CategoryForm({ category, onDone }: { category: BlogCategory | null; onDone: () => void }) {
  const save = useSaveBlogCategory();
  const [text, setText] = useState({
    title_fa: category?.title_fa ?? "",
    title_en: category?.title_en ?? "",
    description_fa: category?.description_fa ?? "",
    description_en: category?.description_en ?? "",
    slug: category?.slug ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof text) => ({
    value: text[key],
    onChange: (e: { target: { value: string } }) => setText({ ...text, [key]: e.target.value }),
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({ id: category?.id, ...text });
      onDone();
    } catch (err) {
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
      <Field label="نشانی در لینک (اختیاری)" dir="ltr" hint="خالی = از نام ساخته می‌شود" {...set("slug")} />
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

function Tags() {
  const tags = useBlogTags();
  const remove = useDeleteBlogTag();
  const [editing, setEditing] = useState<BlogTag | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = tags.data ?? [];
  return (
    <section className="flex flex-col gap-4" aria-labelledby="blog-tags">
      <h2 id="blog-tags" className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight">
        برچسب‌های مجله
      </h2>
      {error && <Alert>{error}</Alert>}
      <div>
        <Button onClick={() => setEditing("new")}>افزودن برچسب</Button>
      </div>
      <ResourceList
        label="برچسب‌های مجله"
        rows={list.map((t) => ({
          id: t.id,
          title: t.title_fa || t.title_en || "",
          detail: `${formatNumber(t.article_count)} مقاله`,
          published: true,
        }))}
        onEdit={(id) => setEditing(list.find((t) => t.id === id) ?? null)}
        onDelete={(id) => {
          if (window.confirm("این برچسب حذف شود؟"))
            remove.mutateAsync(id).catch((e) => setError(errorMessage(e)));
        }}
      />
      <EditorDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "برچسب جدید" : "ویرایش برچسب"}
      >
        {editing !== null && (
          <TagForm tag={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        )}
      </EditorDialog>
    </section>
  );
}

function TagForm({ tag, onDone }: { tag: BlogTag | null; onDone: () => void }) {
  const save = useSaveBlogTag();
  const [text, setText] = useState({
    title_fa: tag?.title_fa ?? "",
    title_en: tag?.title_en ?? "",
    slug: tag?.slug ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof text) => ({
    value: text[key],
    onChange: (e: { target: { value: string } }) => setText({ ...text, [key]: e.target.value }),
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({ id: tag?.id, ...text });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="نام برچسب (فارسی)" dir="rtl" required {...set("title_fa")} />
        <Field label="نام برچسب (English)" dir="ltr" {...set("title_en")} />
      </div>
      <Field label="نشانی در لینک (اختیاری)" dir="ltr" hint="خالی = از نام ساخته می‌شود" {...set("slug")} />
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
