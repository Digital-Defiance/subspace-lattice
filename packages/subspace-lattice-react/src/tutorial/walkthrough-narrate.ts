import {
  PieceType,
  PlayerColor,
  type Coordinate,
} from '@subspace-lattice/core';
import type { TutorialStep } from './tutorial-types';

export interface MissionReplayMove {
  seat: string;
  pieceId: string;
  from: Coordinate;
  to: Coordinate;
  captured?: string;
  pieceType: string;
}

const PIECE_LABEL: Record<string, string> = {
  [PieceType.CommandHub]: 'Command Hub',
  [PieceType.Escort]: 'Escort',
  [PieceType.Infiltrator]: 'Infiltrator',
  [PieceType.Beam]: 'Beam',
};

function phaseForPly(
  plyIndex: number,
  total: number,
): 'opening' | 'midgame' | 'endgame' {
  if (plyIndex < Math.min(14, Math.floor(total * 0.28))) return 'opening';
  if (plyIndex >= total - 8) return 'endgame';
  return 'midgame';
}

/**
 * Lightweight coach copy for long pre-calculated replays.
 * Key moments get sharper lines; quiet plies stay short.
 */
export function narrateMissionPly(
  move: MissionReplayMove,
  plyIndex: number,
  total: number,
  opts?: { clockArmedFromPly?: number },
): Pick<TutorialStep, 'why' | 'objective' | 'focusCells' | 'seat'> {
  const seat =
    move.seat === 'BLACK' || move.seat === PlayerColor.Black
      ? PlayerColor.Black
      : PlayerColor.White;
  const seatName = seat === PlayerColor.Black ? 'Black' : 'White';
  const label = PIECE_LABEL[move.pieceType] ?? 'ship';
  const phase = phaseForPly(plyIndex, total);
  const dest = `(${move.to.x},${move.to.y})`;
  const focusCells = [move.from, move.to];

  if (move.captured) {
    const hubMate =
      move.pieceType === PieceType.CommandHub ||
      // capture target inferred only by id convention in replays
      String(move.captured).includes('-ch');
    if (hubMate || String(move.captured).endsWith('-ch') || move.captured.includes('ch')) {
      return {
        seat,
        objective: `${seatName} delivers Surgical Strike.`,
        why: `${seatName} captures the enemy Command Hub with a ${label}. The battle ends immediately—this is the primary win most fleet games are playing toward.`,
        focusCells,
      };
    }
    return {
      seat,
      objective: `${seatName} captures with a ${label}.`,
      why:
        phase === 'opening'
          ? `${seatName} takes material early to loosen the opponent’s screen and free lanes.`
          : phase === 'endgame'
            ? `${seatName} removes a defender. Captures this late usually open the Hub or collapse a relay.`
            : `${seatName} trades or takes with a ${label} at ${dest}, reshaping the net fight.`,
      focusCells,
    };
  }

  if (opts?.clockArmedFromPly != null && plyIndex + 1 === opts.clockArmedFromPly) {
    return {
      seat,
      objective: `${seatName} moves as the sector clock arms.`,
      why: `Ply ${opts.clockArmedFromPly}: Sector Integration can now win. Coverage at or above the marker must hold—Contested Space can break a streak. Surgical Strike is still available.`,
      focusCells,
    };
  }

  if (move.pieceType === PieceType.Beam) {
    return {
      seat,
      objective: `${seatName} relocates a Beam.`,
      why:
        phase === 'opening'
          ? `${seatName} slides a Beam inside the blue Sensor Net. Beams only travel in that glow—this is repositioning inside the box until Escorts expand it.`
          : `${seatName} uses a Beam lane to ${dest}. Long slides mean the net already covers the path.`,
      focusCells,
    };
  }

  if (move.pieceType === PieceType.CommandHub) {
    return {
      seat,
      objective: `${seatName} repositions the Command Hub.`,
      why: `${seatName} steps the Hub toward ${dest}. The Hub is both king and radio tower—every move changes the net’s core.`,
      focusCells,
    };
  }

  if (phase === 'opening') {
    return {
      seat,
      objective: `${seatName} develops an ${label}.`,
      why: `Opening: ${seatName} advances an ${label} to ${dest}, linking coverage and contesting the midboard before big tactics appear.`,
      focusCells,
    };
  }

  if (phase === 'endgame') {
    return {
      seat,
      objective: `${seatName} presses with an ${label}.`,
      why: `Late game: ${seatName} plays ${label} to ${dest}. With the board tense, each step either threatens the Hub, expands a finishing net, or refuses a hang.`,
      focusCells,
    };
  }

  return {
    seat,
    objective: `${seatName} maneuvers an ${label}.`,
    why: `Midgame: ${seatName} moves an ${label} to ${dest}. Typical play is net pressure, Target Lock threats, and probing for a Hub mistake—not racing to paint the map.`,
    focusCells,
  };
}

export function stepsFromReplay(
  moves: readonly MissionReplayMove[],
  opts?: { clockArmedFromPly?: number; startPlyOffset?: number },
): TutorialStep[] {
  const offset = opts?.startPlyOffset ?? 0;
  return moves.map((move, i) => {
    const narrated = narrateMissionPly(move, offset + i, offset + moves.length, {
      clockArmedFromPly: opts?.clockArmedFromPly,
    });
    return {
      ...narrated,
      playerMove: { pieceId: move.pieceId, to: move.to },
    };
  });
}
