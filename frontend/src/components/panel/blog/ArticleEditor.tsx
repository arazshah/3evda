"use client";

import type { JSONContent } from "@tiptap/core";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import {
  useArticle,
  useBlogCategories,
  useBlogTags,
  useDeleteArticle,
  usePreviewLink,
  useProjects,
  useSaveArticle,
  useTranslateArticle,
  type Article,
} from "@/lib/api/queries";
import { fromLocalInput, toLocalInput } from "@/lib/datetime";
import { previewUrl } from "../media-utils";
import { MediaPicker, type PickedMedia } from "../MediaPicker";
import { Alert, Button, Card, Field, TextArea } from "../ui";
import { RichTextEditor } from "./RichTextEditor";

type Language = "fa" | "en";
const LANGUAGE_NAMES: Record<Language, string> = { fa: "فارسی", en: "English" };
const other = (language: Language): Language => (language === "fa" ? "en" : "fa");

/** Opens an existing article, or starts a new one in `newLanguage`. */
export function ArticleEditorPage({
  id,
  newLanguage,
  justCreated = false,
}: {
  id?: number;
  newLanguage?: Language;
  justCreated?: boolean;
}) {
  const article = useArticle(id);
  if (id === undefined) return <ArticleForm key="new" article={null} language={newLanguage ?? "fa"} />;
  if (article.isError) return <Alert>مقاله پیدا نشد.</Alert>;
  if (!article.data) return <p className="text-muted">در حال بارگذاری…</p>;
  return (
    <ArticleForm
      key={article.data.id}
      article={article.data}
      language={article.data.language}
      justCreated={justCreated}
    />
  );
}

function pickedFrom(
  id: string | null | undefined,
  detail: Article["cover_detail"],
  label: string,
): PickedMedia | null {
  return id ? { id, src: detail ? (previewUrl(detail) ?? null) : null, label } : null;
}

