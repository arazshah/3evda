import { jsonLdScript } from "@/lib/site/seo";

/** Structured data for search engines; serialised so the data cannot close the script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}
