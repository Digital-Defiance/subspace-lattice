import { describe, expect, it } from 'vitest';
import {
  explainAdvisorMove,
  formatAdvisorSuggestion,
  shouldRecordLocalAiTei,
  suggestAdvisorMove,
} from './advisor';
import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType, PlayerColor } from '../interfaces';
import { createSequenceRng } from './heuristic-ai';

/** Place Black escort adjacent to White hub so Black can capture. */
function engineWithHubCaptureOpportunity(): SubspaceLatticeEngine {
  const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid-fleet' });
  const state = structuredClone(engine.getState());
  state.currentPlayer = PlayerColor.Black;
  const escort = state.pieces['b-e3']!;
  const old = state.cells.find(
    (c) =>
      c.coordinate.x === escort.position.x &&
      c.coordinate.y === escort.position.y,
  )!;
  old.pieceId = undefined;
  escort.position = { x: 5, y: 1 };
  const cell = state.cells.find(
    (c) => c.coordinate.x === 5 && c.coordinate.y === 1,
  )!;
  cell.pieceId = 'b-e3';
  return SubspaceLatticeEngine.fromState(state);
}

describe('suggestAdvisorMove', () => {
  it('returns a legal coaching suggestion for White to move', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid-fleet' });
    const tip = suggestAdvisorMove(engine, 'fast', createSequenceRng([0.1]));
    expect(tip).not.toBeNull();
    expect(tip!.pieceId).toBeTruthy();
    expect(tip!.reasons.length).toBeGreaterThan(0);
    expect(tip!.reasons.length).toBeLessThanOrEqual(4);
    expect(tip!.summary).toMatch(/→/);
    const piece = engine.getPiece(tip!.pieceId);
    expect(piece?.owner).toBe(PlayerColor.White);
    expect(engine.canMovePiece(piece!, tip!.to)).toBe(true);
  });

  it('returns null when the game is over', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid-fleet' });
    const state = engine.getState();
    const done = SubspaceLatticeEngine.fromState({
      ...state,
      winner: PlayerColor.White,
      winnerReason: 'hub-capture',
    });
    expect(suggestAdvisorMove(done, 'fast')).toBeNull();
  });

  it('prefers capturing the enemy hub when available', () => {
    const live = engineWithHubCaptureOpportunity();
    const tip = suggestAdvisorMove(live, 'fast', createSequenceRng([0]));
    expect(tip).not.toBeNull();
    expect(tip!.to).toEqual({ x: 5, y: 0 });
    expect(live.getPieceAt(tip!.to)?.type).toBe(PieceType.CommandHub);
    expect(tip!.reasons.some((r) => /Command Hub|win condition/i.test(r))).toBe(
      true,
    );
  });

  it('labels the suggestion with the requested strength (normal budget)', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid-fleet' });
    const tip = suggestAdvisorMove(engine, 'normal', createSequenceRng([0.2]));
    expect(tip).not.toBeNull();
    expect(tip!.strength).toBe('normal');
  }, 15_000);
});

describe('explainAdvisorMove', () => {
  it('mentions hub capture for a winning take', () => {
    const live = engineWithHubCaptureOpportunity();
    const lines = explainAdvisorMove(
      live,
      { pieceId: 'b-e3', to: { x: 5, y: 0 } },
      PlayerColor.Black,
    );
    expect(lines[0]).toMatch(/Escort/);
    expect(lines.some((l) => /win condition/i.test(l))).toBe(true);
    expect(lines.length).toBeLessThanOrEqual(4);
  });

  it('mentions closing on the hub for a non-capture approach', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid-fleet' });
    const escort = Object.values(engine.getState().pieces).find(
      (p) => p.owner === PlayerColor.White && p.type === PieceType.Escort,
    )!;
    const to = { x: escort.position.x, y: escort.position.y + 1 };
    expect(engine.canMovePiece(escort, to)).toBe(true);
    const lines = explainAdvisorMove(engine, {
      pieceId: escort.id,
      to,
    });
    expect(lines.some((l) => /Closes distance|Command Hub/i.test(l))).toBe(
      true,
    );
  });
});

describe('formatAdvisorSuggestion / TEI policy', () => {
  it('formats a compact summary line', () => {
    expect(
      formatAdvisorSuggestion(
        { x: 1, y: 2 },
        { x: 3, y: 4 },
        PieceType.Beam,
      ),
    ).toBe('Beam (1,2) → (3,4)');
  });

  it('skips TEI when the match was assisted', () => {
    expect(shouldRecordLocalAiTei(false)).toBe(true);
    expect(shouldRecordLocalAiTei(true)).toBe(false);
  });
});
