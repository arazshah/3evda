"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import {
  useCategories,
  useDeleteProject,
  useProjects,
  useReorderProjects,
  useSaveProject,
  type Project,
} from "@/lib/api/queries";
import { moveId } from "@/lib/reorder";
import { EditorDialog } from "./EditorDialog";
import { previewUrl } from "./media-utils";
import { MediaPicker, type PickedMedia } from "./MediaPicker";
import { ResourceList } from "./ResourceList";
import { Alert, Button, Field, TextArea } from "./ui";

const STYLES = [
  { value: "", label: "بدون سبک" },
  { value: "low_key", label: "لو‌کی" },
  { value: "high_key", label: "های‌کی" },
  { value: "natural", label: "طبیعی" },
] as const;

export function ProjectsManager() {
  const projects = useProjects();
  const reorder = useReorderProjects();
  const remove = useDeleteProject();
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = projects.data ?? [];
  const rows = list.map((p) => ({
    id: p.id,
    title: p.title_fa || p.title_en || `پروژه ${p.id}`,
    detail: p.title_en || undefined,
    published: p.is_published ?? true,
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
      <h1 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] leading-tight">نمونه‌کارها</h1>
      {error && <Alert>{error}</Alert>}
      {projects.isError && <Alert>بارگذاری فهرست ناموفق بود.</Alert>}
      <div>
        <Button onClick={() => setEditing("new")}>افزودن پروژه</Button>
      </div>
      <ResourceList
        label="پروژه‌ها"
        rows={rows}
        disabled={reorder.isPending}
        onReorder={(ids) => act(() => reorder.mutateAsync(ids))}
        onEdit={(id) => setEditing(list.find((p) => p.id === id) ?? null)}
        onDelete={(id) => {
          if (window.confirm("این پروژه حذف شود؟")) void act(() => remove.mutateAsync(id));
        }}
      />
      <EditorDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "پروژه‌ی جدید" : "ویرایش پروژه"}
      >
        {editing !== null && (
          <ProjectForm project={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        )}
      </EditorDialog>
    </div>
  );
}

type GalleryImage = {
  media: string;
  src: string | null;
  label: string;
  caption_fa: string;
  caption_en: string;
};

function ProjectForm({ project, onDone }: { project: Project | null; onDone: () => void }) {
  const save = useSaveProject();
  const categories = useCategories();
  const [text, setText] = useState({
    title_fa: project?.title_fa ?? "",
    title_en: project?.title_en ?? "",
    summary_fa: project?.summary_fa ?? "",
    summary_en: project?.summary_en ?? "",
    body_fa: project?.body_fa ?? "",
    body_en: project?.body_en ?? "",
    client_fa: project?.client_fa ?? "",
    client_en: project?.client_en ?? "",
    slug: project?.slug ?? "",
  });
  const [year, setYear] = useState(project?.year ? String(project.year) : "");
  const [category, setCategory] = useState(project?.category ? String(project.category) : "");
  const [style, setStyle] = useState<string>(project?.style ?? "");
  const [cover, setCover] = useState<PickedMedia | null>(
    project?.cover
      ? {
          id: project.cover,
          src: project.cover_detail ? (previewUrl(project.cover_detail) ?? null) : null,
          label: "تصویر شاخص",
        }
      : null,
  );
  const [images, setImages] = useState<GalleryImage[]>(
    () =>
      project?.images?.map((i) => ({
        media: i.media,
        src: previewUrl(i.media_detail) ?? null,
        label: "تصویر",
        caption_fa: i.caption_fa ?? "",
        caption_en: i.caption_en ?? "",
      })) ?? [],
  );
  const [featured, setFeatured] = useState(project?.is_featured ?? false);
  const [published, setPublished] = useState(project?.is_published ?? true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const set = (key: keyof typeof text) => ({
    value: text[key],
    onChange: (e: { target: { value: string } }) => setText({ ...text, [key]: e.target.value }),
    error: fieldErrors[key]?.[0],
  });
  const patchImage = (index: number, change: Partial<GalleryImage>) =>
    setImages((list) => list.map((img, i) => (i === index ? { ...img, ...change } : img)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      await save.mutateAsync({
        id: project?.id,
        ...text,
        category: category ? Number(category) : null,
        style: style as Project["style"],
        year: year ? Number(year) : null,
        cover: cover?.id ?? null,
        is_featured: featured,
        is_published: published,
        // The API ignores `media_detail` on write; the generated type just marks it required.
        images: images.map(({ media, caption_fa, caption_en }) => ({
          media,
          caption_fa,
          caption_en,
        })) as Project["images"],
      });
      onDone();
    } catch (err) {
      const fields = (err as { fields?: Record<string, string[]> })?.fields;
      if (fields) setFieldErrors(fields);
      setError(errorMessage(err));
    }
  };

  const check = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <label className="flex min-h-11 items-center gap-3">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[var(--color-accent)]"
      />
      {label}
    </label>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان (فارسی)" dir="rtl" required {...set("title_fa")} />
        <Field label="عنوان (English)" dir="ltr" {...set("title_en")} />
        <TextArea label="خلاصه (فارسی)" dir="rtl" rows={2} {...set("summary_fa")} />
        <TextArea label="خلاصه (English)" dir="ltr" rows={2} {...set("summary_en")} />
        <TextArea label="شرح پروژه (فارسی)" dir="rtl" {...set("body_fa")} />
        <TextArea label="شرح پروژه (English)" dir="ltr" {...set("body_en")} />
        <Field label="مشتری (فارسی)" dir="rtl" {...set("client_fa")} />
        <Field label="مشتری (English)" dir="ltr" {...set("client_en")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          دسته
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text"
          >
            <option value="">بدون دسته</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title_fa || c.title_en}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          سبک
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text"
          >
            {STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="سال"
          type="number"
          dir="ltr"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          error={fieldErrors.year?.[0]}
        />
      </div>
      <MediaPicker label="تصویر شاخص" value={cover} onChange={setCover} spec="project_cover" />

      <fieldset className="flex flex-col gap-3 rounded-brand border border-line p-3">
        <legend className="px-2 text-sm text-muted">تصاویر پروژه</legend>
        {fieldErrors.images && <Alert>{String(fieldErrors.images[0] ?? "")}</Alert>}
        <ul aria-label="تصاویر پروژه" className="flex flex-col gap-3">
          {images.map((img, index) => (
            <li key={`${img.media}-${index}`} className="flex flex-wrap items-start gap-3">
              <div className="flex size-20 items-center justify-center overflow-hidden rounded-brand border border-line bg-elevated text-xs text-muted">
                {img.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.src} alt="" className="size-full object-cover" />
                ) : (
                  img.label
                )}
              </div>
              <div className="grid min-w-48 flex-1 gap-2 sm:grid-cols-2">
                <Field
                  label={`توضیح تصویر ${index + 1} (فارسی)`}
                  dir="rtl"
                  value={img.caption_fa}
                  onChange={(e) => patchImage(index, { caption_fa: e.target.value })}
                />
                <Field
                  label={`توضیح تصویر ${index + 1} (English)`}
                  dir="ltr"
                  value={img.caption_en}
                  onChange={(e) => patchImage(index, { caption_en: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="min-w-11 px-3"
                  disabled={index === 0}
                  aria-label={`بالا بردن تصویر ${index + 1}`}
                  onClick={() => setImages(moveId(images, index, -1))}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  className="min-w-11 px-3"
                  disabled={index === images.length - 1}
                  aria-label={`پایین بردن تصویر ${index + 1}`}
                  onClick={() => setImages(moveId(images, index, 1))}
                >
                  ↓
                </Button>
                <Button
                  variant="danger"
                  aria-label={`حذف تصویر ${index + 1}`}
                  onClick={() => setImages(images.filter((_, i) => i !== index))}
                >
                  حذف
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <MediaPicker
          label="افزودن تصویر یا ویدیو"
          kind="any"
          spec="project_image"
          value={null}
          onChange={(picked) => {
            if (picked)
              setImages([
                ...images,
                { media: picked.id, src: picked.src, label: picked.label, caption_fa: "", caption_en: "" },
              ]);
          }}
        />
      </fieldset>

      <Field
        label="نشانی در لینک (اختیاری)"
        dir="ltr"
        hint="خالی بگذارید تا از عنوان انگلیسی ساخته شود."
        {...set("slug")}
      />
      {check("پروژه‌ی منتخب (در صفحه‌ی خانه نمایش داده شود)", featured, setFeatured)}
      {check("در سایت نمایش داده شود", published, setPublished)}
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
