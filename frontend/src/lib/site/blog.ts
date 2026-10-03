/**
 * Where the language switch of a category or tag page should go. The same filter only exists in the
 * other language if it has a published article there (otherwise that page is a 404), so fall back to
 * the journal index.
 */
export function switchPathFor(base: string, otherLanguageItems: { slug: string }[], slug: string): string {
  return otherLanguageItems.some((item) => item.slug === slug) ? base : "/blog";
}
