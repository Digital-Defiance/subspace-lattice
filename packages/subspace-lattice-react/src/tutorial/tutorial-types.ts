import type { Coordinate, GameState, RulesConfig } from '@subspace-lattice/core';
import type { PlayerColor } from '@subspace-lattice/core';

export interface TutorialMove {
  pieceId: string;
  to: Coordinate;
}

/** One graded ply inside a lesson (single-move drills use exactly one). */
export interface TutorialStep {
  /** Plain-language reason for this order — shown in the coach panel. */
  why: string;
  objective: string;
  /** Optional line after this ply before the next step (or lesson success). */
  success?: string;
  playerMove: TutorialMove;
  /** Human seat for this ply. Default White. */
  seat?: PlayerColor;
  aiMove?: TutorialMove;
  focusCells?: readonly Coordinate[];
}

export interface TutorialLesson {
  id: string;
  number: string;
  title: string;
  concept: string;
  /** Chapter intro — shown above the active step’s why. */
  explanation: string;
  /** Final success copy when the last step completes. */
  success: string;
  rules: RulesConfig;
  createState: () => GameState;
  /** Multi-ply guided sequence. Prefer this for new lessons. */
  steps: readonly TutorialStep[];
  /**
   * `drill` (default): player must play the highlighted move.
   * `walkthrough`: pre-calculated game — Next plays each scripted ply for you.
   */
  presentation?: 'drill' | 'walkthrough';
  /** When false, Objective HUD shows live clock (fleet lessons). Default paused. */
  hudPaused?: boolean;
}
