/**
 * The Content-Security-Policy of every page. Scripts need the request's own nonce (or are loaded by a script that
 * has it), so injected markup cannot run; `style` attributes are allowed because React and the layout use them
 * (an image's reserved shape), but `<style>` elements and every script are not.
 */
export function buildCsp({
  nonce,
  dev = false,
  upgradeInsecure = !dev,
}: {
  nonce: string;
  dev?: boolean;
  upgradeInsecure?: boolean;
}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // React's development build needs eval for stack traces; production never does.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", `'nonce-${nonce}'`],
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "media-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (upgradeInsecure) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** `CSP_REPORT_ONLY=true` only reports violations: a way back that needs no code change (Coolify's variables). */
export function cspHeaderName(reportOnly: boolean): string {
  return reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

/** A fresh, unguessable nonce for one request. */
export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
