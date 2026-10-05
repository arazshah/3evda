import type { Metadata } from "next";
import { SampleContentManager } from "@/components/panel/SampleContentManager";

export const metadata: Metadata = { title: "محتوای نمونه" };

export default function Page() {
  return <SampleContentManager />;
}
