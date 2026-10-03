import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProformaEditorPage } from "@/components/panel/proformas/ProformaEditor";

export const metadata: Metadata = { title: "پیش‌فاکتور" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <ProformaEditorPage id={id} />;
}
