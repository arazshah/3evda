import type { Locale } from "@/i18n/config";
import { altText, fallbackSrc, srcSet } from "@/lib/site/media";
import type { Media } from "@/lib/site/types";

/** Responsive photo from the media pipeline: AVIF with a WebP fallback and a blurred placeholder. */
export function Photo({
  media,
  locale,
  sizes,
  alt,
  priority = false,
  className = "",
}: {
  media: Media;
  locale: Locale;
  sizes: string;
  alt?: string;
  priority?: boolean;
  className?: string;
}) {
  const avif = srcSet(media, "avif");
  const webp = srcSet(media, "webp");
  return (
    <picture>
      {avif ? <source type="image/avif" srcSet={avif} sizes={sizes} /> : null}
      <img
        src={fallbackSrc(media)}
        srcSet={webp || undefined}
        sizes={sizes}
        width={media.width ?? undefined}
        height={media.height ?? undefined}
        alt={alt ?? altText(media, locale)}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        style={media.lqip ? { backgroundImage: `url(${media.lqip})`, backgroundSize: "cover" } : undefined}
        className={`bg-elevated ${className}`.trim()}
      />
    </picture>
  );
}
