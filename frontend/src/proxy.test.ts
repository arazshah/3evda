import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

afterEach(() => vi.unstubAllEnvs());

const run = () => proxy(new NextRequest("https://3evda.com/about"));
const nonceOf = (policy: string) => /'nonce-([^']+)'/.exec(policy)![1];

describe("proxy", () => {
  it("puts a policy with a new nonce on every page response, and passes the same nonce to the page", () => {
    const first = run();
    const second = run();
    const a = first.headers.get("Content-Security-Policy")!;
    const b = second.headers.get("Content-Security-Policy")!;
    expect(nonceOf(a)).not.toBe(nonceOf(b));
    // the page is rendered with the request header that carries the same nonce
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(a);
    expect(first.headers.get("x-middleware-request-x-nonce")).toBe(nonceOf(a));
  });

  it("can fall back to reporting only, by an environment variable", () => {
    vi.stubEnv("CSP_REPORT_ONLY", "true");
    const response = run();
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toContain("default-src 'self'");
  });
});
