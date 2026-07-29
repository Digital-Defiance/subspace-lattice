import { SubspaceLatticeEngine } from '../game-engine';
import { Agent, AgentMove } from './agent';

/** Uniform random choice among legal moves (weak baseline). */
export class RandomLegalAgent implements Agent {
  readonly name = 'random-legal';

  constructor(private readonly rng: () => number = Math.random) {}

  chooseMove(engine: SubspaceLatticeEngine): AgentMove | null {
    const legal: AgentMove[] = engine.listLegalMoves().map((m) => ({
      pieceId: m.pieceId,
      to: m.to,
    }));
    if (engine.canFireEmp()) legal.push({ type: 'emp' });
    if (legal.length === 0) return null;
    const index = Math.min(
      legal.length - 1,
      Math.floor(this.rng() * legal.length),
    );
    return legal[index] ?? null;
  }
}
