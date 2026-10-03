import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleEditorPage } from "@/components/panel/blog/ArticleEditor";

export const metadata: Metadata = { title: "ویرایش مقاله" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const id = Number((await params).id);
  const { created } = await searchParams;
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <ArticleEditorPage id={id} justCreated={created === "1"} />;
}
