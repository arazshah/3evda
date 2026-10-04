import { describe, expect, it } from "vitest";
import { createUploadPool, isTransient, runUploads, type QueueItem } from "./upload-queue";

const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const jobs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, file: file(`${i}.jpg`) }));
const noPause = async () => undefined;

function recorder() {
  const items = new Map<number, Partial<QueueItem>>();
  return {
    items,
    update: (id: number, change: Partial<QueueItem>) => items.set(id, { ...items.get(id), ...change }),
  };
}

describe("runUploads", () => {
  it("never has more than three uploads in flight and finishes them all", async () => {
    let running = 0;
    let peak = 0;
    const { items, update } = recorder();
    let finished = 0;
    await runUploads(
      jobs(10),
      async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running -= 1;
      },
      update,
      () => (finished += 1),
      String,
      { pause: noPause },
    );
    expect(peak).toBe(3);
    expect(finished).toBe(10);
    expect([...items.values()].every((i) => i.state === "done")).toBe(true);
  });

  it("keeps the limit when more files are added while others are still going", async () => {
    let running = 0;
    let peak = 0;
    const { items, update } = recorder();
    const pool = createUploadPool(
      async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running -= 1;
      },
      update,
      () => undefined,
      String,
      { pause: noPause },
    );
    const first = pool.add(jobs(5));
    const second = pool.add(jobs(5).map((j) => ({ ...j, id: j.id + 5 })));
    const third = pool.add([{ id: 10, file: file("10.jpg") }]);
    await Promise.all([first, second, third]);
    expect(peak).toBe(3);
    expect(items.size).toBe(11);
    expect([...items.values()].every((i) => i.state === "done")).toBe(true);
  });

  it("tries a network failure again and succeeds", async () => {
    const attempts: Record<number, number> = {};
    const { items, update } = recorder();
    await runUploads(
      jobs(2),
      async (f) => {
        const n = (attempts[f.name === "0.jpg" ? 0 : 1] = (attempts[f.name === "0.jpg" ? 0 : 1] ?? 0) + 1);
        if (f.name === "0.jpg" && n < 3) throw { code: "network", detail: "قطع" };
      },
      update,
      () => undefined,
      String,
      { pause: noPause },
    );
    expect(attempts[0]).toBe(3); // first try and two repeats
    expect(items.get(0)?.state).toBe("done");
    expect(items.get(1)?.state).toBe("done");
  });

  it("gives up after the repeats and reports the reason", async () => {
    const { items, update } = recorder();
    let calls = 0;
    await runUploads(
      jobs(1),
      async () => {
        calls += 1;
        throw { code: "network", detail: "قطع" };
      },
      update,
      () => undefined,
      (e) => (e as { detail: string }).detail,
      { pause: noPause },
    );
    expect(calls).toBe(3);
    expect(items.get(0)).toMatchObject({ state: "error", message: "قطع" });
  });

  it("does not repeat a refusal such as a duplicate", async () => {
    let calls = 0;
    const { items, update } = recorder();
    await runUploads(
      jobs(1),
      async () => {
        calls += 1;
        throw { code: "duplicate", detail: "تکراری" };
      },
      update,
      () => undefined,
      (e) => (e as { detail: string }).detail,
      { pause: noPause },
    );
    expect(calls).toBe(1);
    expect(items.get(0)).toMatchObject({ state: "error", message: "تکراری" });
  });

  it("tells transient errors from refusals", () => {
    expect(isTransient({ code: "network" })).toBe(true);
    expect(isTransient({ code: "http_error" })).toBe(true);
    expect(isTransient({ code: "too_large" })).toBe(false);
    expect(isTransient(undefined)).toBe(false);
  });
});
