/**
 * Node-only pool for parallel dataset self-play games.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { mapInParallel } from '../sim/parallel';
import { nodeDefaultJobs } from '../sim/ladder-spec-parallel';
import type {
  DatasetGameRequest,
  DatasetGameResult,
} from './dataset-game-worker';

export { nodeDefaultJobs };

function resolveDatasetWorkerPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, 'dataset-game-worker.mjs'),
    path.resolve(
      process.cwd(),
      'packages/subspace-lattice/dist/dataset-game-worker.mjs',
    ),
    path.resolve(process.cwd(), 'dist/dataset-game-worker.mjs'),
    path.resolve(here, '../../../dist/dataset-game-worker.mjs'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

type Pending = {
  resolve: (v: DatasetGameResult) => void;
  reject: (e: Error) => void;
};

class DatasetGamePool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Array<{
    req: Omit<DatasetGameRequest, 'id'>;
    pending: Pending;
  }> = [];
  private nextId = 1;
  private readonly pendingById = new Map<number, Pending>();

  constructor(workerPath: string, size: number) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(workerPath);
      w.on(
        'message',
        (msg: {
          id: number;
          ok: boolean;
          result?: DatasetGameResult;
          error?: string;
        }) => {
          const pending = this.pendingById.get(msg.id);
          this.pendingById.delete(msg.id);
          if (!pending) return;
          if (msg.ok && msg.result) pending.resolve(msg.result);
          else pending.reject(new Error(msg.error ?? 'worker failed'));
          this.idle.push(w);
          this.pump();
        },
      );
      w.on('error', (err) => {
        console.error('dataset-game worker error', err);
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

  run(req: Omit<DatasetGameRequest, 'id'>): Promise<DatasetGameResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ req, pending: { resolve, reject } });
      this.pump();
    });
  }

  async destroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.idle = [];
  }
}

export async function mapDatasetGames(
  payloads: Omit<DatasetGameRequest, 'id'>['payload'][],
  jobs: number,
  runInProcess: (
    payload: Omit<DatasetGameRequest, 'id'>['payload'],
  ) => DatasetGameResult,
): Promise<DatasetGameResult[]> {
  const limit = Math.max(1, jobs);
  const workerPath = limit > 1 ? resolveDatasetWorkerPath() : null;

  if (limit > 1 && workerPath) {
    console.log(
      `  parallel: ${limit} workers · ${payloads.length} games · ${path.basename(workerPath)}`,
    );
    const pool = new DatasetGamePool(workerPath, limit);
    try {
      return await mapInParallel(
        payloads,
        (payload) =>
          pool.run({
            type: 'self-play-game',
            payload,
          }),
        limit,
      );
    } finally {
      await pool.destroy();
    }
  }

  if (limit > 1 && !workerPath) {
    console.warn(
      '  parallel: dataset-game-worker.mjs missing — falling back to sequential',
    );
  }
  return payloads.map(runInProcess);
}

export { mapInParallel };
