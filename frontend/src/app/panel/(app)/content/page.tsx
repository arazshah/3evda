import type { Metadata } from "next";
import { ContentBlocks } from "@/components/panel/ContentBlocks";

export const metadata: Metadata = { title: "متن‌ها و تصاویر" };

export default function ContentPage() {
  return <ContentBlocks />;
}
