import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, cspHeaderName, makeNonce } from "@/lib/security/csp";

/**
 * Gives every page request its own CSP nonce. Next reads the nonce from the request's policy header and puts it on
 * the scripts it renders, which is why every page is rendered per request (see the root layouts).
 */
export function proxy(request: NextRequest) {
  const nonce = makeNonce();
  const policy = buildCsp({ nonce, dev: process.env.NODE_ENV === "development" });
  const name = cspHeaderName(process.env.CSP_REPORT_ONLY === "true");

  const headers = new Headers(request.headers);
  headers.set(name, policy);
  headers.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(name, policy);
  return response;
}

export const config = {
  // Pages only: the API, the stored files and Next's own assets are not documents.
  matcher: [
    {
      source:
        "/((?!api/|storage-signed/|media/|static/|django-admin/|_next/static|_next/image|health$|favicon.svg|.*\\.[^/]+$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
