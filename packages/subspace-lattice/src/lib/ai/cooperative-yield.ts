/**
 * Cooperative yield so long CPU work (MCTS annotate, Deep Lattice) does not
 * trip the browser "Page is not responding" dialog.
 *
 * Prefers `scheduler.yield()` when present; falls back to a MessageChannel
 * macrotask (more reliable than nested `setTimeout(0)` alone).
 */
export function yieldToMain(): Promise<void> {
  const scheduler = (
    globalThis as {
      scheduler?: { yield?: () => Promise<void> };
    }
  ).scheduler;
  if (typeof scheduler?.yield === 'function') {
    return scheduler.yield();
  }
  if (typeof MessageChannel === 'function') {
    return new Promise((resolve) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => resolve();
      port2.postMessage(undefined);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
