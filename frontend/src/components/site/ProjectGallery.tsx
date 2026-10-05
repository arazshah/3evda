"use client";

import type { Locale } from "@/i18n/config";
import { altText, fallbackSrc, videoSrc } from "@/lib/site/media";
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
    video: videoSrc(img.media) || undefined,
    width: img.media.width,
    height: img.media.height,
    alt: localized(locale, img, "caption") || altText(img.media, locale),
  }));

  return (
    <LightboxGallery images={items} labels={labels}>
      {(open) => (
        // Columns keep every photo at its own proportions (nothing is cropped), like a contact sheet.
        <ul aria-label={labels.gallery} className="columns-1 gap-1.5 sm:columns-2 lg:columns-3">
          {images.map((img, i) => (
            <li key={img.media.id} className="mb-1.5 break-inside-avoid">
              <button
                type="button"
                onClick={() => open(i)}
                aria-label={items[i]!.alt || `${labels.dialog} ${i + 1}`}
                className="group relative block w-full cursor-zoom-in overflow-hidden bg-elevated"
              >
                {img.media.kind === "video" ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 z-10 m-auto flex size-14 items-center justify-center rounded-full bg-ink/70 text-2xl text-on-ink"
                  >
                    ▶
                  </span>
                ) : null}
                <Photo
                  media={img.media}
                  locale={locale}
                  alt={items[i]!.alt}
                  sizes="(min-width: 640px) 50vw, 100vw"
                  className="w-full transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </LightboxGallery>
  );
}
