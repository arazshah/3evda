import type { Locale } from "@/i18n/config";
import { Photo } from "./Photo";
import { href, localized } from "@/lib/site/text";
import type { Project } from "@/lib/site/types";

export function ProjectCard({
  project,
  locale,
  priority = false,
}: {
  project: Project;
  locale: Locale;
  priority?: boolean;
}) {
  const title = localized(locale, project, "title");
  const ratio =
    project.cover?.width && project.cover?.height ? project.cover.width / project.cover.height : 1.5;
  return (
    <a
      href={href(locale, `/portfolio/${project.slug}`)}
      // Justified rows: each tile grows in proportion to its aspect ratio.
      style={{ flexGrow: ratio * 100, flexBasis: `${ratio * 14}rem` }}
      className="group relative block overflow-hidden rounded-brand bg-elevated"
    >
      {project.cover ? (
        <Photo
          media={project.cover}
          locale={locale}
          alt=""
          priority={priority}
          sizes="(min-width: 1024px) 33vw, 100vw"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="aspect-[3/2]" />
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/90 to-transparent p-4 pt-10 font-semibold">
        {title}
      </span>
    </a>
  );
}
