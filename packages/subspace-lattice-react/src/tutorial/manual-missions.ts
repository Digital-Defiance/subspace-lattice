import {
  SubspaceLatticeEngine,
  resolveRulesConfig,
  type GameState,
  type RulesConfig,
} from '@subspace-lattice/core';
import type { TutorialLesson, TutorialStep } from './tutorial-types';
import { TUTORIAL_LESSONS } from './tutorial-model';
import { fleetOpeningWithoutInfiltrators } from './guided-missions';
import { stepsFromReplay } from './walkthrough-narrate';
import clockReplay from './data/mission-clock-replay';

/**
 * Advanced-manual view of the guided missions.
 *
 * Unlike the in-app academy (which joins Mission 3 near the sector clock),
 * the manual prints every ply of every game, so readers can study full
 * openings as well as finishes.
 */
export interface ManualMission {
  id: string;
  /** Chapter heading, e.g. "Mission 1 — Surgical Strike (short)". */
  title: string;
  /** Scene-setting paragraph before the first diagram. */
  intro: string;
  /** Post-game debrief paragraph. */
  outro: string;
  rules: RulesConfig;
  createState: () => GameState;
  steps: readonly TutorialStep[];
}

function lessonById(id: string): TutorialLesson {
  const lesson = TUTORIAL_LESSONS.find((candidate) => candidate.id === id);
  if (!lesson) throw new Error(`Missing tutorial lesson ${id}`);
  return lesson;
}

export function buildManualMissions(): ManualMission[] {
  const short = lessonById('mission-short-strike');
  const standard = lessonById('mission-standard-battle');
  const fleetRules = resolveRulesConfig('hybrid-fleet');

  return [
    {
      id: 'mission-short-strike',
      title: 'Mission 1 — Surgical Strike, the highlight reel',
      intro: short.explanation,
      outro: short.success,
      rules: short.rules,
      createState: short.createState,
      steps: short.steps,
    },
    {
      id: 'mission-standard-battle',
      title: 'Mission 2 — A standard battle (57 plies)',
      intro: standard.explanation,
      outro: standard.success,
      rules: standard.rules,
      createState: standard.createState,
      steps: standard.steps,
    },
    {
      id: 'mission-clock-finish',
      // The academy joins this game at ply 96; the manual shows all of it.
      title: `Mission 3 — When the clock decides (${clockReplay.plies} plies)`,
      intro:
        `The full ${clockReplay.plies}-ply record of the academy's sector-clock mission. ` +
        'In the app you join near activation (ply 100); here you can study the whole ' +
        'siege: how both fleets dig in, why no Hub ever falls, and how coverage — not ' +
        'capture — finally ends it. White wins by Sector Integration.',
      outro:
        'White wins by Sector Integration. The clock only matters after activation; ' +
        'Surgical Strike remains the primary hunt until then. When both fleets dig in, ' +
        'coverage and Contested Space stop eternal turtling.',
      rules: fleetRules,
      createState: () => fleetOpeningWithoutInfiltrators(fleetRules),
      steps: stepsFromReplay(clockReplay.moves, { clockArmedFromPly: 100 }),
    },
  ];
}

/** Engine positioned after `plyCount` steps of a manual mission. */
export function manualMissionEngineAt(
  mission: ManualMission,
  plyCount: number,
): SubspaceLatticeEngine {
  const engine = SubspaceLatticeEngine.fromState(
    mission.createState(),
    mission.rules,
  );
  for (let i = 0; i < plyCount; i++) {
    const step = mission.steps[i]!;
    if (!engine.movePiece(step.playerMove.pieceId, step.playerMove.to)) {
      throw new Error(
        `Manual mission ${mission.id} replay failed at ply ${i + 1}`,
      );
    }
  }
  return engine;
}
