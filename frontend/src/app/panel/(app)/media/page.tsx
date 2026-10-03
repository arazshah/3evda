import type { Metadata } from "next";
import { Suspense } from "react";
import { MediaLibrary } from "@/components/panel/MediaLibrary";

export const metadata: Metadata = { title: "کتابخانه رسانه" };

export default function MediaPage() {
  return (
    <Suspense>
      <MediaLibrary />
    </Suspense>
  );
}
