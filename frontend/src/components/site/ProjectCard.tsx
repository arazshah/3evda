import type { Locale } from "@/i18n/config";
import { Photo } from "./Photo";
import { href, localized, pick } from "@/lib/site/text";
import type { Project } from "@/lib/site/types";

/** A project as a portrait tile with its title below (used where projects are mentioned, e.g. under an article). */
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
  return (
    <a
      href={href(locale, `/portfolio/${project.slug}`)}
      data-cursor={pick(locale, "مشاهده", "View")}
      className="group block"
    >
      <span className="relative block aspect-[4/5] overflow-hidden bg-elevated">
        {project.cover ? (
          <Photo
            media={project.cover}
            locale={locale}
            alt=""
            priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="size-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
          />
        ) : null}
      </span>
      <span className="font-display mt-3 block text-xl leading-tight">{title}</span>
    </a>
  );
}
