import type { ApiError } from "@/lib/api/client";

export type UploadState = "queued" | "uploading" | "retrying" | "done" | "error";
export type QueueItem = { id: number; name: string; progress: number; state: UploadState; message?: string };
export type Job = { id: number; file: File };

export const CONCURRENCY = 3;
export const RETRIES = 2;

/** Network and gateway trouble is worth trying again; a refusal («duplicate», «too large», …) is not. */
export function isTransient(error: unknown): boolean {
  const code = (error as ApiError | undefined)?.code;
  return code === "network" || code === "http_error";
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Upload = (file: File, onProgress: (fraction: number) => void) => Promise<unknown>;

/**
 * One shared pool: however many batches are added, at most `concurrency` uploads are in flight, and a transient
 * failure is tried again up to `retries` times. Progress and results go through `update`; `done` is called after
 * each finished (or given-up) file, with the number finished so far. `add` resolves when the pool has nothing left to do.
 */
export function createUploadPool(
  upload: Upload,
  update: (id: number, change: Partial<QueueItem>) => void,
  done: (finished: number) => void,
  describe: (error: unknown) => string,
  options: { concurrency?: number; retries?: number; pause?: (ms: number) => Promise<void> } = {},
) {
  const { concurrency = CONCURRENCY, retries = RETRIES, pause = wait } = options;
  const work: Job[] = [];
  let active = 0;
  let finished = 0;
  let idle: Promise<void> = Promise.resolve();
  let release: () => void = () => undefined;

  const worker = async () => {
    for (let job = work.shift(); job; job = work.shift()) {
      for (let attempt = 0; ; attempt += 1) {
        update(job.id, { state: attempt === 0 ? "uploading" : "retrying", progress: 0, message: undefined });
        try {
          await upload(job.file, (progress) => update(job.id, { progress }));
          update(job.id, { state: "done", progress: 1 });
          break;
        } catch (error) {
          if (isTransient(error) && attempt < retries) {
            await pause(1000 * (attempt + 1));
            continue;
          }
          update(job.id, { state: "error", message: describe(error) });
          break;
        }
      }
      finished += 1;
      done(finished);
    }
    active -= 1;
    if (active === 0) release();
  };

  return {
    add(jobs: Job[]): Promise<void> {
      if (jobs.length === 0) return idle;
      if (active === 0) idle = new Promise<void>((resolve) => (release = resolve));
      work.push(...jobs);
      for (let spawn = Math.min(concurrency - active, work.length); spawn > 0; spawn -= 1) {
        active += 1;
        void worker();
      }
      return idle;
    },
  };
}

/** Upload `jobs` through a pool of their own (see `createUploadPool`). */
export function runUploads(
  jobs: Job[],
  upload: Upload,
  update: (id: number, change: Partial<QueueItem>) => void,
  done: (finished: number) => void,
  describe: (error: unknown) => string,
  options: { concurrency?: number; retries?: number; pause?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  return createUploadPool(upload, update, done, describe, options).add(jobs);
}
