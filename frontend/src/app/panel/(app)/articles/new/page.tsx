import type { Metadata } from "next";
import { ArticleEditorPage } from "@/components/panel/blog/ArticleEditor";

export const metadata: Metadata = { title: "مقاله‌ی جدید" };

export default async function Page({ searchParams }: { searchParams: Promise<{ language?: string }> }) {
  const { language } = await searchParams;
  return <ArticleEditorPage newLanguage={language === "en" ? "en" : "fa"} />;
}
