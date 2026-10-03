import type { Metadata } from "next";
import { ProformasManager } from "@/components/panel/proformas/ProformasManager";

export const metadata: Metadata = { title: "پیش‌فاکتورها" };

export default function Page() {
  return <ProformasManager />;
}
