/** One entry of the panel menu. The extra fields decide when it counts as the current page. */
export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Pages under this prefix highlight the item (defaults to the href itself). */
  prefix?: string;
  /** The item is highlighted only on exactly this path. */
  exact?: boolean;
  /** Paths under `prefix` that belong to another item. */
  except?: string;
};
export type NavGroup = { title: string; items: NavItem[] };

// Stroke icons on a 24×24 grid (one path each), drawn here so the panel needs no icon package.
const I = {
  home: "M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10",
  inbox: "M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z",
  doc: "M7 3h8l4 4v14H7zM14 3v5h5M10 13h6M10 17h6",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5",
  camera: "M4 8h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  text: "M5 6h14M12 6v13M9 19h6",
  layers: "M12 3 3 8l9 5 9-5zM3 13l9 5 9-5",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  folder: "M3 6h7l2 2h9v11H3z",
  pen: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  tag: "M3 12V3h9l9 9-9 9zM7.5 7.5h.01",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9 9.5C9 8.5 10 8 12 8s3 .8 3 1.8c0 2.2-6 1.2-6 3.4 0 1 1 1.8 3 1.8s3-.5 3-1.5",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12l2-1.5-2-3.5-2.3.8-1.7-1-.5-2.3h-4l-.5 2.3-1.7 1-2.3-.8-2 3.5L5 12l-.2 1.5L3 15l2 3.5 2.3-.8 1.7 1 .5 2.3h4l.5-2.3 1.7-1 2.3.8 2-3.5L19 13.5z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5h.01",
  sparkle:
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  archive: "M3 5h18v4H3zM5 9v11h14V9M10 13h4",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
} as const;
export type IconName = keyof typeof I;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d={I[name]} />
    </svg>
  );
}

const item = (href: string, label: string, icon: IconName, extra: Partial<NavItem> = {}): NavItem => ({
  href,
  label,
  icon,
  ...extra,
});

export const NAV_GROUPS: NavGroup[] = [
  { title: "نمای کلی", items: [item("/panel", "داشبورد", "home", { exact: true })] },
  {
    title: "مشتریان و کارها",
    items: [
      item("/panel/inquiries", "استعلام‌ها", "inbox"),
      item("/panel/proformas", "پیش‌فاکتورها", "doc"),
      item("/panel/booking", "رزروها", "calendar", { except: "/panel/booking/settings" }),
      item("/panel/galleries", "گالری‌های مشتری", "camera"),
    ],
  },
  {
    title: "محتوای سایت",
    items: [
      item("/panel/content", "متن‌ها و تصاویر", "text"),
      item("/panel/items", "بخش‌های تکرارشونده", "layers"),
      item("/panel/projects", "نمونه‌کارها", "grid"),
      item("/panel/categories", "دسته‌ها", "folder"),
      item("/panel/articles", "مقاله‌های مجله", "pen"),
      item("/panel/packages", "پکیج‌ها و قیمت‌ها", "tag"),
    ],
  },
  {
    title: "تنظیمات",
    items: [
      item("/panel/settings", "تنظیمات سایت", "gear"),
      item("/panel/pricing", "قواعد قیمت", "coin"),
      item("/panel/booking/settings", "تنظیمات رزرو", "clock"),
      item("/panel/watermark", "واترمارک", "drop"),
    ],
  },
  {
    title: "رسانه و سیستم",
    items: [
      item("/panel/media", "کتابخانه رسانه", "image"),
      item("/panel/sample-content", "محتوای نمونه", "sparkle"),
      item("/panel/retention", "نگهداری اطلاعات", "archive"),
      item("/panel/security", "امنیت", "shield"),
    ],
  },
];

export function isActive(entry: NavItem, pathname: string): boolean {
  if (entry.exact) return pathname === entry.href;
  const prefix = entry.prefix ?? entry.href;
  if (!pathname.startsWith(prefix)) return false;
  return !(entry.except && pathname.startsWith(entry.except));
}

/** The group and item of the page being shown, for the title strip above the content. */
export function currentNav(pathname: string): { group: string; label: string } | null {
  for (const group of NAV_GROUPS) {
    const found = group.items.find((entry) => isActive(entry, pathname));
    if (found) return { group: group.title, label: found.label };
  }
  return null;
}
