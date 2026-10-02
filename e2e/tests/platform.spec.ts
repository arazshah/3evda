import { expect, test } from "@playwright/test";

test.describe("platform", () => {
  test.skip(({ isMobile }) => isMobile, "API checks run once");

  test("backend readiness reports every dependency healthy", async ({ request }) => {
    const response = await request.get("/api/health/ready");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "ok",
      checks: { database: "ok", redis: "ok", storage: "ok" },
    });
  });

  test("backend liveness reports the deployed version", async ({ request }) => {
    const body = await (await request.get("/api/health/live")).json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe(process.env.E2E_EXPECTED_VERSION ?? body.version);
  });

  test("gateway assigns a request id and security headers", async ({ request }) => {
    const response = await request.get("/api/health/live");
    expect(response.headers()["x-request-id"]).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["server"]).toBeUndefined();
  });

  test("django admin static files are served", async ({ request }) => {
    const response = await request.get("/static/admin/css/base.css");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/css");
  });

  test("media is read-only and the private bucket is unreachable", async ({ request }) => {
    expect((await request.put("/media/probe.txt", { data: "x" })).status()).toBe(405);
    expect((await request.get("/media/?list-type=2")).status()).toBe(403);
    expect((await request.get("/media/../private/anything")).status()).not.toBe(200);
  });
});
