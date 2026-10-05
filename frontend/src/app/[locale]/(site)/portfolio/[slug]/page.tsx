import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/site/JsonLd";
import { ProjectGallery } from "@/components/site/ProjectGallery";
import { PageTitle, WIDE } from "@/components/site/Section";
import { Photo } from "@/components/site/Photo";
import { SitePage } from "@/components/site/SitePage";
import { getProject, getSite } from "@/lib/site/api";
import { localeOf, pageMetadata } from "@/lib/site/page";
import { breadcrumbLd, projectLd } from "@/lib/site/seo";
import { vtName } from "@/lib/site/transitions";
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
  const title = localized(locale, project, "title");
  const summary = localized(locale, project, "summary");
  const year = project.year
    ? new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { useGrouping: false }).format(project.year)
    : "";
  const facts = [
    client ? { label: t("portfolio.client"), value: client } : null,
    year ? { label: t("portfolio.year"), value: year } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);
  // With a cover the page opens on it, full-bleed, and the header floats over it; without one it opens plainly.
  const immersive = project.cover !== null;

  return (
    <SitePage site={site} locale={locale} path={`/portfolio/${slug}`} overlay={immersive}>
      <JsonLd
        data={[
          projectLd(locale, project, title),
          breadcrumbLd(locale, [
            { name: t("nav.portfolio"), path: "/portfolio" },
            { name: title, path: `/portfolio/${encodeURIComponent(project.slug)}` },
          ]),
        ]}
      />
      {immersive && project.cover ? (
        <section
          aria-label={title}
          className="relative isolate flex min-h-[28rem] items-end overflow-hidden bg-ink text-on-ink md:min-h-[min(80vh,46rem)]"
          style={vtName(`project-${project.slug}`)}
        >
          <div aria-hidden="true" className="absolute inset-0 -z-20">
            <Photo
              media={project.cover}
              locale={locale}
              alt=""
              priority
              sizes="100vw"
              className="hero-drift size-full object-cover"
            />
          </div>
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/85 via-ink/10 to-ink/50"
          />
          <div className={`${WIDE} hero-in pb-[clamp(1.75rem,4vw,3.5rem)] pt-40`}>
            <h1 className="font-display max-w-[18ch] text-[clamp(2.25rem,5.6vw,5rem)] leading-[0.95]">
              {title}
            </h1>
            {summary ? <p className="mt-5 max-w-[56ch] text-lg text-on-ink/85">{summary}</p> : null}
          </div>
        </section>
      ) : (
        <PageTitle title={title} intro={summary} />
      )}

      {facts.length || body ? (
        <section className={`${WIDE} grid gap-10 pt-[clamp(3rem,7vw,6rem)] md:grid-cols-[1fr_2fr] md:gap-20`}>
          {facts.length ? (
            <dl className="grid content-start gap-5 border-t border-text pt-4">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="eyebrow text-muted">{f.label}</dt>
                  <dd className="font-display mt-1 text-2xl">{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <span />
          )}
          {body ? (
            <p className="reveal max-w-[60ch] whitespace-pre-line text-lg leading-[1.9]">{body}</p>
          ) : null}
        </section>
      ) : null}

      <div className={`${WIDE} pt-[clamp(3rem,7vw,6rem)]`}>
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
        className={`${WIDE} mt-[clamp(3rem,7vw,6rem)] grid grid-cols-2 gap-4 border-t border-line pt-6`}
      >
        {project.previous ? (
          <a
            className="font-display group inline-flex min-h-11 items-center gap-3 text-[clamp(1.15rem,2.2vw,1.75rem)]"
            href={href(locale, `/portfolio/${project.previous}`)}
          >
            <span
              aria-hidden="true"
              className="transition-transform group-hover:-translate-x-1 rtl:rotate-180 rtl:group-hover:translate-x-1"
            >
              ←
            </span>
            {t("portfolio.previous")}
          </a>
        ) : (
          <span />
        )}
        {project.next ? (
          <a
            className="font-display group inline-flex min-h-11 items-center justify-end gap-3 text-[clamp(1.15rem,2.2vw,1.75rem)]"
            href={href(locale, `/portfolio/${project.next}`)}
          >
            {t("portfolio.next")}
            <span
              aria-hidden="true"
              className="transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
            >
              →
            </span>
          </a>
        ) : null}
      </nav>
    </SitePage>
  );
}
