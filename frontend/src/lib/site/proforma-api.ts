import type { components } from "@/lib/api/schema";
import { get } from "./fresh";

export type PublicProforma = components["schemas"]["PublicProforma"];

/** The proforma behind a link, or null for any link that is not currently valid (all look the same). */
export async function getProforma(token: string): Promise<PublicProforma | null> {
  const res = await get(`/api/public/proformas/${encodeURIComponent(token)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`proforma → ${res.status}`);
  return (await res.json()) as PublicProforma;
}
