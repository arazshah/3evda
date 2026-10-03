"use client";

import { useCallback, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";

export type LightboxImage = { src: string; width: number | null; height: number | null; alt: string };

/** A grid of thumbnails that open a full-screen viewer with previous/next and arrow-key navigation. */
export function LightboxGallery({
  images,
  labels,
  children,
}: {
  images: LightboxImage[];
  labels: { dialog: string; close: string; previous: string; next: string };
  children: (open: (index: number) => void) => React.ReactNode;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const close = useCallback(() => setIndex(null), []);
  const move = useCallback(
    (delta: number) => setIndex((i) => (i === null ? i : (i + delta + images.length) % images.length)),
    [images.length],
  );
  const current = index === null ? null : images[index];

  return (
    <>
      {children(setIndex)}
      <Dialog open={current !== null} onClose={close} label={labels.dialog} closeLabel={labels.close}>
        {current ? (
          <div
            onKeyDown={(e) => {
              // Arrow keys follow the visual direction, which flips with the document direction.
              const rtl = document.documentElement.dir === "rtl";
              if (e.key === "ArrowRight") move(rtl ? -1 : 1);
              if (e.key === "ArrowLeft") move(rtl ? 1 : -1);
            }}
            className="flex h-dvh w-dvw items-center justify-center p-4"
          >
            {images.length > 1 ? (
              <button
                type="button"
                aria-label={labels.previous}
                onClick={() => move(-1)}
                className="absolute start-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-bg/80 text-xl hover:bg-bg rtl:rotate-180"
              >
                ‹
              </button>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element -- pipeline rendition */}
            <img src={current.src} alt={current.alt} className="max-h-full max-w-full object-contain" />
            {images.length > 1 ? (
              <button
                type="button"
                aria-label={labels.next}
                onClick={() => move(1)}
                className="absolute end-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-bg/80 text-xl hover:bg-bg rtl:rotate-180"
              >
                ›
              </button>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
