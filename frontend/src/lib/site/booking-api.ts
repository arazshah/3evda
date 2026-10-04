import type { components } from "@/lib/api/schema";
import { get, json } from "./fresh";

export type BookingOptions = components["schemas"]["PublicOptions"];
export type PublicBooking = components["schemas"]["PublicBooking"];

export function getBookingOptions(): Promise<BookingOptions> {
  return json<BookingOptions>("/api/public/booking/options");
}

/** The booking behind a link, or null for any link that is not valid (all look the same). */
export async function getBooking(token: string): Promise<PublicBooking | null> {
  const res = await get(`/api/public/bookings/${encodeURIComponent(token)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`booking → ${res.status}`);
  return (await res.json()) as PublicBooking;
}
