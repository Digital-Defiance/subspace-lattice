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

/** Sparse human coaching for a fixed replay. Keys are absolute 1-based plies. */
export interface MissionPlyAnnotation {
  why: string;
  objective?: string;
  focusCells?: readonly Coordinate[];
}

export type MissionAnnotations = Readonly<
  Record<number, MissionPlyAnnotation>
>;

const PIECE_LABEL: Record<string, string> = {
  [PieceType.CommandHub]: 'Command Hub',
  [PieceType.Escort]: 'Escort',
  [PieceType.Infiltrator]: 'Infiltrator',
  [PieceType.Beam]: 'Beam',
};

function article(label: string): string {
  return /^[aeiou]/i.test(label) ? 'an' : 'a';
}

function phaseForPly(
  plyIndex: number,
  total: number,
): 'opening' | 'midgame' | 'endgame' {
  if (plyIndex < Math.min(14, Math.floor(total * 0.28))) return 'opening';
  if (plyIndex >= total - 8) return 'endgame';
  return 'midgame';
}

function destOf(move: MissionReplayMove): string {
  return `(${move.to.x},${move.to.y})`;
}

/**
 * Fallback coach copy for unmarked plies.
 * Quiet moves stay short; captures / Hub / clock get a real line.
 * Prefer sparse {@link MissionAnnotations} for teaching moments.
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
  const dest = destOf(move);
  const focusCells = [move.from, move.to];

  if (move.captured) {
    const hubMate =
      String(move.captured).includes('-ch') ||
      String(move.captured).endsWith('-ch') ||
      move.captured.includes('ch');
    if (hubMate) {
      return {
        seat,
        objective: `${seatName} delivers Surgical Strike.`,
        why: `${seatName} captures the enemy Command Hub with ${article(label)} ${label}. The battle ends immediately — this is the primary win most fleet games are playing toward.`,
        focusCells,
      };
    }
    return {
      seat,
      objective: `${seatName} captures with ${article(label)} ${label}.`,
      why:
        phase === 'opening'
          ? `${seatName} takes an early ${label === 'Beam' ? 'piece' : label.toLowerCase()} at ${dest} to loosen the screen.`
          : phase === 'endgame'
            ? `${seatName} removes a defender at ${dest}. Late captures usually open the Hub or collapse a relay.`
            : `${seatName} takes at ${dest} with ${article(label)} ${label}.`,
      focusCells,
    };
  }

  if (
    opts?.clockArmedFromPly != null &&
    plyIndex + 1 === opts.clockArmedFromPly
  ) {
    return {
      seat,
      objective: `${seatName} moves as the sector clock arms.`,
      why: `Ply ${opts.clockArmedFromPly}: Sector Integration can now win. Coverage at or above the marker must hold — Contested Space can break a streak. Surgical Strike is still available.`,
      focusCells,
    };
  }

  // Quiet ply: name the move, nothing more. Teaching lives in annotations.
  return {
    seat,
    objective: `${seatName} moves ${article(label)} ${label}.`,
    why: `${seatName} ${label} to ${dest}.`,
    focusCells,
  };
}

export function stepsFromReplay(
  moves: readonly MissionReplayMove[],
  opts?: {
    clockArmedFromPly?: number;
    startPlyOffset?: number;
    annotations?: MissionAnnotations;
  },
): TutorialStep[] {
  const offset = opts?.startPlyOffset ?? 0;
  return moves.map((move, i) => {
    const plyIndex = offset + i;
    const absolutePly = plyIndex + 1;
    const narrated = narrateMissionPly(move, plyIndex, offset + moves.length, {
      clockArmedFromPly: opts?.clockArmedFromPly,
    });
    const override = opts?.annotations?.[absolutePly];
    return {
      ...narrated,
      ...(override
        ? {
            why: override.why,
            ...(override.objective ? { objective: override.objective } : {}),
            ...(override.focusCells
              ? { focusCells: [...override.focusCells] }
              : {}),
          }
        : {}),
      playerMove: { pieceId: move.pieceId, to: move.to },
    };
  });
}
