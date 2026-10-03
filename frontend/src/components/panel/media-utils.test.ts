import { describe, expect, it } from "vitest";
import type { MediaAsset } from "@/lib/api/client";
import { previewUrl, videoUrl } from "./media-utils";

const base = {
  id: "1",
  status: "ready",
  original_filename: "a.jpg",
  mime: "image/jpeg",
  size_bytes: 1,
  width: 3000,
  height: 2000,
  duration_seconds: null,
  lqip: "",
  watermarked: false,
  error: "",
  usage_count: 0,
  created_at: "",
  updated_at: "",
} as const;

const v = (name: string, format: string, width: number) => ({
  name,
  format,
  width,
  height: 1,
  size_bytes: 1,
  url: `/media/${name}.${format}`,
});

describe("previewUrl", () => {
  it("picks the smallest WebP at least as wide as requested", () => {
    const asset = {
      ...base,
      kind: "image",
      variants: [
        v("w2400", "webp", 2400),
        v("w480", "avif", 480),
        v("w960", "webp", 960),
        v("w480", "webp", 480),
      ],
    } as MediaAsset;
    expect(previewUrl(asset)).toBe("/media/w480.webp");
    expect(previewUrl(asset, 900)).toBe("/media/w960.webp");
    expect(previewUrl(asset, 5000)).toBe("/media/w2400.webp");
  });

  it("uses the poster for videos and finds the video file", () => {
    const asset = {
      ...base,
      kind: "video",
      variants: [v("video", "mp4", 320), v("poster-w320", "webp", 320)],
    } as MediaAsset;
    expect(previewUrl(asset)).toBe("/media/poster-w320.webp");
    expect(videoUrl(asset)).toBe("/media/video.mp4");
  });

  it("returns undefined while nothing has been processed", () => {
    expect(previewUrl({ ...base, kind: "image", variants: [] } as MediaAsset)).toBeUndefined();
  });
});
