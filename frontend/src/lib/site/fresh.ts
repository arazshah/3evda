import { notFound } from "next/navigation";
import { connection } from "next/server";

const BASE = process.env.INTERNAL_API_URL ?? "http://localhost:8000";

/**
 * Reads from the public API without any cache on this side. Used where data must be current at the
 * moment of the request (a scheduled article, the calculator's options); the API caches for itself.
 */
export async function get(path: string): Promise<Response> {
  await connection();
  try {
    return await fetch(`${BASE}${path}`, { cache: "no-store", redirect: "manual" });
  } catch (error) {
    throw new Error(`Public API unavailable: ${String(error)}`);
  }
}

export async function json<T>(path: string): Promise<T> {
  const res = await get(path);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}
