import { readCookie, type ApiError } from "./api/client";

export type WatermarkLook = {
  enabled: boolean;
  text: string;
  opacity: number;
  position: string;
  size_ratio: number;
};

/** A made-up photo stamped by the server with these (unsaved) settings: the very code that stamps real photos. */
export async function fetchWatermarkPreview(look: WatermarkLook, signal?: AbortSignal): Promise<Blob> {
  const token = readCookie("csrftoken");
  const response = await fetch("/api/admin/settings/watermark/preview", {
    method: "POST",
    credentials: "include",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-CSRFToken": decodeURIComponent(token) } : {}),
    },
    body: JSON.stringify(look),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw body ?? ({ code: "http_error", detail: `خطای ${response.status}` } satisfies ApiError);
  }
  return response.blob();
}
