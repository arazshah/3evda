import { describe, expect, it } from "vitest";
import { fallbackSrc, srcSet, videoSrc } from "./media";
import type { Media } from "./types";

const variant = (name: string, format: string, width: number) => ({
  name,
  format,
  url: `/media/${name}.${format}`,
  width,
  height: width,
  size_bytes: 1,
});

const base = { id: "1", width: 1, height: 1, duration_seconds: null, alt_fa: "", alt_en: "", lqip: "" };

describe("media helpers", () => {
  it("orders image renditions by width and falls back to the largest webp", () => {
    const m: Media = {
      ...base,
      kind: "image",
      variants: [variant("w960", "webp", 960), variant("w480", "webp", 480)],
    };
    expect(srcSet(m, "webp")).toBe("/media/w480.webp 480w, /media/w960.webp 960w");
    expect(fallbackSrc(m)).toBe("/media/w960.webp");
    expect(videoSrc(m)).toBe("");
  });

  it("uses the poster frames and the video file for a video asset", () => {
    const m: Media = {
      ...base,
      kind: "video",
      variants: [variant("poster-w960", "webp", 960), variant("video", "mp4", 1920)],
    };
    expect(fallbackSrc(m)).toBe("/media/poster-w960.webp");
    expect(videoSrc(m)).toBe("/media/video.mp4");
  });
});
