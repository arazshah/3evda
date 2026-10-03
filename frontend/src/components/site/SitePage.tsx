import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import type { SiteData } from "@/lib/site/types";

/** Shared frame of every public page: skip link, header, main landmark and footer. */
export async function SitePage({
  site,
  locale,
  path,
  children,
}: {
  site: SiteData;
  locale: Locale;
  path: string;
  children: ReactNode;
}) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "site" });
  const nav = {
    home: t("nav.home"),
    portfolio: t("nav.portfolio"),
    services: t("nav.services"),
    packages: t("nav.packages"),
    about: t("nav.about"),
    contact: t("nav.contact"),
    menu: t("nav.menu"),
    switchLanguage: t("nav.switchLanguage"),
    quote: t("nav.quote"),
  };
  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-brand focus:bg-accent focus:px-4 focus:py-2 focus:text-bg"
      >
        {t("common.skip")}
      </a>
      <SiteHeader site={site} locale={locale} labels={nav} currentPath={path} />
      <main id="content">{children}</main>
      <SiteFooter
        site={site}
        locale={locale}
        labels={{
          instagram: t("footer.instagram"),
          telegram: t("footer.telegram"),
          whatsapp: t("footer.whatsapp"),
        }}
      />
    </>
  );
}
