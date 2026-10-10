import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { directionOf } from "@/i18n/config";
import { routing } from "@/i18n/routing";
import { asFontKey, type FontKey } from "@/lib/fonts";
import { getSite } from "@/lib/site/api";
import { splashPending } from "@/lib/splash.server";
import { themeAttribute } from "@/lib/theme.server";
import "../globals.css";

// Preloading the Persian faces lets them arrive before first paint, which removes the layout
// shift caused by the fallback font being swapped for Vazirmatn (the same files globals.css uses).
const PERSIAN_FONT_FILES: Record<FontKey, URL> = {
  vazirmatn: new URL(
    "../../../node_modules/@fontsource/vazirmatn/files/vazirmatn-arabic-400-normal.woff2",
    import.meta.url,
  ),
  "noto-sans": new URL(
    "../../../node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2",
    import.meta.url,
  ),
  "ibm-plex": new URL(
    "../../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2",
    import.meta.url,
  ),
  cairo: new URL(
    "../../../node_modules/@fontsource/cairo/files/cairo-arabic-400-normal.woff2",
    import.meta.url,
  ),
  "noto-naskh": new URL(
    "../../../node_modules/@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-400-normal.woff2",
    import.meta.url,
  ),
  amiri: new URL(
    "../../../node_modules/@fontsource/amiri/files/amiri-arabic-400-normal.woff2",
    import.meta.url,
  ),
  harmattan: new URL(
    "../../../node_modules/@fontsource/harmattan/files/harmattan-arabic-400-normal.woff2",
    import.meta.url,
  ),
  almarai: new URL(
    "../../../node_modules/@fontsource/almarai/files/almarai-arabic-400-normal.woff2",
    import.meta.url,
  ),
  lalezar: new URL(
    "../../../node_modules/@fontsource/lalezar/files/lalezar-arabic-400-normal.woff2",
    import.meta.url,
  ),
};

// The same for the English faces: Manrope (body) and Bodoni Moda (headings) differ in metrics from the fallback,
// so letting them arrive late shifts the first screen.
const LATIN_FONTS = [
  new URL("../../../node_modules/@fontsource/manrope/files/manrope-latin-400-normal.woff2", import.meta.url),
  new URL(
    "../../../node_modules/@fontsource/bodoni-moda/files/bodoni-moda-latin-400-normal.woff2",
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
  // The page's scripts carry a nonce made for this request (see proxy.ts), so no page can be built ahead of time.
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // The gateway's id for this request: if the page fails, the visitor can quote it ("tracking code").
  const requestId = (await headers()).get("x-request-id") ?? "";
  const theme = await themeAttribute();
  const splash = await splashPending();

  // The Persian faces picked in the site settings. A failed read must not take the whole page down: the default face applies.
  const site = await getSite().catch(() => null);
  const bodyFont = asFontKey(site?.settings.font_fa_body);
  const headingFont = asFontKey(site?.settings.font_fa_heading);
  const persianPreload = [...new Set([bodyFont, headingFont])].map((k) => PERSIAN_FONT_FILES[k]);

  return (
    <html
      lang={locale}
      dir={directionOf(locale)}
      data-theme={theme}
      data-splash={splash ? "on" : undefined}
      data-fa-body={bodyFont}
      data-fa-heading={headingFont}
    >
      <head>
        {/^[A-Za-z0-9_-]{1,64}$/.test(requestId) ? <meta name="request-id" content={requestId} /> : null}
        {(locale === "fa" ? persianPreload : LATIN_FONTS).map((url) => (
          <link
            key={url.pathname}
            rel="preload"
            href={url.pathname}
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        ))}
      </head>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
