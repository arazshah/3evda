/**
 * A slow ticker of words (clients and services) under the hero. The words are listed once for assistive technology
 * and once more, hidden from it, so the loop has no seam. Moves with transform only; under reduced motion it stops
 * and wraps into a normal row (see `.marquee` in globals.css).
 */
export function Marquee({ items, label }: { items: string[]; label: string }) {
  const words = items.filter(Boolean);
  if (words.length === 0) return null;
  const row = (hidden: boolean) => (
    <ul className="marquee-row" aria-hidden={hidden || undefined} role={hidden ? "presentation" : undefined}>
      {words.map((word, i) => (
        <li key={`${hidden}-${i}`} className="marquee-item font-display">
          {word}
          <span aria-hidden="true" className="marquee-dot">
            ✦
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label={label} className="marquee border-b border-line">
      <div className="marquee-track">
        {row(false)}
        {row(true)}
      </div>
    </section>
  );
}
