import { describe, it, expect } from 'vitest';
import {
  PieceType,
  PlayerColor,
  SubspaceLatticeEngine,
  resolveRulesConfig,
  type GameState,
} from '@subspace-lattice/core';

const rules = resolveRulesConfig('hybrid-fleet', {
  sectorActivationPly: 999,
  sectorIntegrationRatio: 0.45,
});

function stateWith(
  pieces: { id: string; type: PieceType; owner: PlayerColor; x: number; y: number }[],
  r = rules,
): GameState {
  const engine = new SubspaceLatticeEngine({ rules: r });
  const state = engine.getStateCopy();
  for (const cell of state.cells) delete cell.pieceId;
  state.pieces = {};
  state.currentPlayer = PlayerColor.White;
  state.plyCount = 40;
  delete state.winner;
  delete state.winnerReason;
  delete state.sectorHoldProgress;
  for (const spec of pieces) {
    state.pieces[spec.id] = {
      id: spec.id,
      type: spec.type,
      owner: spec.owner,
      position: { x: spec.x, y: spec.y },
    };
    state.cells.find((c) => c.coordinate.x === spec.x && c.coordinate.y === spec.y)!.pieceId =
      spec.id;
  }
  return state;
}

describe('probe', () => {
  it('hub alone and fringe push', () => {
    const hubOnly = SubspaceLatticeEngine.fromState(
      stateWith([
        { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 2 },
        { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
      ]),
      rules,
    );
    console.log(
      'hubOnly',
      hubOnly.sectorControlRatio(PlayerColor.White),
      'net',
      hubOnly.getSensorNetSet(PlayerColor.White).size,
      'hubR',
      rules.hubSensorRadius,
      'escR',
      rules.escortSensorRadius,
      'link',
      rules.linkDistance,
      'neutral',
      rules.contestedCellsNeutral,
      'ratioTarget',
      rules.sectorIntegrationRatio,
    );

    // Chain south to expand
    const chain = [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 0 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 2 },
      { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 4 },
      { id: 'w-e3', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 6 },
      { id: 'w-e4', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 7 },
      { id: 'w-e5', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 7 },
      { id: 'w-e6', type: PieceType.Escort, owner: PlayerColor.White, x: 6, y: 7 },
      { id: 'w-e7', type: PieceType.Escort, owner: PlayerColor.White, x: 3, y: 7 },
      { id: 'w-e8', type: PieceType.Escort, owner: PlayerColor.White, x: 7, y: 7 },
      { id: 'w-e9', type: PieceType.Escort, owner: PlayerColor.White, x: 2, y: 7 },
      { id: 'w-e10', type: PieceType.Escort, owner: PlayerColor.White, x: 8, y: 7 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
    ];
    const e = SubspaceLatticeEngine.fromState(stateWith(chain), rules);
    const base = e.sectorControlRatio(PlayerColor.White);
    console.log('chain base', base, 'net', e.getSensorNetSet(PlayerColor.White).size);
    for (const m of e.listLegalMoves()) {
      const c = e.clone();
      c.movePiece(m.pieceId, m.to);
      const r = c.sectorControlRatio(PlayerColor.White);
      if (r > base + 0.02) console.log('gain', m.pieceId, m.to, base, '->', r);
      if (base < 0.49 && r >= 0.49) console.log('CROSS49', m.pieceId, m.to, r);
      if (base < 0.45 && r >= 0.45) console.log('CROSS45', m.pieceId, m.to, r);
    }
    expect(base).toBeGreaterThan(0);
  });
});
