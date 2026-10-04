import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];
export type GalleryPhoto = Schemas["PublicPhoto"];
export type GalleryPhotos = Schemas["PublicPhotos"];
export type GalleryZip = Schemas["ZipJob"];
export type GalleryFinal = Schemas["PublicFinal"];

/** A refusal from the gallery API: the status, and the machine-readable code when the body had one. */
export class GalleryApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

const HEADER = "X-Gallery-Token";

async function call<T>(
  base: string,
  path: string,
  options: { method?: string; body?: unknown; access?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.access) headers[HEADER] = options.access;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { code?: string } | null;
    throw new GalleryApiError(res.status, data?.code ?? "error");
  }
  return (await res.json()) as T;
}

/** Everything is addressed from the gallery's link; the access token (from `unlock`) travels in a header. */
export function galleryApi(linkToken: string) {
  const base = `/api/public/galleries/${encodeURIComponent(linkToken)}`;
  return {
    unlock: (password?: string) =>
      call<Schemas["UnlockResponse"]>(base, "/unlock", {
        method: "POST",
        body: password ? { password } : {},
      }),
    photos: (access: string) => call<GalleryPhotos>(base, "/photos", { access }),
    select: (
      access: string,
      photoId: number,
      change: { selected?: boolean; comment?: string; retouch?: boolean },
    ) =>
      call<Schemas["Selection"]>(base, `/photos/${photoId}/selection`, {
        method: "PUT",
        body: change,
        access,
      }),
    submit: (access: string) => call<Schemas["SubmitResponse"]>(base, "/submit", { method: "POST", access }),
    photoLink: (access: string, photoId: number) =>
      call<Schemas["DownloadLink"]>(base, `/photos/${photoId}/download`, { access }),
    startZip: (access: string) => call<GalleryZip>(base, "/zip", { method: "POST", access }),
    zip: (access: string, id: number) => call<GalleryZip>(base, `/zip/${id}`, { access }),
    finals: (access: string) => call<Schemas["PublicFinals"]>(base, "/finals", { access }),
    finalLink: (access: string, id: number) =>
      call<Schemas["DownloadLink"]>(base, `/finals/${id}/download`, { access }),
  };
}

/** Hand a short-lived signed address to the browser as a download (the server marks it «attachment»). */
export function startDownload(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const key = (linkToken: string) => `gallery-access:${linkToken}`;

export function storedAccess(linkToken: string): string | null {
  try {
    return window.sessionStorage.getItem(key(linkToken));
  } catch {
    return null; // storage can be blocked; the visitor simply unlocks again
  }
}

export function keepAccess(linkToken: string, access: string | null): void {
  try {
    if (access) window.sessionStorage.setItem(key(linkToken), access);
    else window.sessionStorage.removeItem(key(linkToken));
  } catch {
    // ignore
  }
}

export const REFRESH_MS = 20 * 60 * 1000; // previews are signed for an hour
