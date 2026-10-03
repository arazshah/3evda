import { revalidateTag } from "next/cache";
import { TAGS } from "@/lib/site/api";

const API = process.env.INTERNAL_API_URL ?? "http://localhost:8000";
const ALLOWED = new Set<string>(Object.values(TAGS));

/**
 * Called by the panel after a save so the public pages show the change immediately instead of
 * after the 30 s cache window. Only a fully verified owner session may call it.
 */
export async function POST(request: Request) {
  // A cross-site form cannot send JSON without a CORS preflight, which this route never answers.
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    return Response.json({ code: "unsupported_media_type", detail: "JSON required" }, { status: 415 });
  }

  let verified = false;
  try {
    const me = await fetch(`${API}/api/auth/me`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    verified = me.ok && ((await me.json()) as { state?: string }).state === "verified";
  } catch {
    return Response.json({ code: "api_unavailable", detail: "API unavailable" }, { status: 502 });
  }
  if (!verified)
    return Response.json({ code: "not_authenticated", detail: "Sign in first" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { tags?: unknown } | null;
  const requested = Array.isArray(body?.tags) ? body.tags : [];
  const tags = requested.filter((t): t is string => typeof t === "string" && ALLOWED.has(t));
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tags });
}
