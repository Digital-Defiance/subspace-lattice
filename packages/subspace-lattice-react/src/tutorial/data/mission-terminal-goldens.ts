import {
  terminalLockoutInRange,
  terminalMissOutOfRange,
  type TerminalGolden,
} from '@subspace-lattice/core';
import type { TutorialStep } from '../tutorial-types';

/**
 * Content-factory missions sourced from frozen Terminal goldens
 * (`terminal-goldens.ts`). Used by the advanced manual + Academy Ep.11.
 */

function fromGolden(g: TerminalGolden) {
  return {
    rules: g.rules,
    createState: () => structuredClone(g.state),
  };
}

const lockout = terminalLockoutInRange();
const miss = terminalMissOutOfRange();

export const terminalLockoutFire = fromGolden(lockout);
export const terminalRefuseMiss = fromGolden(miss);

/** Single-ply Lockout: fire EMP while enemy Hub is in radius. */
export const terminalLockoutFireSteps: readonly TutorialStep[] = [
  {
    why: 'Terminal Overclock is armed and the enemy Hub sits inside your blast. Fire Command Overload for Lockout — your drives fuse, but Black has zero replies.',
    objective: 'Fire Terminal EMP for Lockout',
    playerMove: { type: 'emp' },
    focusCells: [
      { x: 2, y: 2 },
      { x: 2, y: 4 },
    ],
  },
];

/** Refuse the suicide shot; close Chebyshev distance instead. */
export const terminalRefuseMissSteps: readonly TutorialStep[] = [
  {
    why: 'EMP is armed, but Black sits one ring outside the cyan blast disc. Firing now fuses you for nothing. Step in so the disc covers their Hub — then you would Lockout.',
    objective: 'Step closer until the cyan blast covers Black’s Hub — do not fire yet',
    playerMove: { pieceId: 'w-ch', to: { x: 4, y: 5 } },
    focusCells: [
      { x: 4, y: 4 },
      { x: 4, y: 5 },
      { x: 4, y: 8 },
    ],
  },
];
