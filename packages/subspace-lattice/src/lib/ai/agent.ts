import { SubspaceLatticeEngine } from '../game-engine';
import { Coordinate } from '../interfaces/coordinate';

/** Piece relocation (default when `type` omitted for back-compat). */
export type AgentPieceMove = {
  type?: 'move';
  pieceId: string;
  to: Coordinate;
};

/** Command Overload — consumes the turn. */
export type AgentEmpMove = {
  type: 'emp';
};

export type AgentMove = AgentPieceMove | AgentEmpMove;

export function isEmpAgentMove(move: AgentMove): move is AgentEmpMove {
  return move.type === 'emp';
}

/** Narrow to a piece relocation, throwing on EMP. Test/report ergonomics. */
export function requirePieceAgentMove<T extends AgentMove>(
  move: T | null | undefined,
): Extract<T, AgentPieceMove> & AgentPieceMove {
  if (!move) throw new Error('expected a piece move, got none');
  if (isEmpAgentMove(move)) throw new Error('expected a piece move, got emp');
  return move as Extract<T, AgentPieceMove> & AgentPieceMove;
}

/** Stable key for deduping search candidates. */
export function agentMoveKey(move: AgentMove): string {
  if (isEmpAgentMove(move)) return 'emp';
  return `${move.pieceId}:${move.to.x},${move.to.y}`;
}

/** Apply an agent decision to a live engine. */
export function applyAgentMove(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
): boolean {
  if (isEmpAgentMove(move)) return engine.fireEmp();
  return engine.movePiece(move.pieceId, move.to);
}

/** Pluggable decision maker for play, ladders, and search rollouts. */
export interface Agent {
  readonly name: string;
  chooseMove(engine: SubspaceLatticeEngine): AgentMove | null;
}
