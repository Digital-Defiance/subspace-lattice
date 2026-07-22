import { SubspaceLatticeEngine } from '../game-engine';
import { Coordinate } from '../interfaces/coordinate';

export interface AgentMove {
  pieceId: string;
  to: Coordinate;
}

/** Pluggable decision maker for play, ladders, and search rollouts. */
export interface Agent {
  readonly name: string;
  chooseMove(engine: SubspaceLatticeEngine): AgentMove | null;
}
