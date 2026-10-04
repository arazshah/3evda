import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GalleryDetailPage } from "@/components/panel/galleries/GalleryDetail";

export const metadata: Metadata = { title: "گالری" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <GalleryDetailPage id={id} />;
}
