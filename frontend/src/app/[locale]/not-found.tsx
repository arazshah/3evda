import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-6xl font-extrabold text-accent">404</p>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <a className="text-accent underline-offset-4 hover:underline" href={t("homeHref")}>
        {t("home")}
      </a>
    </main>
  );
}
