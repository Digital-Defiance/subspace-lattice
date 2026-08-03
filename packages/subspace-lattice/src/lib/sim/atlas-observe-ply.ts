/**
 * Shared observe ply-row mapper (CLI + worker).
 */
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import type { ReplayPly } from './match-runner';

const PIECE_LABEL: Record<PieceType, string> = {
  [PieceType.CommandHub]: 'CommandHub',
  [PieceType.Escort]: 'Escort',
  [PieceType.Infiltrator]: 'Infiltrator',
  [PieceType.Beam]: 'Beam',
  [PieceType.Refractor]: 'Refractor',
  [PieceType.Carrier]: 'Carrier',
};

export function pieceLabel(t: PieceType): string {
  return PIECE_LABEL[t] ?? String(t);
}

export function replayPlyToObserveRow(
  ply: ReplayPly,
  game: number,
  i: number,
): Record<string, unknown> {
  return {
    type: 'ply',
    game,
    i,
    player: ply.player === PlayerColor.White ? 'W' : 'B',
    mover: pieceLabel(ply.moverType),
    pieceId: ply.pieceId,
    to: ply.to ? { x: ply.to.x, y: ply.to.y } : null,
    capture: ply.capturedType ? pieceLabel(ply.capturedType) : null,
    emp: !!ply.empFired,
    spool: !!ply.spoolAnnounce,
    spoolFail: !!ply.spoolFailed,
    covW: ply.covW,
    covB: ply.covB,
    netW: ply.netW,
    netB: ply.netB,
    cont: ply.cont,
    holdW: ply.holdW,
    holdB: ply.holdB,
  };
}
