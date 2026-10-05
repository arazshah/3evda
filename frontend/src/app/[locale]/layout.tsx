import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { directionOf } from "@/i18n/config";
import { routing } from "@/i18n/routing";
import { splashPending } from "@/lib/splash.server";
import { themeAttribute } from "@/lib/theme.server";
import "../globals.css";

// Preloading the Persian faces lets them arrive before first paint, which removes the layout
// shift caused by the fallback font being swapped for Vazirmatn (the same files globals.css uses).
const PERSIAN_FONTS = [
  new URL(
    "../../../node_modules/@fontsource/vazirmatn/files/vazirmatn-arabic-400-normal.woff2",
    import.meta.url,
  ),
];

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

  return (
    <html lang={locale} dir={directionOf(locale)} data-theme={theme} data-splash={splash ? "on" : undefined}>
      <head>
        {/^[A-Za-z0-9_-]{1,64}$/.test(requestId) ? <meta name="request-id" content={requestId} /> : null}
        {(locale === "fa" ? PERSIAN_FONTS : LATIN_FONTS).map((url) => (
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
