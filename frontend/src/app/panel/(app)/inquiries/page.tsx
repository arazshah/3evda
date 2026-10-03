import type { Metadata } from "next";
import { InquiriesManager } from "@/components/panel/inquiries/InquiriesManager";

export const metadata: Metadata = { title: "استعلام‌ها" };

export default function Page() {
  return <InquiriesManager />;
}
