import type { Metadata } from "next";
import { BookingSettingsManager } from "@/components/panel/booking/BookingSettingsManager";

export const metadata: Metadata = { title: "تنظیمات رزرو" };

export default function Page() {
  return <BookingSettingsManager />;
}
