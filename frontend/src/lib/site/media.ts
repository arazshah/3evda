import type { Locale } from "@/i18n/config";
import type { Media } from "./types";
import { pick } from "./text";

const IMAGE_NAME = /^w\d+$/;
const POSTER_NAME = /^poster-w\d+$/;

/** Still renditions: the photo itself, or the poster frame for a video. */
function stillName(media: Media) {
  return media.kind === "video" ? POSTER_NAME : IMAGE_NAME;
}

function byFormat(media: Media, format: string) {
  return media.variants
    .filter((v) => stillName(media).test(v.name) && v.format === format)
    .sort((a, b) => a.width - b.width);
}

export function srcSet(media: Media, format: string): string {
  return byFormat(media, format)
    .map((v) => `${v.url} ${v.width}w`)
    .join(", ");
}

/** The largest webp, used as the plain `src` fallback and for social cards. */
export function fallbackVariant(media: Media) {
  const list = byFormat(media, "webp");
  return list.at(-1) ?? media.variants.find((v) => stillName(media).test(v.name));
}

export function fallbackSrc(media: Media): string {
  return fallbackVariant(media)?.url ?? "";
}

export function altText(media: Media, locale: Locale, fallback = ""): string {
  return pick(locale, media.alt_fa, media.alt_en) || fallback;
}

/** The playable file of a video asset ("" for images). */
export function videoSrc(media: Media): string {
  return media.kind === "video" ? (media.variants.find((v) => v.name === "video")?.url ?? "") : "";
}
