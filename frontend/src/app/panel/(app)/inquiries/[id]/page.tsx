import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InquiryDetailPage } from "@/components/panel/inquiries/InquiryDetail";

export const metadata: Metadata = { title: "جزئیات استعلام" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <InquiryDetailPage id={id} />;
}
