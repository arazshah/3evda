import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProjectGallery } from "@/components/site/ProjectGallery";
import { PageTitle } from "@/components/site/Section";
import { SitePage } from "@/components/site/SitePage";
import { getProject, getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { href, localized } from "@/lib/site/text";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await localeOf(params);
  const { slug } = await params;
  const [site, project] = await Promise.all([getSite(), getProject(slug)]);
  return pageMetadata(
    site,
    locale,
    `/portfolio/${slug}`,
    localized(locale, project, "title"),
    localized(locale, project, "summary"),
    project.cover,
  );
}

export default async function ProjectPage({ params }: Props) {
  const locale = await localeOf(params);
  const { slug } = await params;
  const [site, project, t] = await Promise.all([
    getSite(),
    getProject(slug),
    getTranslations({ locale, namespace: "site" }),
  ]);
  const client = localized(locale, project, "client");
  const body = localized(locale, project, "body");

  return (
    <SitePage site={site} locale={locale} path={`/portfolio/${slug}`}>
      <PageTitle title={localized(locale, project, "title")} intro={localized(locale, project, "summary")} />
      <dl className="mx-auto mt-6 flex max-w-6xl flex-wrap gap-x-10 gap-y-2 px-4 text-muted">
        {client ? (
          <div className="flex gap-2">
            <dt>{t("portfolio.client")}:</dt>
            <dd className="text-text">{client}</dd>
          </div>
        ) : null}
        {project.year ? (
          <div className="flex gap-2">
            <dt>{t("portfolio.year")}:</dt>
            <dd className="text-text">
              {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { useGrouping: false }).format(
                project.year,
              )}
            </dd>
          </div>
        ) : null}
      </dl>
      {body ? <p className="mx-auto mt-8 max-w-6xl whitespace-pre-line px-4 text-lg">{body}</p> : null}
      <div className="mx-auto max-w-6xl px-4 pt-10">
        <ProjectGallery
          images={project.images}
          locale={locale}
          labels={{
            gallery: t("portfolio.gallery"),
            dialog: t("portfolio.lightbox.dialog"),
            close: t("portfolio.lightbox.close"),
            previous: t("portfolio.lightbox.previous"),
            next: t("portfolio.lightbox.next"),
          }}
        />
      </div>
      <nav
        aria-label={t("portfolio.gallery")}
        className="mx-auto mt-12 flex max-w-6xl justify-between gap-4 px-4"
      >
        {project.previous ? (
          <a
            className="inline-flex min-h-11 items-center text-accent hover:underline"
            href={href(locale, `/portfolio/${project.previous}`)}
          >
            ← {t("portfolio.previous")}
          </a>
        ) : (
          <span />
        )}
        {project.next ? (
          <a
            className="inline-flex min-h-11 items-center text-accent hover:underline"
            href={href(locale, `/portfolio/${project.next}`)}
          >
            {t("portfolio.next")} →
          </a>
        ) : null}
      </nav>
    </SitePage>
  );
}
