import { PlayerColor } from '@subspace-lattice/core';
import { describe, expect, it } from 'vitest';
import {
  narrateMissionPly,
  stepsFromReplay,
  type MissionReplayMove,
} from './walkthrough-narrate';

const escortStep: MissionReplayMove = {
  seat: 'WHITE',
  pieceId: 'w-e1',
  from: { x: 4, y: 0 },
  to: { x: 4, y: 1 },
  pieceType: 'ESCORT',
};

describe('narrateMissionPly', () => {
  it('keeps quiet plies to a short callout', () => {
    const step = narrateMissionPly(escortStep, 8, 57);
    expect(step.why).toBe('White Escort to (4,1).');
  });

  it('still narrates Surgical Strike captures', () => {
    const step = narrateMissionPly(
      {
        ...escortStep,
        to: { x: 6, y: 6 },
        captured: 'b-ch',
        pieceType: 'ESCORT',
      },
      56,
      57,
    );
    expect(step.why).toMatch(/Command Hub/);
    expect(step.objective).toMatch(/Surgical Strike/);
  });
});

describe('stepsFromReplay annotations', () => {
  it('prefers sparse human why over the fallback callout', () => {
    const [step] = stepsFromReplay([escortStep], {
      annotations: {
        1: {
          why: 'White starts the left relay chain.',
          objective: 'Open the left file.',
        },
      },
    });
    expect(step.why).toBe('White starts the left relay chain.');
    expect(step.objective).toBe('Open the left file.');
    expect(step.seat).toBe(PlayerColor.White);
    expect(step.playerMove).toEqual({ pieceId: 'w-e1', to: { x: 4, y: 1 } });
  });

  it('resolves annotations by absolute ply when startPlyOffset is set', () => {
    const [step] = stepsFromReplay([escortStep], {
      startPlyOffset: 99,
      annotations: {
        100: { why: 'Sector clock arms.' },
      },
    });
    expect(step.why).toBe('Sector clock arms.');
  });
});
