/**
 * Exact sizes for every picture slot of the site, in the owner's words. One table feeds the hint under each picker
 * and the guide in the site settings, so they cannot disagree. The numbers come from the real layouts (aspect
 * ratios in components/site) and from the renditions the media pipeline makes (480, 960, 1600 and 2400 px wide):
 * a bigger original only costs upload time; a smaller one looks soft on large screens.
 */
export type ImageSpecKey =
  | "hero"
  | "service"
  | "project_cover"
  | "project_image"
  | "category"
  | "intro"
  | "about"
  | "behind"
  | "client"
  | "article_cover"
  | "share"
  | "logo"
  | "watermark";

export type ImageSpec = {
  title: string;
  /** Where visitors see it. */
  where: string;
  /** Recommended pixels of the original; `height` is null when any ratio works. */
  width: number;
  height: number | null;
  /** Short ratio label, e.g. «۱۶:۹». */
  ratio: string;
  format: string;
  note: string;
};

const PHOTO = "JPEG یا WebP";
const TRANSPARENT = "PNG یا WebP با پس‌زمینه‌ی شفاف";

export const IMAGE_SPECS: Record<ImageSpecKey, ImageSpec> = {
  hero: {
    title: "اسلاید صفحه‌ی اول",
    where: "پس‌زمینه‌ی تمام‌عرض بالای صفحه‌ی خانه",
    width: 2400,
    height: 1350,
    ratio: "۱۶:۹ افقی",
    format: PHOTO,
    note: "سوژه را وسط و در دوسوم بالایی بگذارید: متن روی بخش پایین می‌آید و در موبایل دو طرف عکس بریده می‌شود.",
  },
  service: {
    title: "عکس خدمت",
    where: "کنار فهرست خدمات (صفحه‌ی خانه و خدمات)",
    width: 1600,
    height: 2000,
    ratio: "۴:۵ عمودی",
    format: PHOTO,
    note: "در صفحه‌ی خدمات کمی از بالا و پایین بریده می‌شود؛ سوژه را وسط بگذارید.",
  },
  project_cover: {
    title: "تصویر شاخص نمونه‌کار",
    where: "کاشی‌های نمونه‌کار، ریل صفحه‌ی خانه و بالای صفحه‌ی خود پروژه",
    width: 1600,
    height: 2000,
    ratio: "۴:۵ عمودی",
    format: PHOTO,
    note: "از وسط بریده می‌شود (در بالای صفحه‌ی پروژه افقی دیده می‌شود)؛ سوژه را وسط بگذارید.",
  },
  project_image: {
    title: "تصاویر داخل پروژه",
    where: "گالری صفحه‌ی پروژه و نمایش بزرگ",
    width: 2400,
    height: null,
    ratio: "هر نسبتی",
    format: PHOTO,
    note: "با همان نسبت اصلی نمایش داده می‌شود (بدون برش)؛ ضلع بلند دست‌کم ۲۴۰۰ پیکسل.",
  },
  category: {
    title: "تصویر دسته",
    where: "کاشی دسته‌ها در صفحه‌ی خانه",
    width: 1600,
    height: 2000,
    ratio: "۴:۵ عمودی",
    format: PHOTO,
    note: "از وسط بریده می‌شود.",
  },
  intro: {
    title: "تصویر معرفی",
    where: "کنار متن معرفی در صفحه‌ی خانه",
    width: 1600,
    height: 2000,
    ratio: "۴:۵ عمودی",
    format: PHOTO,
    note: "پرتره یا عکس شاخص برند؛ از وسط بریده می‌شود.",
  },
  about: {
    title: "عکس «درباره‌ی من»",
    where: "صفحه‌ی درباره",
    width: 1600,
    height: 2000,
    ratio: "۴:۵ عمودی",
    format: PHOTO,
    note: "پرتره‌ی بزرگ کنار متن؛ صورت را در نیمه‌ی بالایی بگذارید.",
  },
  behind: {
    title: "پشت صحنه",
    where: "شبکه‌ی مربعی «پشت صحنه» در صفحه‌ی خانه",
    width: 1200,
    height: 1200,
    ratio: "۱:۱ مربع",
    format: PHOTO,
    note: "از وسط به مربع بریده می‌شود.",
  },
  client: {
    title: "لوگوی مشتری",
    where: "ردیف مشتریان در صفحه‌ی خانه",
    width: 640,
    height: 192,
    ratio: "تقریباً ۱۰:۳ افقی",
    format: TRANSPARENT,
    note: "با ارتفاع ۴۸ پیکسل نمایش داده می‌شود؛ لوگو را با کمی حاشیه و ارتفاع دست‌کم ۱۹۲ پیکسل بدهید. بدون لوگو، نام برند نوشته می‌شود.",
  },
  article_cover: {
    title: "کاور مقاله",
    where: "کارت مقاله در فهرست مجله و بالای خود مقاله",
    width: 1600,
    height: 1067,
    ratio: "۳:۲ افقی",
    format: PHOTO,
    note: "در کارت‌ها از وسط به ۳:۲ بریده می‌شود.",
  },
  share: {
    title: "تصویر اشتراک‌گذاری",
    where: "پیش‌نمایش لینک در تلگرام، واتساپ، اینستاگرام و گوگل",
    width: 1200,
    height: 630,
    ratio: "۱٫۹:۱ افقی",
    format: PHOTO,
    note: "نوشته‌های مهم را از لبه‌ها دور نگه دارید؛ پیام‌رسان‌ها بخشی از لبه‌ها را می‌برند.",
  },
  logo: {
    title: "لوگوی سایت",
    where: "بالای همه‌ی صفحه‌ها (جای نام برند)",
    width: 600,
    height: 200,
    ratio: "۳:۱ افقی",
    format: TRANSPARENT,
    note: "با ارتفاع ۳۶ پیکسل نمایش داده می‌شود؛ بدون لوگو، نام برند نوشته می‌شود.",
  },
  watermark: {
    title: "لوگوی واترمارک",
    where: "روی پیش‌نمایش گالری‌ها و نسخه‌ی عمومی عکس‌ها",
    width: 800,
    height: null,
    ratio: "هر نسبتی",
    format: TRANSPARENT,
    note: "لوگوی ساده و خوانا؛ روی عکس‌های روشن و تیره هر دو دیده شود.",
  },
};

export const IMAGE_SPEC_ORDER = Object.keys(IMAGE_SPECS) as ImageSpecKey[];

/** Limits that hold for every upload (the server refuses more). */
export const UPLOAD_LIMITS = "تا ۵۰ مگابایت برای عکس و ۱۰۰ مگابایت برای ویدیو";

/** «۲۴۰۰×۱۳۵۰ پیکسل» or «ضلع بلند ۲۴۰۰ پیکسل». */
export function sizeLabel(spec: ImageSpec): string {
  return spec.height ? `${spec.width}×${spec.height} پیکسل` : `ضلع بلند ${spec.width} پیکسل`;
}

/** Which slot a content block fills (by the block key in apps/cms/blocks.py). */
export const BLOCK_SPEC: Record<string, ImageSpecKey> = {
  "home.intro_image": "intro",
  "about.photo": "about",
};
