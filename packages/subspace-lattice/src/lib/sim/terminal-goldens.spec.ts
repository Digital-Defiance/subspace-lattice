import { describe, expect, it } from 'vitest';
import { evaluatePosition } from '../ai/evaluate';
import { HeuristicAi, createSequenceRng, createSeededRng } from '../ai/heuristic-ai';
import { MctsAi } from '../ai/mcts-ai';
import { isEmpAgentMove } from '../ai/agent';
import { explainAdvisorMove, suggestAdvisorMove } from '../ai/advisor';
import { findImmediateWinningMove } from '../ai/tactical';
import { PlayerColor } from '../interfaces';
import {
  engineFromGolden,
  terminalCloseForBlast,
  terminalLockoutInRange,
  terminalMissOutOfRange,
  TERMINAL_GOLDENS,
} from './terminal-goldens';

describe('Terminal goldens — eval', () => {
  it('scores armed in-range Lockout far above out-of-range armed miss', () => {
    const hit = engineFromGolden(terminalLockoutInRange());
    const miss = engineFromGolden(terminalMissOutOfRange());
    const hitScore = evaluatePosition(hit, PlayerColor.White);
    const missScore = evaluatePosition(miss, PlayerColor.White);
    expect(hitScore).toBeGreaterThanOrEqual(98_500);
    expect(hitScore).toBeGreaterThan(missScore + 2_000);
  });

  it('scores opponent-to-move Lockout EMP as near loss for the victim', () => {
    const hit = engineFromGolden(terminalLockoutInRange());
    // White to move can Lockout — Black's eval must scream danger.
    expect(evaluatePosition(hit, PlayerColor.Black)).toBeLessThanOrEqual(
      -98_500,
    );
  });

  it('rewards Terminal charge progress', () => {
    const low = engineFromGolden(terminalCloseForBlast());
    const high = engineFromGolden(terminalCloseForBlast());
    high.getState().empCharge = {
      [PlayerColor.White]: 2,
      [PlayerColor.Black]: 0,
    };
    expect(
      evaluatePosition(high, PlayerColor.White),
    ).toBeGreaterThan(evaluatePosition(low, PlayerColor.White));
  });
});

describe('Terminal goldens — agents', () => {
  it('tactical shortcut fires EMP for in-range Lockout', () => {
    const live = engineFromGolden(terminalLockoutInRange());
    const win = findImmediateWinningMove(live);
    expect(win && isEmpAgentMove(win)).toBe(true);
  });

  it('heuristic fires EMP for in-range Lockout', () => {
    const live = engineFromGolden(terminalLockoutInRange());
    const choice = new HeuristicAi(createSequenceRng([0])).chooseMove(live);
    expect(choice && isEmpAgentMove(choice)).toBe(true);
  });

  it('heuristic refuses out-of-range armed EMP', () => {
    const live = engineFromGolden(terminalMissOutOfRange());
    const choice = new HeuristicAi(createSequenceRng([0])).chooseMove(live);
    expect(choice).not.toBeNull();
    expect(isEmpAgentMove(choice!)).toBe(false);
  });

  it('MCTS refuses out-of-range armed EMP', () => {
    const live = engineFromGolden(terminalMissOutOfRange());
    const choice = new MctsAi({
      simulations: 40,
      quiescencePlies: 4,
      rolloutEpsilon: 0.1,
      rng: createSeededRng(42),
    }).chooseMove(live);
    expect(choice).not.toBeNull();
    expect(isEmpAgentMove(choice!)).toBe(false);
  });

  it('MCTS fires EMP for in-range Lockout', () => {
    const live = engineFromGolden(terminalLockoutInRange());
    const choice = new MctsAi({
      simulations: 12,
      rng: createSequenceRng([0, 0.1, 0.2, 0.3]),
    }).chooseMove(live);
    expect(choice && isEmpAgentMove(choice)).toBe(true);
  });

  it('prefers closing Chebyshev distance while charging', () => {
    const g = terminalCloseForBlast();
    const live = engineFromGolden(g);
    const hub = live.getPiece('w-ch')!;
    const enemy = live.getPiece('b-ch')!;
    const before = Math.max(
      Math.abs(hub.position.x - enemy.position.x),
      Math.abs(hub.position.y - enemy.position.y),
    );
    const choice = new HeuristicAi(createSequenceRng([0])).chooseMove(live);
    expect(choice).not.toBeNull();
    expect(isEmpAgentMove(choice!)).toBe(false);
    if (isEmpAgentMove(choice!)) return;
    const after = Math.max(
      Math.abs(choice!.to.x - enemy.position.x),
      Math.abs(choice!.to.y - enemy.position.y),
    );
    expect(after).toBeLessThan(before);
  });
});

describe('Terminal goldens — coach', () => {
  it('explains Lockout EMP in range', () => {
    const live = engineFromGolden(terminalLockoutInRange());
    const lines = explainAdvisorMove(live, { type: 'emp' }, PlayerColor.White);
    expect(lines.some((l) => /Lockout|blast/i.test(l))).toBe(true);
    expect(lines.some((l) => /armed|Charge/i.test(l))).toBe(true);
  });

  it('warns on out-of-range EMP', () => {
    const live = engineFromGolden(terminalMissOutOfRange());
    const lines = explainAdvisorMove(live, { type: 'emp' }, PlayerColor.White);
    expect(lines.some((l) => /outside|miss/i.test(l))).toBe(true);
  });

  it('mentions Terminal charge on Hub steps', () => {
    const live = engineFromGolden(terminalCloseForBlast());
    const lines = explainAdvisorMove(
      live,
      { pieceId: 'w-ch', to: { x: 4, y: 6 } },
      PlayerColor.White,
    );
    expect(lines.some((l) => /Terminal charge/i.test(l))).toBe(true);
  });

  it('suggestAdvisorMove fires Lockout tip', () => {
    const live = engineFromGolden(terminalLockoutInRange());
    const tip = suggestAdvisorMove(live, 'fast', createSequenceRng([0]));
    expect(tip).not.toBeNull();
    expect(tip!.summary).toMatch(/EMP|Overload/i);
    expect(tip!.reasons.some((r) => /Lockout|blast|armed/i.test(r))).toBe(
      true,
    );
  });
});

describe('Terminal goldens catalog', () => {
  it('exposes the frozen regression set', () => {
    expect(TERMINAL_GOLDENS.map((g) => g.id)).toEqual([
      'terminal-lockout-in-range',
      'terminal-miss-out-of-range',
      'terminal-close-for-blast',
    ]);
  });
});
