import type { components } from "@/lib/api/schema";

type S = components["schemas"];

/** The Persian faces the owner can pick (kept in step with backend/apps/cms/fonts.py by the schema types). */
export type BodyFont = S["FontFaBodyEnum"];
export type HeadingFont = S["FontFaHeadingEnum"];
export type FontKey = HeadingFont;

export const DEFAULT_FONT: FontKey = "vazirmatn";

/** Name, CSS family and a short note for each face; the order is the order of the choices. */
export const FONTS: Record<FontKey, { label: string; family: string; note: string }> = {
  vazirmatn: { label: "وزیرمتن (پیش‌فرض)", family: "Vazirmatn", note: "مدرن و خوانا" },
  "noto-sans": { label: "نوتو سنس عربی", family: "Noto Sans Arabic", note: "ساده و خنثی" },
  "ibm-plex": { label: "آی‌بی‌ام پلکس عربی", family: "IBM Plex Sans Arabic", note: "فنی و مرتب" },
  cairo: { label: "قاهره", family: "Cairo", note: "گرد و دوستانه" },
  "noto-naskh": { label: "نوتو نسخ", family: "Noto Naskh Arabic", note: "کلاسیک، مناسب متن بلند" },
  amiri: { label: "امیری", family: "Amiri", note: "ادبی و ظریف" },
  harmattan: { label: "هارماتان", family: "Harmattan", note: "نرم و باریک" },
  almarai: { label: "المرعی", family: "Almarai", note: "تمیز و کشیده" },
  lalezar: { label: "لاله‌زار (فقط تیتر)", family: "Lalezar", note: "پررنگ و نمایشی" },
};

export const HEADING_FONT_KEYS = Object.keys(FONTS) as HeadingFont[];
/** A display face is too heavy for paragraphs, so it is offered for headings only. */
export const BODY_FONT_KEYS = HEADING_FONT_KEYS.filter((k): k is BodyFont => k !== "lalezar");

export function asFontKey(value: unknown): FontKey {
  return typeof value === "string" && value in FONTS ? (value as FontKey) : DEFAULT_FONT;
}
