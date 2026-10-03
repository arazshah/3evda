import type { Metadata } from "next";
import { CategoriesManager } from "@/components/panel/CategoriesManager";

export const metadata: Metadata = { title: "دسته‌های نمونه‌کار" };

export default function Page() {
  return <CategoriesManager />;
}
