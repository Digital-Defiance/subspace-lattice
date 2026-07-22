/**
 * Authoritative board presets for rules-manual figures.
 * Consumed by `/harness/figures` — click a figure, download SVG or screenshot PNG.
 */
import { CellType } from '../interfaces/cellType';
import type { Coordinate } from '../interfaces/coordinate';
import type { GameState } from '../interfaces/gameState';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import type { RulesVersion } from '../interfaces/rulesVersion';
import { SubspaceLatticeEngine } from '../game-engine';
import { resolveRulesConfig } from '../rules/rules-config';

export interface RulesFigurePieceSpec {
  id: string;
  type: PieceType;
  owner: PlayerColor;
  x: number;
  y: number;
}

export interface RulesFigure {
  /** Filename stem under docs/figures/ (no extension). */
  id: string;
  title: string;
  /** Short caption for the rules PDF / harness sidebar. */
  caption: string;
  /** What this shot is meant to teach. */
  teach: string;
  rulesVersion: RulesVersion;
  createState: () => GameState;
  /** Amber outline cells (relay escort, Target Lock, Beam lane, etc.). */
  highlightCells?: readonly Coordinate[];
  /** Show Objective HUD beside the board (PNG capture of the frame). */
  showObjectiveHud?: boolean;
  /** Prefer Download SVG for print; HUD shots are PNG-first. */
  preferFormat: 'svg' | 'png' | 'both';
}

interface BoardOpts {
  rulesVersion?: RulesVersion;
  currentPlayer?: PlayerColor;
  plyCount?: number;
  sectorHoldProgress?: Partial<Record<PlayerColor, number>>;
}

function boardFrom(
  pieces: RulesFigurePieceSpec[],
  opts: BoardOpts = {},
): GameState {
  const rulesVersion = opts.rulesVersion ?? 'hybrid-fleet';
  const rules = resolveRulesConfig(rulesVersion);
  const engine = new SubspaceLatticeEngine({ rules });
  const state = engine.getStateCopy();

  for (const cell of state.cells) delete cell.pieceId;
  state.pieces = {};
  state.currentPlayer = opts.currentPlayer ?? PlayerColor.White;
  state.plyCount = opts.plyCount ?? 0;
  delete state.winner;
  delete state.winnerReason;
  if (opts.sectorHoldProgress) {
    state.sectorHoldProgress = { ...opts.sectorHoldProgress };
  } else {
    delete state.sectorHoldProgress;
  }

  for (const spec of pieces) {
    const piece = {
      id: spec.id,
      type: spec.type,
      owner: spec.owner,
      position: { x: spec.x, y: spec.y },
    };
    state.pieces[piece.id] = piece;
    const cell = state.cells.find(
      (c) => c.coordinate.x === spec.x && c.coordinate.y === spec.y,
    );
    if (!cell || cell.type === CellType.GravityWell) {
      throw new Error(`Invalid figure position for ${spec.id} at (${spec.x},${spec.y})`);
    }
    cell.pieceId = piece.id;
  }

  return state;
}

function openingState(rulesVersion: RulesVersion): GameState {
  return new SubspaceLatticeEngine({ rulesVersion }).getStateCopy();
}

/** Compact fleet used by teaching diagrams (clear nets, readable spacing). */
const DIAGRAM_HUBS: RulesFigurePieceSpec[] = [
  {
    id: 'w-ch',
    type: PieceType.CommandHub,
    owner: PlayerColor.White,
    x: 5,
    y: 0,
  },
  {
    id: 'b-ch',
    type: PieceType.CommandHub,
    owner: PlayerColor.Black,
    x: 5,
    y: 10,
  },
];

