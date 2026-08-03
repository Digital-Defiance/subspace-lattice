import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from '../game-engine';
import { CellType } from '../interfaces/cellType';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig } from '../rules/rules-config';
import {
  aggregateCoverageStats,
  isContestedNetStall,
  sampleNetCoverage,
} from './atlas-coverage';
import { playMatch } from './match-runner';
import { HeuristicAi } from '../ai/heuristic-ai';
import { createSeededRng } from '../ai/rng';

describe('atlas coverage sampling', () => {
  it('samples exclusive cov, raw nets, and contested ∩', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const engine = new SubspaceLatticeEngine({ rules });
    const state = engine.getState();
    for (const c of state.cells) delete c.pieceId;
    state.pieces = {};
    state.pieces['w-ch'] = {
      id: 'w-ch',
      type: PieceType.CommandHub,
      owner: PlayerColor.White,
      position: { x: 2, y: 2 },
    };
    state.pieces['b-ch'] = {
      id: 'b-ch',
      type: PieceType.CommandHub,
      owner: PlayerColor.Black,
      position: { x: 8, y: 8 },
    };
    for (const p of Object.values(state.pieces)) {
      const cell = state.cells.find(
        (c) => c.coordinate.x === p.position.x && c.coordinate.y === p.position.y,
      );
      if (!cell || cell.type === CellType.GravityWell) throw new Error('bad');
      cell.pieceId = p.id;
    }

    const s = sampleNetCoverage(engine);
    expect(s.netW).toBeGreaterThan(0);
    expect(s.netB).toBeGreaterThan(0);
    expect(s.covW).toBeGreaterThan(0);
    expect(s.covB).toBeGreaterThan(0);
    // Contested Space: exclusive cov ≤ raw/cells.
    expect(s.covW).toBeLessThanOrEqual(s.netW / 120 + 1e-9);
    expect(s.cont).toBeGreaterThanOrEqual(0);
  });

  it('flags contested-net stall when overlap is high and max cov < ρ', () => {
    expect(
      isContestedNetStall({
        covW: 0.3,
        covB: 0.28,
        cont: 24,
        netW: 50,
        netB: 48,
      }),
    ).toBe(true);
    expect(
      isContestedNetStall({
        covW: 0.46,
        covB: 0.2,
        cont: 24,
        netW: 50,
        netB: 48,
      }),
    ).toBe(false);
    expect(
      isContestedNetStall({
        covW: 0.2,
        covB: 0.2,
        cont: 2,
        netW: 10,
        netB: 10,
      }),
    ).toBe(false);
  });

  it('aggregates stall rate; ignores legacy plies without cov', () => {
    const stats = aggregateCoverageStats([
      { covW: 0.3, covB: 0.28, netW: 50, netB: 48, cont: 24 },
      { covW: 0.5, covB: 0.2, netW: 60, netB: 30, cont: 5 },
      { mover: 'Escort' } as never,
      null,
    ]);
    expect(stats).not.toBeNull();
    expect(stats!.pliesWithCoverage).toBe(2);
    expect(stats!.stallPlies).toBe(1);
    expect(stats!.stallRate).toBe(0.5);
  });

  it('playMatch attaches coverage to every ReplayPly', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const rng = createSeededRng(11);
    const result = playMatch(new HeuristicAi(rng), new HeuristicAi(rng), {
      rules,
      maxPlies: 8,
    });
    expect(result.replay.length).toBeGreaterThan(0);
    for (const ply of result.replay) {
      expect(typeof ply.covW).toBe('number');
      expect(typeof ply.covB).toBe('number');
      expect(typeof ply.netW).toBe('number');
      expect(typeof ply.netB).toBe('number');
      expect(typeof ply.cont).toBe('number');
    }
  });
});
