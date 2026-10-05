"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCreateGallery } from "@/lib/api/gallery-queries";
import { Card } from "../ui";
import { GalleryForm } from "./GalleryForm";

export function NewGalleryPage() {
  const router = useRouter();
  const create = useCreateGallery();
  return (
    <div className="flex flex-col gap-6">
      <Link href="/panel/galleries" className="inline-flex min-h-11 items-center text-accent hover:underline">
        ← همه‌ی گالری‌ها
      </Link>
      <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight">گالری جدید</h1>
      <Card>
        <GalleryForm
          submitLabel="ساخت گالری"
          onSubmit={async (input) => {
            const gallery = await create.mutateAsync(input);
            router.push(`/panel/galleries/${gallery.id}`);
          }}
        />
      </Card>
      <p className="text-sm text-muted">بعد از ساخت، عکس‌ها را آپلود و گالری را منتشر کنید.</p>
    </div>
  );
}
