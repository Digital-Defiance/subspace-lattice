import type { TeiGrade } from './tei-grade';
import type { Coordinate } from '../interfaces/coordinate';
import type { PlayerColor } from '../interfaces/playerColor';

/** Format a move for game logs; optional TEI token for display layer. */
export function formatMoveLogLine(options: {
  at?: Date;
  player: PlayerColor | string;
  pieceId: string;
  to: Coordinate;
  tei?: { grade: TeiGrade; score: number; reference?: boolean };
  captured?: string;
}): string {
  const ts = (options.at ?? new Date()).toLocaleTimeString();
  const tei =
    options.tei != null
      ? options.tei.reference
        ? ` ref ${options.tei.grade}${String(options.tei.score).padStart(2, '0')}`
        : ` ${options.tei.grade}${String(options.tei.score).padStart(2, '0')}`
      : '';
  const capture = options.captured ? ` (captures ${options.captured})` : '';
  return `[${ts}] ${options.player}${tei} moved ${options.pieceId} → (${options.to.x},${options.to.y})${capture}`;
}

export function formatSystemLogLine(
  text: string,
  at: Date = new Date(),
): string {
  return `[${at.toLocaleTimeString()}] ${text}`;
}