function ArticleForm({
  article,
  language,
  justCreated = false,
}: {
  article: Article | null;
  language: Language;
  justCreated?: boolean;
}) {
  const router = useRouter();
  const save = useSaveArticle();
  const remove = useDeleteArticle();
  const translate = useTranslateArticle();
  const previewLink = usePreviewLink();
  const categories = useBlogCategories();
  const tags = useBlogTags();
  const projects = useProjects();

  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [summary, setSummary] = useState(article?.summary ?? "");
  const [status, setStatus] = useState<"draft" | "published">(article?.status ?? "draft");
  const [publishedAt, setPublishedAt] = useState(toLocalInput(article?.published_at));
  const [category, setCategory] = useState(article?.category ? String(article.category) : "");
  const [tagIds, setTagIds] = useState<number[]>(article?.tags ?? []);
  const [projectIds, setProjectIds] = useState<number[]>(article?.related_projects ?? []);
  const [seoTitle, setSeoTitle] = useState(article?.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(article?.seo_description ?? "");
  const [cover, setCover] = useState(() => pickedFrom(article?.cover, article?.cover_detail ?? null, "کاور"));
  const [ogImage, setOgImage] = useState(() =>
    pickedFrom(article?.og_image, article?.og_image_detail ?? null, "OG"),
  );
  const [body, setBody] = useState<JSONContent | null>((article?.body as JSONContent | undefined) ?? null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(
    justCreated ? { tone: "success", text: "مقاله ساخته شد." } : null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [link, setLink] = useState<string | null>(null);

  const previews = Object.fromEntries(
    Object.entries(article?.body_media ?? {}).flatMap(([mediaId, media]) => {
      const src = previewUrl(media);
      return src ? [[mediaId, src]] : [];
    }),
  );
  const dir = language === "fa" ? "rtl" : "ltr";
  const toggle = (list: number[], id: number) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  const translation = article?.translations.find((t) => t.language === other(language));
  const scheduled = article?.status === "published" && !article.is_live;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setMessage(null);
    try {
      const saved = await save.mutateAsync({
        id: article?.id,
        language,
        title,
        slug,
        summary,
        body: body ?? { type: "doc", content: [] },
        cover: cover?.id ?? null,
        category: category ? Number(category) : null,
        tags: tagIds,
        related_projects: projectIds,
        status,
        published_at: status === "published" ? fromLocalInput(publishedAt) : null,
        seo_title: seoTitle,
        seo_description: seoDescription,
        og_image: ogImage?.id ?? null,
      });
      setMessage({ tone: "success", text: "ذخیره شد." });
      if (!article) router.replace(`/panel/articles/${saved.id}?created=1`);
    } catch (err) {
      const fields = (err as { fields?: Record<string, string[]> })?.fields;
      if (fields) setFieldErrors(fields);
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  const copyPreview = async () => {
    if (!article) return;
    try {
      const { token } = await previewLink.mutateAsync(article.id);
      const url = `${window.location.origin}${language === "en" ? "/en" : ""}/blog/preview/${token}`;
      setLink(url);
      await navigator.clipboard?.writeText(url).catch(() => undefined);
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  const makeTranslation = async () => {
    if (!article) return;
    try {
      const copy = await translate.mutateAsync(article.id);
      router.push(`/panel/articles/${copy.id}`);
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  const deleteArticle = async () => {
    if (!article || !window.confirm("این مقاله حذف شود؟")) return;
    try {
      await remove.mutateAsync(article.id);
      router.replace("/panel/articles");
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] leading-tight">
          {article ? "ویرایش مقاله" : "مقاله‌ی جدید"}{" "}
          <span className="text-base text-muted">({LANGUAGE_NAMES[language]})</span>
        </h1>
        {article && (
          <p className="text-sm text-muted">
            {article.is_live ? "منتشر شده" : scheduled ? "زمان‌بندی‌شده" : "پیش‌نویس"} · زمان مطالعه:{" "}
            {article.reading_minutes} دقیقه
          </p>
        )}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card className="flex flex-col gap-4">
        <Field
          label="عنوان"
          dir={dir}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={fieldErrors.title?.[0]}
        />
        <TextArea
          label="خلاصه (در فهرست و گوگل نمایش داده می‌شود)"
          dir={dir}
          rows={3}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          error={fieldErrors.summary?.[0]}
        />
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted">متن مقاله</span>
          <RichTextEditor initial={body} previews={previews} onChange={setBody} dir={dir} label="متن مقاله" />
          {fieldErrors.body && (
            <p role="alert" className="text-sm text-accent-2">
              {fieldErrors.body[0]}
            </p>
          )}
        </div>
      </Card>

      <Card className="grid gap-4 md:grid-cols-2">
        <h2 className="font-bold md:col-span-2">انتشار</h2>
        <label className="flex flex-col gap-1 text-sm text-muted">
          وضعیت
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "published")}
            className="min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text"
          >
            <option value="draft">پیش‌نویس (عمومی نیست)</option>
            <option value="published">منتشر شود</option>
          </select>
        </label>
        {status === "published" && (
          <Field
            label="زمان انتشار"
            type="datetime-local"
            dir="ltr"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
            hint="خالی = همین حالا. زمان آینده یعنی مقاله در همان لحظه خودکار منتشر می‌شود."
            error={fieldErrors.published_at?.[0]}
          />
        )}
        <Field
          label="نشانی مقاله (اختیاری)"
          dir="ltr"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          hint="خالی بگذارید تا از عنوان ساخته شود. با تغییر آن، نشانی قدیمی خودکار به جدید هدایت می‌شود."
          error={fieldErrors.slug?.[0]}
        />
      </Card>

      <Card className="grid gap-4 md:grid-cols-2">
        <h2 className="font-bold md:col-span-2">دسته‌بندی و تصویر</h2>
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
        <MediaPicker label="کاور" value={cover} onChange={setCover} spec="article_cover" />
        <fieldset className="md:col-span-2">
          <legend className="mb-1 text-sm text-muted">برچسب‌ها</legend>
          <div className="flex flex-wrap gap-2">
            {tags.data?.length ? (
              tags.data.map((t) => (
                <label
                  key={t.id}
                  className="flex min-h-11 items-center gap-2 rounded-full border border-line px-3"
                >
                  <input
                    type="checkbox"
                    checked={tagIds.includes(t.id)}
                    onChange={() => setTagIds(toggle(tagIds, t.id))}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                  {t.title_fa || t.title_en}
                </label>
              ))
            ) : (
              <p className="text-sm text-muted">هنوز برچسبی نساخته‌اید (از «دسته‌ها و برچسب‌های مجله»).</p>
            )}
          </div>
        </fieldset>
        <fieldset className="md:col-span-2">
          <legend className="mb-1 text-sm text-muted">نمونه‌کارهای مرتبط</legend>
          <div className="flex flex-wrap gap-2">
            {projects.data?.map((p) => (
              <label
                key={p.id}
                className="flex min-h-11 items-center gap-2 rounded-full border border-line px-3"
              >
                <input
                  type="checkbox"
                  checked={projectIds.includes(p.id)}
                  onChange={() => setProjectIds(toggle(projectIds, p.id))}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                {p.title_fa || p.title_en}
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="grid gap-4 md:grid-cols-2">
        <h2 className="font-bold md:col-span-2">سئو (اختیاری)</h2>
        <Field
          label="عنوان برای گوگل"
          dir={dir}
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
          hint="خالی = عنوان مقاله"
        />
        <MediaPicker label="تصویر اشتراک‌گذاری" value={ogImage} onChange={setOgImage} spec="share" />
        <TextArea
          label="توضیح برای گوگل"
          dir={dir}
          rows={3}
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
          hint="خالی = خلاصه‌ی مقاله"
          className="md:col-span-2"
        />
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "در حال ذخیره…" : "ذخیره"}
        </Button>
        {article && (
          <>
            <Button variant="ghost" onClick={copyPreview} disabled={previewLink.isPending}>
              لینک پیش‌نمایش
            </Button>
            {translation ? (
              <a
                className="inline-flex min-h-11 items-center rounded-brand border border-line px-5 hover:border-accent"
                href={`/panel/articles/${translation.id}`}
              >
                ویرایش نسخه‌ی {LANGUAGE_NAMES[other(language)]}
              </a>
            ) : (
              <Button variant="ghost" onClick={makeTranslation} disabled={translate.isPending}>
                ساخت نسخه‌ی {LANGUAGE_NAMES[other(language)]}
              </Button>
            )}
            <Button variant="danger" onClick={deleteArticle}>
              حذف مقاله
            </Button>
          </>
        )}
      </div>
      {link && (
        <Card className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            این لینک ۲۴ ساعت اعتبار دارد و فقط پیش‌نمایش را نشان می‌دهد (در گوگل نمی‌آید). کپی شد:
          </p>
          <input
            readOnly
            dir="ltr"
            value={link}
            aria-label="لینک پیش‌نمایش"
            onFocus={(e) => e.target.select()}
            className="min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1"
          />
        </Card>
      )}
    </form>
  );
}
