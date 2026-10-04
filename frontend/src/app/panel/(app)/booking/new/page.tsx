import type { Metadata } from "next";
import { NewBookingPage } from "@/components/panel/booking/NewBooking";

export const metadata: Metadata = { title: "رزرو دستی" };

const positive = (value?: string) =>
  value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ inquiry?: string; proforma?: string }>;
}) {
  const query = await searchParams;
  return <NewBookingPage inquiryId={positive(query.inquiry)} proformaId={positive(query.proforma)} />;
}
