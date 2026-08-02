/**
 * Worker for atlas:rate deep-leaf move scoring.
 * Bundled to dist/atlas-rate-worker.mjs by scripts/atlas-rate.sh.
 */
import { parentPort } from 'node:worker_threads';
import { SubspaceLatticeEngine } from '../game-engine';
import { resolveRulesConfig } from '../rules/rules-config';
import { rateMoveDeepLeaf, type RateMoveJob, type RatedMove } from './atlas-rate-lib';

if (parentPort) {
  parentPort.on('message', (msg: { id: number; job: RateMoveJob }) => {
    try {
      const rules = resolveRulesConfig(msg.job.rulesVersion);
      const engine = SubspaceLatticeEngine.fromState(msg.job.state, rules);
      const result: RatedMove = rateMoveDeepLeaf(
        engine,
        msg.job.move,
        msg.job.perspective,
        msg.job.sims,
        msg.job.seed,
      );
      parentPort!.postMessage({ id: msg.id, ok: true, result });
    } catch (err) {
      parentPort!.postMessage({
        id: msg.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
