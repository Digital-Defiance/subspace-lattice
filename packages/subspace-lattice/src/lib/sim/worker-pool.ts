import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConcurrency, mapInParallel } from './parallel';
import type { WorkerRequest } from './sim-worker';

function resolveWorkerPath(): string | null {
  // Bundled CLI sibling (preferred)
  const candidates = [
    path.resolve(process.cwd(), 'dist/sim-worker.mjs'),
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../dist/sim-worker.mjs',
    ),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};

class SimWorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Array<{
    req: Omit<WorkerRequest, 'id'>;
    pending: Pending;
  }> = [];
  private nextId = 1;
  private readonly pendingById = new Map<number, Pending>();

  constructor(
    private readonly workerPath: string,
    size: number,
  ) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(this.workerPath);
      w.on('message', (msg: { id: number; ok: boolean; result?: unknown; error?: string }) => {
        const pending = this.pendingById.get(msg.id);
        this.pendingById.delete(msg.id);
        if (!pending) return;
        if (msg.ok) pending.resolve(msg.result);
        else pending.reject(new Error(msg.error ?? 'worker failed'));
        this.idle.push(w);
        this.pump();
      });
      w.on('error', (err) => {
        // Fail all pending on this worker — rare
        console.error('sim worker error', err);
      });
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const job = this.queue.shift()!;
      const worker = this.idle.pop()!;
      const id = this.nextId++;
      this.pendingById.set(id, job.pending);
      worker.postMessage({ ...job.req, id });
    }
  }

  run<T>(req: Omit<WorkerRequest, 'id'>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        req,
        pending: {
          resolve: (v) => resolve(v as T),
          reject,
        },
      });
      this.pump();
    });
  }

  async destroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.idle = [];
  }
}

let sharedPool: SimWorkerPool | null = null;

export function getSimWorkerPool(
  concurrency: number = defaultConcurrency(),
): SimWorkerPool | null {
  const workerPath = resolveWorkerPath();
  if (!workerPath) return null;
  if (!sharedPool) {
    sharedPool = new SimWorkerPool(workerPath, concurrency);
  }
  return sharedPool;
}

export async function destroySimWorkerPool(): Promise<void> {
  if (sharedPool) {
    await sharedPool.destroy();
    sharedPool = null;
  }
}

/**
 * Map items across worker threads when the bundled worker exists;
 * otherwise fall back to in-process parallel async (single-threaded CPU).
 */
export async function mapWithSimWorkers<T, R>(
  items: readonly T[],
  toRequest: (item: T, index: number) => Omit<WorkerRequest, 'id'>,
  fallback: (item: T, index: number) => R,
  concurrency: number = defaultConcurrency(),
): Promise<R[]> {
  const pool = getSimWorkerPool(concurrency);
  if (!pool) {
    return mapInParallel(
      items,
      async (item, index) => fallback(item, index),
      concurrency,
    );
  }
  return mapInParallel(
    items,
    (item, index) => pool.run<R>(toRequest(item, index)),
    concurrency,
  );
}
