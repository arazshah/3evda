import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { directionOf } from "@/i18n/config";
import { routing } from "@/i18n/routing";
import "../globals.css";

// Preloading the Persian faces lets them arrive before first paint, which removes the layout
// shift caused by the fallback font being swapped for Vazirmatn (the same files globals.css uses).
const PERSIAN_FONTS = [
  new URL(
    "../../../node_modules/@fontsource/vazirmatn/files/vazirmatn-arabic-400-normal.woff2",
    import.meta.url,
  ),
  new URL(
    "../../../node_modules/@fontsource/vazirmatn/files/vazirmatn-arabic-600-normal.woff2",
    import.meta.url,
  ),
  new URL(
    "../../../node_modules/@fontsource/vazirmatn/files/vazirmatn-arabic-800-normal.woff2",
    import.meta.url,
  ),
];

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    // Canonical/hreflang/Open Graph URLs must be absolute; relative ones are ignored by crawlers.
    metadataBase: new URL(process.env.PUBLIC_URL ?? "http://localhost:3000"),
    title: t("title"),
    description: t("description"),
    alternates: { languages: { fa: "/", en: "/en" } },
    icons: { icon: "/favicon.svg" },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={directionOf(locale)}>
      <head>
        {locale === "fa"
          ? PERSIAN_FONTS.map((url) => (
              <link
                key={url.pathname}
                rel="preload"
                href={url.pathname}
                as="font"
                type="font/woff2"
                crossOrigin="anonymous"
              />
            ))
          : null}
      </head>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
