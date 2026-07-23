import { SubspaceLatticeEngine } from '../game-engine';
import { Coordinate } from '../interfaces/coordinate';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { AgentMove } from './agent';
import {
  AiStrengthId,
  createAiForStrength,
} from './mcts-ai';
import { HeuristicAi } from './heuristic-ai';
import { moveLeavesHubHanging } from './tactical';

export interface AdvisorSuggestion {
  pieceId: string;
  from: Coordinate;
  to: Coordinate;
  /** Human-readable coaching lines (local only — never chat). Max 4. */
  reasons: string[];
  strength: AiStrengthId;
  /** One-line summary for banners / logs. */
  summary: string;
}

const PIECE_LABEL: Record<PieceType, string> = {
  [PieceType.CommandHub]: 'Command Hub',
  [PieceType.Escort]: 'Escort',
  [PieceType.Infiltrator]: 'Infiltrator',
  [PieceType.Beam]: 'Beam',
};

const MAX_REASONS = 4;

/**
 * Tactical advisor: same decision path as local AI strengths, plus plain-language
 * reasons. Suggestions stay on-device (Warp-style: never auto-play / never chat).
 */
export function suggestAdvisorMove(
  engine: SubspaceLatticeEngine,
  strength: AiStrengthId = 'normal',
  rng: () => number = Math.random,
): AdvisorSuggestion | null {
  const state = engine.getState();
  if (state.winner) return null;

  const color = state.currentPlayer;
  const ai = createAiForStrength(strength, rng);
  const choice = ai.chooseMove(engine);
  if (!choice) return null;

  const piece = engine.getPiece(choice.pieceId);
  if (!piece) return null;

  const from = { ...piece.position };
  const to = { ...choice.to };
  const reasons = explainAdvisorMove(engine, choice, color);
  return {
    pieceId: choice.pieceId,
    from,
    to,
    reasons,
    strength,
    summary: formatAdvisorSuggestion(from, to, piece.type),
  };
}

export function formatAdvisorSuggestion(
  from: Coordinate,
  to: Coordinate,
  pieceType: PieceType,
): string {
  return `${PIECE_LABEL[pieceType]} (${from.x},${from.y}) → (${to.x},${to.y})`;
}

/** Whether a local-AI result should update TEI (Warp: assisted matches do not). */
export function shouldRecordLocalAiTei(assisted: boolean): boolean {
  return !assisted;
}

/**
 * Plain-language coaching lines for a chosen move (exported for unit tests).
 * Caps at {@link MAX_REASONS} like Warp's mergeCoachReasons.
 */
export function explainAdvisorMove(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
  color: PlayerColor = engine.getState().currentPlayer,
): string[] {
  const piece = engine.getPiece(move.pieceId);
  if (!piece) return ['No legal coaching line available.'];

  const reasons: string[] = [];
  const label = PIECE_LABEL[piece.type];
  const target = engine.getPieceAt(move.to);
  const spoolAnnounce =
    engine.usesInfiltratorSpool() &&
    piece.type === PieceType.Infiltrator &&
    !piece.spoolTarget &&
    !engine.isPieceDetected(piece);

  reasons.push(
    `Move ${label} from (${piece.position.x},${piece.position.y}) → (${move.to.x},${move.to.y}).`,
  );

  if (spoolAnnounce) {
    reasons.push(
      'Announce infiltrator spool — warp destination without revealing yet.',
    );
  } else if (target) {
    reasons.push(
      target.type === PieceType.CommandHub
        ? 'Capture the enemy Command Hub — win condition.'
        : `Capture enemy ${PIECE_LABEL[target.type]}.`,
    );
  }

  const myHub = Object.values(engine.getState().pieces).find(
    (p) => p.owner === color && p.type === PieceType.CommandHub,
  );
  if (myHub && !moveLeavesHubHanging(engine, move)) {
    const wasThreatened = Object.values(engine.getState().pieces).some(
      (p) =>
        p.owner !== color && engine.canMovePiece(p, myHub.position),
    );
    if (wasThreatened) {
      reasons.push('Keeps your Command Hub safe from Surgical Strike.');
    }
  }

  const enemyHub = Object.values(engine.getState().pieces).find(
    (p) => p.owner !== color && p.type === PieceType.CommandHub,
  );
  if (enemyHub && !target) {
    const before =
      Math.abs(piece.position.x - enemyHub.position.x) +
      Math.abs(piece.position.y - enemyHub.position.y);
    const after =
      Math.abs(move.to.x - enemyHub.position.x) +
      Math.abs(move.to.y - enemyHub.position.y);
    if (after < before) {
      reasons.push('Closes distance on the enemy Command Hub.');
    } else if (after > before) {
      reasons.push('Repositions relative to the enemy Command Hub.');
    }
  }

  if (engine.isHybrid()) {
    const after = engine.clone();
    if (after.movePiece(move.pieceId, move.to)) {
      const netBefore = engine.getSensorNetSet(color).size;
      const netAfter = after.getSensorNetSet(color).size;
      if (netAfter > netBefore) {
        reasons.push('Expands your Sensor Net coverage.');
      } else if (netAfter < netBefore) {
        reasons.push('Trades some Sensor Net for tempo or safety.');
      }
    }
  }

  const scored = new HeuristicAi(() => 0).chooseMove(engine);
  if (
    scored &&
    scored.pieceId === move.pieceId &&
    scored.to.x === move.to.x &&
    scored.to.y === move.to.y
  ) {
    reasons.push('Top-ranked by the fleet heuristic scout.');
  } else {
    reasons.push('Selected by the tactical search budget.');
  }

  return mergeCoachReasons(reasons);
}

function mergeCoachReasons(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    merged.push(line);
    if (merged.length >= MAX_REASONS) break;
  }
  return merged;
}
