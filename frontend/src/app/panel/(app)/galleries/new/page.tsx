import type { Metadata } from "next";
import { NewGalleryPage } from "@/components/panel/galleries/NewGallery";

export const metadata: Metadata = { title: "گالری جدید" };

export default function Page() {
  return <NewGalleryPage />;
}
