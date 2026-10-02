import createClient, { type Middleware } from "openapi-fetch";
import type { components, paths } from "./schema";

export type ApiError = { code: string; detail: string; fields?: Record<string, string[]> };
export type AuthState = components["schemas"]["State"];
export type MediaAsset = components["schemas"]["MediaAsset"];
export type WatermarkSetting = components["schemas"]["WatermarkSetting"];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/** Django rotates the CSRF token on login, so it is read from the cookie on every request. */
export const csrfMiddleware: Middleware = {
  onRequest({ request }) {
    if (!SAFE_METHODS.has(request.method)) {
      const token = readCookie("csrftoken");
      if (token) request.headers.set("X-CSRFToken", decodeURIComponent(token));
    }
    return request;
  },
};

export const api = createClient<paths>({
  baseUrl: typeof window === "undefined" ? "http://localhost" : window.location.origin,
  credentials: "same-origin",
});
api.use(csrfMiddleware);

export function errorMessage(error: unknown, fallback = "خطایی رخ داد؛ دوباره امتحان کنید."): string {
  if (error && typeof error === "object" && "detail" in error && typeof error.detail === "string") {
    return error.detail;
  }
  return fallback;
}
