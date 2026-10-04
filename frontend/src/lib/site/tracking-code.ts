/**
 * The code a visitor can send us when a page fails. It is the request id the gateway gave this request
 * (the same one written in the server's log lines), which the layout puts in a <meta> tag; when that is
 * not there, the error's own digest (also written in the log) is the next best thing.
 */
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

export function trackingCode(
  error: { digest?: string },
  doc: Pick<Document, "querySelector"> | null,
): string {
  const meta = doc?.querySelector('meta[name="request-id"]')?.getAttribute("content") ?? "";
  if (SAFE.test(meta)) return meta;
  return error.digest && SAFE.test(error.digest) ? error.digest : "";
}
