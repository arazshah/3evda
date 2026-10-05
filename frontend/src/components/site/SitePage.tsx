import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { pick } from "@/lib/site/text";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { CursorLabel } from "./CursorLabel";
import { Splash } from "./Splash";
import type { SiteData } from "@/lib/site/types";

/** Shared frame of every public page: skip link, header, main landmark and footer. */
export async function SitePage({
  site,
  locale,
  path,
  switchPath,
  overlay = false,
  footerTop,
  children,
}: {
  site: SiteData;
  locale: Locale;
  path: string;
  switchPath?: string;
  /** The header floats over the first section (the home hero). */
  overlay?: boolean;
  /** Rendered at the top of the footer, in its dark area. */
  footerTop?: ReactNode;
  children: ReactNode;
}) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "site" });
  const nav = {
    home: t("nav.home"),
    portfolio: t("nav.portfolio"),
    blog: t("nav.blog"),
    services: t("nav.services"),
    packages: t("nav.packages"),
    about: t("nav.about"),
    contact: t("nav.contact"),
    menu: t("nav.menu"),
    menuOpen: t("common.menuOpen"),
    switchLanguage: t("nav.switchLanguage"),
    quote: t("nav.quote"),
  };
  const theme = {
    label: t("theme.label"),
    system: t("theme.system"),
    light: t("theme.light"),
    dark: t("theme.dark"),
  };
  return (
    <>
      <Splash
        brand={pick(locale, site.settings.brand_name_fa, site.settings.brand_name_en)}
        tagline={pick(locale, site.settings.tagline_fa, site.settings.tagline_en)}
      />
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-brand focus:bg-accent focus:px-4 focus:py-2 focus:text-bg"
      >
        {t("common.skip")}
      </a>
      <SiteHeader
        site={site}
        locale={locale}
        labels={nav}
        themeLabels={theme}
        currentPath={path}
        switchPath={switchPath}
        overlay={overlay}
      />
      <CursorLabel />
      <main id="content" className={overlay ? "relative" : ""}>
        {children}
      </main>
      <SiteFooter
        site={site}
        locale={locale}
        labels={{
          instagram: t("footer.instagram"),
          telegram: t("footer.telegram"),
          whatsapp: t("footer.whatsapp"),
          book: t("nav.book"),
        }}
      >
        {footerTop}
      </SiteFooter>
    </>
  );
}
