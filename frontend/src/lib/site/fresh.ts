import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";

const BASE = process.env.INTERNAL_API_URL ?? "http://localhost:8000";

/**
 * Reads from the public API without any cache on this side. Used where data must be current at the
 * moment of the request (a scheduled article, the calculator's options); the API caches for itself.
 */
export async function get(path: string): Promise<Response> {
  await connection();
  // The API tells visitors apart by the address its trusted proxies recorded. This request comes from the web
  // container, so without the visitor's own forwarding chain every page view would count against one shared rate
  // limit, and a flood of made-up links could lock everybody out of their private pages.
  const forwarded = (await headers()).get("x-forwarded-for");
  try {
    return await fetch(`${BASE}${path}`, {
      cache: "no-store",
      redirect: "manual",
      headers: forwarded ? { "X-Forwarded-For": forwarded } : undefined,
    });
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
