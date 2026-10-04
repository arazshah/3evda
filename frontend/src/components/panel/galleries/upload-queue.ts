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

/**
 * Upload `jobs` with at most `concurrency` in flight, trying a transient failure again up to `retries` times.
 * Progress and results are reported through `update`; `done` is called after each finished (or given-up) file.
 */
export async function runUploads(
  jobs: Job[],
  upload: (file: File, onProgress: (fraction: number) => void) => Promise<unknown>,
  update: (id: number, change: Partial<QueueItem>) => void,
  done: () => void,
  describe: (error: unknown) => string,
  options: { concurrency?: number; retries?: number; pause?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const { concurrency = CONCURRENCY, retries = RETRIES, pause = wait } = options;
  const work = [...jobs];
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
      done();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
}
