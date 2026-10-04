import type { Metadata } from "next";
import { BookingsManager } from "@/components/panel/booking/BookingsManager";

export const metadata: Metadata = { title: "رزروها" };

export default function Page() {
  return <BookingsManager />;
}
