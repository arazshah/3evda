"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api/client";
import { useArticles, useDeleteArticle, type ArticleFilters } from "@/lib/api/queries";
import { ResourceList } from "../ResourceList";
import { Alert } from "../ui";

const LANGUAGE_NAMES = { fa: "فارسی", en: "English" } as const;
const NEW_LINK =
  "inline-flex min-h-11 items-center justify-center rounded-brand bg-accent px-5 font-semibold text-bg hover:opacity-90";

export function ArticlesManager() {
  const router = useRouter();
  const [language, setLanguage] = useState<ArticleFilters["language"]>(undefined);
  const [status, setStatus] = useState<ArticleFilters["status"]>(undefined);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const articles = useArticles({ language, status, q: q || undefined });
  const remove = useDeleteArticle();
  const list = articles.data ?? [];

  const select = (label: string, value: string, set: (v: never) => void, options: [string, string][]) => (
    <label className="flex flex-col gap-1 text-sm text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => set((e.target.value || undefined) as never)}
        className="min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text"
      >
        <option value="">همه</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] leading-tight">مقاله‌های مجله</h1>
      <div className="flex flex-wrap gap-3">
        <Link href="/panel/articles/new?language=fa" className={NEW_LINK}>
          مقاله‌ی جدید (فارسی)
        </Link>
        <Link href="/panel/articles/new?language=en" className={NEW_LINK}>
          New article (English)
        </Link>
        <Link
          href="/panel/blog-taxonomy"
          className="inline-flex min-h-11 items-center rounded-brand border border-line px-5 hover:border-accent"
        >
          دسته‌ها و برچسب‌های مجله
        </Link>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm text-muted">
          جست‌وجو
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 rounded-none border-0 border-b border-text/60 bg-transparent px-1 text-text outline-none focus:border-text"
          />
        </label>
        {select("زبان", language ?? "", setLanguage, [
          ["fa", "فارسی"],
          ["en", "English"],
        ])}
        {select("وضعیت", status ?? "", setStatus, [
          ["draft", "پیش‌نویس"],
          ["published", "منتشرشده یا زمان‌بندی‌شده"],
        ])}
      </div>
      {error && <Alert>{error}</Alert>}
      {articles.isError && <Alert>بارگذاری فهرست ناموفق بود.</Alert>}
      <ResourceList
        label="مقاله‌ها"
        rows={list.map((a) => {
          const state = a.status === "draft" ? "پیش‌نویس" : a.is_live ? "منتشرشده" : "زمان‌بندی‌شده";
          return {
            id: a.id,
            title: a.title || `مقاله ${a.id}`,
            detail: LANGUAGE_NAMES[a.language],
            published: a.is_live,
            stateLabel: state,
          };
        })}
        onEdit={(id) => router.push(`/panel/articles/${id}`)}
        onDelete={(id) => {
          if (!window.confirm("این مقاله حذف شود؟")) return;
          remove.mutateAsync(id).catch((err) => setError(errorMessage(err)));
        }}
      />
    </div>
  );
}
