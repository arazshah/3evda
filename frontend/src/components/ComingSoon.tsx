import { useLocale, useTranslations } from "next-intl";

const INSTAGRAM_URL = "https://www.instagram.com/3evda.r/";

export function ComingSoon() {
  const t = useTranslations("comingSoon");
  const locale = useLocale();
  const otherLocaleHref = locale === "fa" ? "/en" : "/";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="text-sm tracking-widest text-accent">{t("eyebrow")}</p>
      <h1 className="text-4xl font-extrabold sm:text-6xl">{t("name")}</h1>
      <p className="max-w-prose text-lg text-muted">{t("message")}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          className="inline-flex min-h-11 items-center rounded-brand bg-accent px-6 font-semibold text-bg hover:opacity-90"
          href={INSTAGRAM_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("instagram")}
        </a>
        <a
          className="inline-flex min-h-11 items-center rounded-brand border border-line px-6 hover:border-accent"
          href={otherLocaleHref}
          hrefLang={locale === "fa" ? "en" : "fa"}
        >
          {t("switchLanguage")}
        </a>
      </div>
    </main>
  );
}
