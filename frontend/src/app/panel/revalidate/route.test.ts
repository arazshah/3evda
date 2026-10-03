import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag }));

import { POST } from "./route";

const json = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/panel/revalidate", { method: "POST", headers, body: JSON.stringify(body) });

function stubMe(state: string, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ state }), { status: ok ? 200 : 403 })),
  );
}

describe("POST /panel/revalidate", () => {
  beforeEach(() => {
    revalidateTag.mockClear();
    vi.unstubAllGlobals();
  });

  it("rejects non-JSON requests", async () => {
    stubMe("verified");
    const res = await POST(json({ tags: ["site"] }, { "content-type": "text/plain" }));
    expect(res.status).toBe(415);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects visitors without a verified session", async () => {
    stubMe("anonymous");
    const res = await POST(json({ tags: ["site"] }));
    expect(res.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("expires only the known tags for the owner", async () => {
    stubMe("verified");
    const res = await POST(json({ tags: ["site", "portfolio", "evil", 7] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revalidated: ["site", "portfolio"] });
    expect(revalidateTag).toHaveBeenCalledWith("site", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("portfolio", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledTimes(2);
  });

  it("forwards the session cookie to the API", async () => {
    stubMe("verified");
    await POST(json({ tags: [] }, { "content-type": "application/json", cookie: "sessionid=abc" }));
    const call = vi.mocked(fetch).mock.calls[0]!;
    expect((call[1]?.headers as Record<string, string>).cookie).toBe("sessionid=abc");
  });
});
