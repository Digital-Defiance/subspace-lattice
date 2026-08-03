/**
 * Smoke: Atlas Ep.12 mission plies must stay legal under hybrid-fleet.
 */
import { describe, expect, it } from 'vitest';
import {
  SubspaceLatticeEngine,
  PlayerColor,
} from '@subspace-lattice/core';
import {
  createOvertureState,
  createOvertureTrapState,
  createRefuseFringeState,
  createRollingStormState,
  createTrojanPayoffState,
  createHoldTheHubState,
  overtureRules,
  overtureSteps,
  overtureTrapSteps,
  refuseFringeRules,
  refuseFringeSteps,
  rollingStormRules,
  rollingStormSteps,
  trojanPayoffSteps,
  holdTheHubSteps,
} from './mission-atlas-midgame';
import { isEmpTutorialMove } from '../tutorial-types';

function play(
  createState: () => ReturnType<typeof createOvertureState>,
  rules: typeof overtureRules,
  steps: readonly {
    playerMove: unknown;
    seat?: PlayerColor;
  }[],
) {
  const engine = SubspaceLatticeEngine.fromState(createState(), rules);
  for (const step of steps) {
    if (isEmpTutorialMove(step.playerMove as never)) {
      throw new Error('unexpected EMP in atlas midgame smoke');
    }
    const move = step.playerMove as { pieceId: string; to: { x: number; y: number } };
    if (step.seat) {
      engine.getState().currentPlayer = step.seat;
    }
    expect(
      engine.movePiece(move.pieceId, move.to),
      `${move.pieceId} → (${move.to.x},${move.to.y})`,
    ).toBe(true);
  }
}

describe('mission-atlas-midgame', () => {
  it('plays Infiltrator Overture principal', () => {
    play(createOvertureState, overtureRules, [...overtureSteps]);
  });

  it('plays overture trap (4,6)', () => {
    play(createOvertureTrapState, overtureRules, [...overtureTrapSteps]);
  });

  it('plays refuse fringe', () => {
    play(createRefuseFringeState, refuseFringeRules, [...refuseFringeSteps]);
  });

  it('plays Trojan payoff', () => {
    play(createTrojanPayoffState, refuseFringeRules, [...trojanPayoffSteps]);
  });

  it('plays Rolling Storm', () => {
    play(createRollingStormState, rollingStormRules, [...rollingStormSteps]);
  });

  it('plays Hold the Hub', () => {
    play(createHoldTheHubState, rollingStormRules, [...holdTheHubSteps]);
  });
});
