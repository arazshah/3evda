import type { Locale } from "@/i18n/config";
import type { Media } from "./types";
import { pick } from "./text";

const WIDTH_NAME = /^w\d+$/;

function byFormat(media: Media, format: string) {
  return media.variants
    .filter((v) => WIDTH_NAME.test(v.name) && v.format === format)
    .sort((a, b) => a.width - b.width);
}

export function srcSet(media: Media, format: string): string {
  return byFormat(media, format)
    .map((v) => `${v.url} ${v.width}w`)
    .join(", ");
}

/** The largest webp, used as the plain `src` fallback and for social cards. */
export function fallbackSrc(media: Media): string {
  const list = byFormat(media, "webp");
  return (list.at(-1) ?? media.variants.find((v) => WIDTH_NAME.test(v.name)))?.url ?? "";
}

export function altText(media: Media, locale: Locale, fallback = ""): string {
  return pick(locale, media.alt_fa, media.alt_en) || fallback;
}
