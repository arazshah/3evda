import type { MediaAsset } from "@/lib/api/client";

export const STATUS_LABELS: Record<MediaAsset["status"], string> = {
  pending: "در صف",
  processing: "در حال پردازش",
  ready: "آماده",
  failed: "ناموفق",
};

/** Smallest web variant wide enough for `minWidth` (WebP preferred, poster for videos). */
export function previewUrl(asset: MediaAsset, minWidth = 480): string | undefined {
  const images = asset.variants
    .filter((v) => v.format === "webp" && (asset.kind === "image" || v.name.startsWith("poster-")))
    .sort((a, b) => a.width - b.width);
  return (images.find((v) => v.width >= minWidth) ?? images.at(-1))?.url;
}

export function videoUrl(asset: MediaAsset): string | undefined {
  return asset.variants.find((v) => v.name === "video")?.url;
}
