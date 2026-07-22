import { SubspaceLatticeEngine } from '../game-engine';
import { Agent } from '../ai/agent';
import { Coordinate } from '../interfaces/coordinate';
import { PieceType } from '../interfaces/pieceType';
import { WinnerReason } from '../interfaces/gameState';
import { PlayerColor } from '../interfaces/playerColor';
import { RulesConfig, resolveRulesConfig } from '../rules/rules-config';

export interface ReplayPly {
  pieceId: string;
  to: Coordinate;
  player: PlayerColor;
  moverType: PieceType;
  capturedType?: PieceType;
  spoolAnnounce?: boolean;
  spoolFailed?: boolean;
}

export interface MatchResult {
  winner?: PlayerColor;
  winnerReason?: WinnerReason;
  plies: number;
  truncated: boolean;
  replay: ReplayPly[];
  rulesVersion: RulesConfig['version'];
  /** Captures by mover piece type (excludes spool announces). */
  capturesByMoverType: Partial<Record<PieceType, number>>;
  infiltratorCaptures: number;
  spoolAnnounces: number;
  spoolFailures: number;
}

export interface PlayMatchOptions {
  rules?: RulesConfig;
  /** Stop after this many plies and mark truncated. Default 400. */
  maxPlies?: number;
}

function emptyCaptureStats(): Pick<
  MatchResult,
  | 'capturesByMoverType'
  | 'infiltratorCaptures'
  | 'spoolAnnounces'
  | 'spoolFailures'
> {
  return {
    capturesByMoverType: {},
    infiltratorCaptures: 0,
    spoolAnnounces: 0,
    spoolFailures: 0,
  };
}

function tallyPly(
  stats: ReturnType<typeof emptyCaptureStats>,
  ply: ReplayPly,
): void {
  if (ply.spoolAnnounce) stats.spoolAnnounces += 1;
  if (ply.spoolFailed) stats.spoolFailures += 1;
  if (ply.capturedType) {
    stats.capturesByMoverType[ply.moverType] =
      (stats.capturesByMoverType[ply.moverType] ?? 0) + 1;
    if (ply.moverType === PieceType.Infiltrator) {
      stats.infiltratorCaptures += 1;
    }
  }
}

/**
 * Play white vs black to terminal (or max plies).
 * Agents always move for `engine.getState().currentPlayer`.
 */
export function playMatch(
  white: Agent,
  black: Agent,
  options: PlayMatchOptions = {},
): MatchResult {
  const rules = options.rules ?? resolveRulesConfig('classic');
  const maxPlies = options.maxPlies ?? 400;
  const engine = new SubspaceLatticeEngine({ rules });
  const replay: ReplayPly[] = [];
  const stats = emptyCaptureStats();

  for (let plies = 0; plies < maxPlies; plies++) {
    const state = engine.getState();
    if (state.winner) {
      return {
        winner: state.winner,
        winnerReason: state.winnerReason,
        plies,
        truncated: false,
        replay,
        rulesVersion: rules.version,
        ...stats,
      };
    }

    const agent =
      state.currentPlayer === PlayerColor.White ? white : black;
    const choice = agent.chooseMove(engine);
    if (!choice) {
      const winner =
        state.currentPlayer === PlayerColor.White
          ? PlayerColor.Black
          : PlayerColor.White;
      return {
        winner,
        winnerReason: 'no-moves',
        plies,
        truncated: false,
        replay,
        rulesVersion: rules.version,
        ...stats,
      };
    }

    const player = state.currentPlayer;
    const ok = engine.movePiece(choice.pieceId, choice.to);
    if (!ok) {
      throw new Error(
        `Agent ${agent.name} proposed illegal move ${choice.pieceId} -> (${choice.to.x},${choice.to.y})`,
      );
    }
    const info = engine.getLastMoveInfo();
    const ply: ReplayPly = {
      pieceId: choice.pieceId,
      to: choice.to,
      player,
      moverType: info?.moverType ?? PieceType.Escort,
      capturedType: info?.capturedType,
      spoolAnnounce: info?.spoolAnnounce,
      spoolFailed: info?.spoolFailed,
    };
    replay.push(ply);
    tallyPly(stats, ply);
  }

  const final = engine.getState();
  return {
    winner: final.winner,
    winnerReason: final.winnerReason,
    plies: replay.length,
    truncated: !final.winner,
    replay,
    rulesVersion: rules.version,
    ...stats,
  };
}