export const RULES_FIGURES: readonly RulesFigure[] = [
  {
    id: 'opening-hybrid',
    title: 'Opening — mirrored hybrid',
    caption: 'Initial mirrored setup without Initiative Relay.',
    teach: 'Show the 11×11 grid, Gravity Well, and both fleets before any moves.',
    rulesVersion: 'hybrid',
    createState: () => openingState('hybrid'),
    preferFormat: 'svg',
  },
  {
    id: 'opening-fleet-relay',
    title: 'Opening — fleet Initiative Relay',
    caption: 'hybrid-fleet opening; White’s relay Escort at (5,3) highlighted.',
    teach: 'Highlight w-e4 at (5,3) — the soft-ship Initiative Relay.',
    rulesVersion: 'hybrid-fleet',
    createState: () => openingState('hybrid-fleet'),
    highlightCells: [{ x: 5, y: 3 }],
    preferFormat: 'svg',
  },
  {
    id: 'sensor-net-sovereign',
    title: 'Sensor Net / Sovereign Space',
    caption: 'Linked Escorts projecting White’s net across the midboard.',
    teach: 'Blue tint = White coverage. Escorts stay linked to the Hub.',
    rulesVersion: 'hybrid-fleet',
    createState: () =>
      boardFrom([
        ...DIAGRAM_HUBS,
        {
          id: 'w-e1',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 4,
          y: 0,
        },
        {
          id: 'w-e2',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 6,
          y: 0,
        },
        {
          id: 'w-e3',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 5,
          y: 1,
        },
        {
          id: 'w-e4',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 5,
          y: 3,
        },
        {
          id: 'w-e5',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 4,
          y: 3,
        },
        {
          id: 'w-e6',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 6,
          y: 3,
        },
      ]),
    preferFormat: 'svg',
  },
  {
    id: 'broken-escort',
    title: 'Broken Escort link',
    caption: 'Distant Escort is unlinked — it does not radiate Sensor Net.',
    teach:
      'Amber on the isolated Escort at (8,1). Gap from the chain at (5,1) is more than two squares, so it is dark.',
    rulesVersion: 'hybrid-fleet',
    createState: () =>
      boardFrom([
        {
          id: 'w-ch',
          type: PieceType.CommandHub,
          owner: PlayerColor.White,
          x: 1,
          y: 1,
        },
        {
          id: 'b-ch',
          type: PieceType.CommandHub,
          owner: PlayerColor.Black,
          x: 9,
          y: 9,
        },
        {
          id: 'w-e1',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 3,
          y: 1,
        },
        {
          id: 'w-e2',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 5,
          y: 1,
        },
        {
          id: 'w-e3',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 8,
          y: 1,
        },
      ]),
    highlightCells: [
      { x: 5, y: 1 },
      { x: 8, y: 1 },
    ],
    preferFormat: 'svg',
  },
  {
    id: 'target-lock',
    title: 'Target Lock',
    caption: 'White Infiltrator inside Black’s net — specials suppressed.',
    teach: 'Amber cell on the locked ship. Red net owns that square.',
    rulesVersion: 'hybrid-fleet',
    createState: () =>
      boardFrom([
        {
          id: 'w-ch',
          type: PieceType.CommandHub,
          owner: PlayerColor.White,
          x: 1,
          y: 1,
        },
        {
          id: 'b-ch',
          type: PieceType.CommandHub,
          owner: PlayerColor.Black,
          x: 9,
          y: 9,
        },
        {
          id: 'w-i1',
          type: PieceType.Infiltrator,
          owner: PlayerColor.White,
          x: 7,
          y: 7,
        },
      ]),
    highlightCells: [{ x: 7, y: 7 }],
    preferFormat: 'svg',
  },
  {
    id: 'contested-space',
    title: 'Contested Space',
    caption: 'Overlapping nets — purple cells count for neither fleet.',
    teach: 'Where blue and red overlap, coverage is contested (neutral for scoring).',
    rulesVersion: 'hybrid-fleet',
    createState: () =>
      boardFrom([
        {
          id: 'w-ch',
          type: PieceType.CommandHub,
          owner: PlayerColor.White,
          x: 5,
          y: 0,
        },
        {
          id: 'w-e1',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 5,
          y: 1,
        },
        {
          id: 'w-e2',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 5,
          y: 3,
        },
        {
          id: 'w-e3',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 4,
          y: 3,
        },
        {
          id: 'w-e4',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 6,
          y: 3,
        },
        {
          id: 'b-ch',
          type: PieceType.CommandHub,
          owner: PlayerColor.Black,
          x: 5,
          y: 6,
        },
        {
          id: 'b-e1',
          type: PieceType.Escort,
          owner: PlayerColor.Black,
          x: 5,
          y: 7,
        },
        {
          id: 'b-e2',
          type: PieceType.Escort,
          owner: PlayerColor.Black,
          x: 4,
          y: 6,
        },
        {
          id: 'b-e3',
          type: PieceType.Escort,
          owner: PlayerColor.Black,
          x: 6,
          y: 6,
        },
      ]),
    preferFormat: 'svg',
  },
  {
    id: 'beam-lane',
    title: 'Beam lane',
    caption: 'Beam fires only along clear squares inside its own Sensor Net.',
    teach: 'Highlight the lane (1,2)→(1,4). Capture the enemy Escort on the shot.',
    rulesVersion: 'hybrid-fleet',
    createState: () =>
      boardFrom([
        {
          id: 'w-ch',
          type: PieceType.CommandHub,
          owner: PlayerColor.White,
          x: 1,
          y: 1,
        },
        {
          id: 'w-e1',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 1,
          y: 0,
        },
        {
          id: 'w-e2',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 2,
          y: 1,
        },
        {
          id: 'w-e3',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 1,
          y: 3,
        },
        {
          id: 'w-b1',
          type: PieceType.Beam,
          owner: PlayerColor.White,
          x: 1,
          y: 2,
        },
        {
          id: 'b-ch',
          type: PieceType.CommandHub,
          owner: PlayerColor.Black,
          x: 9,
          y: 9,
        },
        {
          id: 'b-e1',
          type: PieceType.Escort,
          owner: PlayerColor.Black,
          x: 1,
          y: 4,
        },
      ]),
    highlightCells: [
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 1, y: 4 },
    ],
    preferFormat: 'svg',
  },
  {
    id: 'objective-hud',
    title: 'Objective HUD (sector clock)',
    caption: 'Coverage bars + armed Integration clock midgame.',
    teach: 'Screenshot the HUD + board frame together (PNG). Clock is armed (ply ≥ 100).',
    rulesVersion: 'hybrid-fleet',
    createState: () => {
      const state = openingState('hybrid-fleet');
      state.plyCount = 105;
      state.sectorHoldProgress = {
        [PlayerColor.White]: 0,
        [PlayerColor.Black]: 0,
      };
      return state;
    },
    showObjectiveHud: true,
    preferFormat: 'png',
  },
  {
    id: 'surgical-strike',
    title: 'Surgical Strike',
    caption: 'White Escort adjacent to the Black Command Hub — mate threat.',
    teach: 'Highlight the capture square. Hub capture ends the battle immediately.',
    rulesVersion: 'hybrid-fleet',
    createState: () =>
      boardFrom([
        {
          id: 'w-ch',
          type: PieceType.CommandHub,
          owner: PlayerColor.White,
          x: 0,
          y: 0,
        },
        {
          id: 'w-e1',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 5,
          y: 9,
        },
        {
          id: 'b-ch',
          type: PieceType.CommandHub,
          owner: PlayerColor.Black,
          x: 5,
          y: 10,
        },
      ]),
    highlightCells: [
      { x: 5, y: 9 },
      { x: 5, y: 10 },
    ],
    preferFormat: 'both',
  },
];

export function getRulesFigure(id: string): RulesFigure | undefined {
  return RULES_FIGURES.find((figure) => figure.id === id);
}
