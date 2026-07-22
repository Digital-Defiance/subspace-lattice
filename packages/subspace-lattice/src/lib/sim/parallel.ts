/**
 * Concurrency helpers for sims. No Node built-ins — safe in browser bundles.
 */

/** Default worker count for multi-core evolve & ladders. */
export function defaultConcurrency(): number {
  const nav = (
    globalThis as { navigator?: { hardwareConcurrency?: number } }
  ).navigator;
  const n = nav?.hardwareConcurrency ?? 4;
  return Math.max(1, n - 1);
}

/**
 * Run async mappers with a fixed concurrency pool (good for I/O or
 * awaiting worker tasks). Does not magically parallelize sync CPU work
 * on its own — pair with worker_threads for that.
 */
export async function mapInParallel<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number = defaultConcurrency(),
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      results[i] = await mapper(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

/** Split work into sync chunks executed via mapInParallel + Promise.resolve. */
export async function mapCpuBoundInParallel<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => R,
  concurrency: number = defaultConcurrency(),
): Promise<R[]> {
  return mapInParallel(
    items,
    async (item, index) => mapper(item, index),
    concurrency,
  );
}
