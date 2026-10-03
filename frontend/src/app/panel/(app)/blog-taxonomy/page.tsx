import type { Metadata } from "next";
import { BlogTaxonomyManager } from "@/components/panel/blog/BlogTaxonomyManager";

export const metadata: Metadata = { title: "دسته‌ها و برچسب‌های مجله" };

export default function Page() {
  return <BlogTaxonomyManager />;
}
