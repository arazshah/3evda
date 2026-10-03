import type { Metadata } from "next";
import { ArticlesManager } from "@/components/panel/blog/ArticlesManager";

export const metadata: Metadata = { title: "مقاله‌های مجله" };

export default function Page() {
  return <ArticlesManager />;
}
