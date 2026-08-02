/**
 * Versioned position encoder for Deep Lattice neural leaf eval.
 * Side-to-move relative: index 0 always means "me" (current player).
 *
 * See docs/deep-lattice-lab.md · ADR 007.
 */
import { SubspaceLatticeEngine } from '../game-engine';
import { CellType } from '../interfaces/cellType';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';

/** Bump when feature layout changes; datasets must match. */
export const ENCODING_VERSION = 1 as const;

export const ENCODER_BOARD_SIZE = 11 as const;

const PIECE_PLANE_TYPES: readonly PieceType[] = [
  PieceType.CommandHub,
  PieceType.Escort,
  PieceType.Infiltrator,
  PieceType.Beam,
  PieceType.Refractor,
  PieceType.Carrier,
];

/** Mine + theirs × piece types. */
const PIECE_PLANES = PIECE_PLANE_TYPES.length * 2;
/** Sovereign mine, sovereign theirs, EMP-disabled enemy (in blast), gravity well. */
const MASK_PLANES = 4;
const SPATIAL_PLANES = PIECE_PLANES + MASK_PLANES;
const CELLS = ENCODER_BOARD_SIZE * ENCODER_BOARD_SIZE;

/**
 * Scalars (appended after spatial planes), all in roughly [0, 1] or [-1, 1]:
 * emp charge me/them, emp ready me/them, terminal me/them, phase armed,
 * sector coverage me/them, material norm, ply norm, can fire emp.
 */
export const ENCODER_SCALAR_COUNT = 12 as const;

export const ENCODER_FEATURE_COUNT =
  SPATIAL_PLANES * CELLS + ENCODER_SCALAR_COUNT;

export interface EncodedPosition {
  version: typeof ENCODING_VERSION;
  /** Length === ENCODER_FEATURE_COUNT */
  features: Float32Array;
  boardSize: typeof ENCODER_BOARD_SIZE;
  spatialPlanes: number;
  scalarCount: typeof ENCODER_SCALAR_COUNT;
}

function cellIndex(x: number, y: number): number {
  return y * ENCODER_BOARD_SIZE + x;
}

function planeOffset(plane: number): number {
  return plane * CELLS;
}

/**
 * Encode `engine` for neural leaf eval. Perspective = side to move.
 * Throws if boardSize !== 11 (v1 encoder is fixed to shipping fleet board).
 */
export function encodePosition(engine: SubspaceLatticeEngine): EncodedPosition {
  const state = engine.getState();
  if (state.boardSize !== ENCODER_BOARD_SIZE) {
    throw new Error(
      `encodePosition v${ENCODING_VERSION} expects boardSize ${ENCODER_BOARD_SIZE}, got ${state.boardSize}`,
    );
  }

  const me = state.currentPlayer;
  const them =
    me === PlayerColor.White ? PlayerColor.Black : PlayerColor.White;

  const features = new Float32Array(ENCODER_FEATURE_COUNT);

  const setSpatial = (plane: number, x: number, y: number, v = 1) => {
    if (x < 0 || y < 0 || x >= ENCODER_BOARD_SIZE || y >= ENCODER_BOARD_SIZE) {
      return;
    }
    features[planeOffset(plane) + cellIndex(x, y)] = v;
  };

  // Piece planes: [0..5] mine by type order, [6..11] theirs.
  for (const piece of Object.values(state.pieces)) {
    const typeIdx = PIECE_PLANE_TYPES.indexOf(piece.type);
    if (typeIdx < 0) continue;
    const ownerPlane =
      piece.owner === me ? typeIdx : PIECE_PLANE_TYPES.length + typeIdx;
    setSpatial(ownerPlane, piece.position.x, piece.position.y);
  }

  const myNet = engine.getSensorNetSet(me);
  const theirNet = engine.getSensorNetSet(them);
  const minePlane = PIECE_PLANES;
  const theirsPlane = PIECE_PLANES + 1;
  for (const key of myNet) {
    const [xs, ys] = key.split(',');
    setSpatial(minePlane, Number(xs), Number(ys));
  }
  for (const key of theirNet) {
    const [xs, ys] = key.split(',');
    setSpatial(theirsPlane, Number(xs), Number(ys));
  }

  const empDisabledPlane = PIECE_PLANES + 2;
  for (const piece of Object.values(state.pieces)) {
    if (piece.owner !== them) continue;
    if (!engine.isEmpDisabled(piece)) continue;
    setSpatial(empDisabledPlane, piece.position.x, piece.position.y);
  }

  const wellPlane = PIECE_PLANES + 3;
  for (const cell of state.cells) {
    if (cell.type === CellType.GravityWell) {
      setSpatial(wellPlane, cell.coordinate.x, cell.coordinate.y);
    }
  }

  const scalarBase = SPATIAL_PLANES * CELLS;
  const myChargeTarget = Math.max(1, engine.getEmpChargeTarget(me));
  const theirChargeTarget = Math.max(1, engine.getEmpChargeTarget(them));
  const myCharge = engine.getEmpCharge(me);
  const theirCharge = engine.getEmpCharge(them);
  const cells = CELLS;

  features[scalarBase + 0] = myCharge / myChargeTarget;
  features[scalarBase + 1] = theirCharge / theirChargeTarget;
  features[scalarBase + 2] = myCharge >= myChargeTarget ? 1 : 0;
  features[scalarBase + 3] = theirCharge >= theirChargeTarget ? 1 : 0;
  features[scalarBase + 4] = engine.isTerminalOverclock(me) ? 1 : 0;
  features[scalarBase + 5] = engine.isTerminalOverclock(them) ? 1 : 0;
  features[scalarBase + 6] = state.terminalPhaseArmed ? 1 : 0;
  features[scalarBase + 7] = myNet.size / cells;
  features[scalarBase + 8] = theirNet.size / cells;

  let myMat = 0;
  let theirMat = 0;
  for (const piece of Object.values(state.pieces)) {
    const w =
      piece.type === PieceType.CommandHub
        ? 0
        : piece.type === PieceType.Carrier
          ? 4
          : piece.type === PieceType.Refractor || piece.type === PieceType.Beam
            ? 3
            : piece.type === PieceType.Infiltrator
              ? 2
              : 1;
    if (piece.owner === me) myMat += w;
    else theirMat += w;
  }
  const matSum = Math.max(1, myMat + theirMat);
  features[scalarBase + 9] = (myMat - theirMat) / matSum;
  features[scalarBase + 10] = Math.min(1, (state.plyCount ?? 0) / 200);
  features[scalarBase + 11] = engine.canFireEmp() ? 1 : 0;

  return {
    version: ENCODING_VERSION,
    features,
    boardSize: ENCODER_BOARD_SIZE,
    spatialPlanes: SPATIAL_PLANES,
    scalarCount: ENCODER_SCALAR_COUNT,
  };
}

/** Stable hex fingerprint for tests / dataset dedupe (not crypto). */
export function encodingFingerprint(features: Float32Array): string {
  let h = 2166136261;
  for (let i = 0; i < features.length; i++) {
    // FNV-1a over float bits via scaled int
    const v = (features[i]! * 1e6) | 0;
    h ^= v;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
