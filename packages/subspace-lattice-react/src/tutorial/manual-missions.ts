import {
  SubspaceLatticeEngine,
  resolveFleetLobbyRules,
  resolveRulesConfig,
  type GameState,
  type RulesConfig,
} from '@subspace-lattice/core';
import type { TutorialLesson, TutorialStep } from './tutorial-types';
import { isEmpTutorialMove } from './tutorial-types';
import { TUTORIAL_LESSONS } from './tutorial-model';
import { fleetOpeningWithoutInfiltrators } from './guided-missions';
import { stepsFromReplay } from './walkthrough-narrate';
import clockReplay from './data/mission-clock-replay';
import clockAnnotations from './data/mission-clock-annotations';
import fleetSkirmishReplay from './data/mission-ai-fleet-skirmish-replay';
import infiltratorReplay from './data/mission-ai-infiltrator-replay';
import lockoutReplay from './data/mission-ai-lockout-replay';
import {
  createEmpLockoutState,
  empLockoutRules,
  empLockoutSteps,
} from './data/mission-emp-lockout';

/**
 * Advanced-manual view of the guided missions.
 *
 * Unlike the in-app academy (which joins Mission 3 near the sector clock),
 * the manual prints every ply of every game, so readers can study full
 * openings as well as finishes.
 *
 * Also includes AI-generated academy video missions (Fleet Draft skirmish,
 * Infiltrator deep dive, Lockout squeeze).
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
  const fleetDraftRules = resolveFleetLobbyRules({
    heavyWingPreset: 'fleet-draft',
  });
  const lockoutRules = resolveRulesConfig('hybrid-fleet', {
    sectorActivationPly: 10_000,
    sectorHoldPlies: 999,
  });

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
        'Plan from the first Escort: neither Hub will fall, so every relay and Hub walk ' +
        'is stockpiling Sovereign Space for ply 100+. In the app you join near activation; ' +
        'here you see the whole siege. White wins by Sector Integration.',
      outro:
        'White wins by Sector Integration — coverage held past the threshold, no Hub taken. ' +
        'Surgical Strike was legal the whole way; dig-in play simply never found it. ' +
        'Contested Space and Hub marches are the late weapons when Strike stalls.',
      rules: fleetRules,
      createState: () => fleetOpeningWithoutInfiltrators(fleetRules),
      steps: stepsFromReplay(clockReplay.moves, {
        clockArmedFromPly: 100,
        annotations: clockAnnotations,
      }),
    },
    {
      id: 'mission-emp-lockout',
      title: 'Mission 4 — Lockout via Command Overload',
      intro:
        'A short Lockout highlight reel. White’s Hub has been stationary long ' +
        'enough that EMP is armed (charge 15/15, blast radius 2). Black still ' +
        'has one Escort outside the blast — remove that escape hatch, then ' +
        'spend the turn on Command Overload. Bodies alone almost never force ' +
        'zero replies against a live Hub; EMP is the practical path.',
      outro:
        'White wins by Lockout (winnerReason=no-moves). Anchor the Hub, charge ' +
        'on non-Hub plies, corner every enemy ship inside the radius, then fire. ' +
        'Only enemy engines freeze — your fleet is never in the blast; the cost ' +
        'is spending the whole turn.',
      rules: empLockoutRules,
      createState: createEmpLockoutState,
      steps: empLockoutSteps,
    },
    {
      id: 'mission-ai-fleet-skirmish',
      title: `AI Mission — Fleet Draft skirmish (${fleetSkirmishReplay.plies} plies)`,
      intro:
        'MCTS vs MCTS under Fleet Draft (Refractor + Hub-anchored Carrier). ' +
        'Academy Episode 9 drops into the midgame and runs the five-question scan live.',
      outro:
        'Same Sensor Net law as Standard Beams — wider geometry from the Heavy wing. ' +
        'Scan files and diagonals; refuse hangs on both.',
      rules: fleetDraftRules,
      createState: () => new SubspaceLatticeEngine({ rules: fleetDraftRules }).getStateCopy(),
      steps: stepsFromReplay(fleetSkirmishReplay.moves),
    },
    {
      id: 'mission-ai-infiltrator',
      title: `AI Mission — Infiltrator deep dive (${infiltratorReplay.plies} plies)`,
      intro:
        'Heuristic AI vs Heuristic AI on hybrid-fleet. Warps through unclaimed space, ' +
        'then a Target-Locked crawl that kills the folding-drive.',
      outro:
        'Phase Runners only warp while undetected. Push into hostile coverage and the ' +
        'engines lock — one orthogonal step, no jump.',
      rules: fleetRules,
      createState: () => new SubspaceLatticeEngine({ rules: fleetRules }).getStateCopy(),
      steps: stepsFromReplay(infiltratorReplay.moves),
    },
    {
      id: 'mission-ai-lockout',
      title: `AI Mission — Lockout squeeze (${lockoutReplay.plies} plies)`,
      intro:
        'Mobility-pressure AI vs Random with the sector clock deferred. ' +
        'Historical near-Lockout teaching window (pre-EMP); immobility is defeat.',
      outro:
        'Bodies alone rarely reach true zero replies while a Hub lives. ' +
        'See Mission 4 for Command Overload finishing Lockout.',
      rules: lockoutRules,
      createState: () => new SubspaceLatticeEngine({ rules: lockoutRules }).getStateCopy(),
      steps: stepsFromReplay(lockoutReplay.moves),
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
    const move = step.playerMove;
    const ok = isEmpTutorialMove(move)
      ? engine.fireEmp()
      : engine.movePiece(move.pieceId, move.to);
    if (!ok) {
      throw new Error(
        `Manual mission ${mission.id} replay failed at ply ${i + 1}`,
      );
    }
  }
  return engine;
}
