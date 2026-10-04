import type { components } from "@/lib/api/schema";
import { get } from "./fresh";

export type PublicGallery = components["schemas"]["PublicGallery"];

/** The gallery behind a link, or null for any link that is not currently valid (all look the same). */
export async function getGallery(token: string): Promise<PublicGallery | null> {
  const res = await get(`/api/public/galleries/${encodeURIComponent(token)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`gallery → ${res.status}`);
  return (await res.json()) as PublicGallery;
}
