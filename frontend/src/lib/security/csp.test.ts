import { describe, expect, it } from "vitest";
import { buildCsp, cspHeaderName, makeNonce } from "./csp";

const directive = (policy: string, name: string) =>
  policy
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1);

describe("buildCsp", () => {
  const policy = buildCsp({ nonce: "abc123" });

  it("lets only scripts with the nonce run, and never inline scripts without one", () => {
    const scripts = directive(policy, "script-src")!;
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("allows style attributes but no unsafe inline style elements", () => {
    expect(directive(policy, "style-src-attr")).toBe("'unsafe-inline'");
    expect(directive(policy, "style-src")).not.toContain("'unsafe-inline'");
  });

  it("keeps everything on the site's own origin and shuts the dangerous doors", () => {
    expect(directive(policy, "default-src")).toBe("'self'");
    expect(directive(policy, "connect-src")).toBe("'self'");
    expect(directive(policy, "object-src")).toBe("'none'");
    expect(directive(policy, "base-uri")).toBe("'self'");
    expect(directive(policy, "form-action")).toBe("'self'");
    expect(directive(policy, "frame-ancestors")).toBe("'none'");
    expect(directive(policy, "img-src")).toBe("'self' data: blob:");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("needs eval only in development, and does not force https there", () => {
    const dev = buildCsp({ nonce: "n", dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
});

describe("nonce and header", () => {
  it("makes a different unguessable nonce every time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => makeNonce()));
    expect(seen.size).toBe(50);
    for (const n of seen) expect(n).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("report-only mode uses the reporting header", () => {
    expect(cspHeaderName(false)).toBe("Content-Security-Policy");
    expect(cspHeaderName(true)).toBe("Content-Security-Policy-Report-Only");
  });
});
