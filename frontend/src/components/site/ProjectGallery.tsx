"use client";

import type { Locale } from "@/i18n/config";
import { altText, fallbackSrc } from "@/lib/site/media";
import { localized } from "@/lib/site/text";
import type { ProjectDetail } from "@/lib/site/types";
import { Photo } from "./Photo";
import { LightboxGallery, type LightboxImage } from "./Lightbox";

type Labels = { gallery: string; dialog: string; close: string; previous: string; next: string };

export function ProjectGallery({
  images,
  locale,
  labels,
}: {
  images: ProjectDetail["images"];
  locale: Locale;
  labels: Labels;
}) {
  const items: LightboxImage[] = images.map((img) => ({
    src: fallbackSrc(img.media),
    width: img.media.width,
    height: img.media.height,
    alt: localized(locale, img, "caption") || altText(img.media, locale),
  }));

  return (
    <LightboxGallery images={items} labels={labels}>
      {(open) => (
        <ul aria-label={labels.gallery} className="grid gap-3 sm:grid-cols-2">
          {images.map((img, i) => (
            <li key={img.media.id}>
              <button
                type="button"
                onClick={() => open(i)}
                aria-label={items[i]!.alt || `${labels.dialog} ${i + 1}`}
                className="block w-full overflow-hidden rounded-brand"
              >
                <Photo
                  media={img.media}
                  locale={locale}
                  alt={items[i]!.alt}
                  sizes="(min-width: 640px) 50vw, 100vw"
                  className="w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </LightboxGallery>
  );
}
