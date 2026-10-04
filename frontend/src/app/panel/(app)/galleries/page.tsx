import type { Metadata } from "next";
import { GalleriesManager } from "@/components/panel/galleries/GalleriesManager";

export const metadata: Metadata = { title: "گالری‌های مشتری" };

export default function Page() {
  return <GalleriesManager />;
}
