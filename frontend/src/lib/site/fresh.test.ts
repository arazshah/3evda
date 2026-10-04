import { afterEach, describe, expect, it, vi } from "vitest";

const incoming = vi.hoisted(() => ({ forwarded: null as string | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(incoming.forwarded ? { "x-forwarded-for": incoming.forwarded } : {}),
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { get, json } from "./fresh";

afterEach(() => vi.unstubAllGlobals());

describe("reading the public API from the server", () => {
  it("passes the visitor's forwarding chain on, so the API rate-limits visitors one by one", async () => {
    const seen: (HeadersInit | undefined)[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      seen.push(init?.headers);
      return new Response("{}", { status: 200 });
    });
    incoming.forwarded = "203.0.113.7, 10.0.0.2";
    await get("/api/public/x");
    expect(seen[0]).toEqual({ "X-Forwarded-For": "203.0.113.7, 10.0.0.2" });
  });

  it("sends nothing extra when there is no chain (a request not made through a proxy)", async () => {
    const seen: (HeadersInit | undefined)[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      seen.push(init?.headers);
      return new Response("{}", { status: 200 });
    });
    incoming.forwarded = null;
    await get("/api/public/x");
    expect(seen[0]).toBeUndefined();
  });

  it("is never cached, and a 404 is the framework's not-found", async () => {
    const inits: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      inits.push(init!);
      return new Response("{}", { status: 404 });
    });
    await expect(json("/api/public/x")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(inits[0]).toMatchObject({ cache: "no-store", redirect: "manual" });
  });

  it("turns a failure of the API into an error instead of a blank page", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    await expect(json("/api/public/x")).rejects.toThrow("→ 500");
  });
});
