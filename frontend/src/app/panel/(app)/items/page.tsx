import type { Metadata } from "next";
import { ItemsManager } from "@/components/panel/ItemsManager";

export const metadata: Metadata = { title: "بخش‌های تکرارشونده" };

export default function Page() {
  return <ItemsManager />;
}
