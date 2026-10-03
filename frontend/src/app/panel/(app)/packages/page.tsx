import type { Metadata } from "next";
import { PackagesManager } from "@/components/panel/PackagesManager";

export const metadata: Metadata = { title: "پکیج‌ها و قیمت‌ها" };

export default function Page() {
  return <PackagesManager />;
}
