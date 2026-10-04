import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingDetailPage } from "@/components/panel/booking/BookingDetail";

export const metadata: Metadata = { title: "جزئیات رزرو" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <BookingDetailPage id={id} />;
}
