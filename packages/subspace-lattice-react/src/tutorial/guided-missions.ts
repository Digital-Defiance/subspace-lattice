import {
  PieceType,
  SubspaceLatticeEngine,
  resolveRulesConfig,
  type GameState,
  type RulesConfig,
} from '@subspace-lattice/core';
import type { TutorialLesson } from './tutorial-types';
import { stepsFromReplay, type MissionReplayMove } from './walkthrough-narrate';
import standardReplay from './data/mission-standard-replay';
import standardAnnotations from './data/mission-standard-annotations';
import clockReplay from './data/mission-clock-replay';
import clockAnnotations from './data/mission-clock-annotations';

const fleetRules = resolveRulesConfig('hybrid-fleet');
const fleetNoClock = resolveRulesConfig('hybrid-fleet', {
  sectorActivationPly: 999,
});

const standard = standardReplay;
const clock = clockReplay;

/** Hybrid-fleet opening with Infiltrators removed (matches recorded missions). */
export function fleetOpeningWithoutInfiltrators(
  rules: RulesConfig = fleetRules,
): GameState {
  const engine = new SubspaceLatticeEngine({ rules });
  const state = engine.getStateCopy();
  for (const id of Object.keys(state.pieces)) {
    const piece = state.pieces[id]!;
    if (piece.type !== PieceType.Infiltrator) continue;
    const cell = state.cells.find(
      (c) =>
        c.coordinate.x === piece.position.x &&
        c.coordinate.y === piece.position.y,
    );
    if (cell) delete cell.pieceId;
    delete state.pieces[id];
  }
  return state;
}

function replayPrefix(
  moves: readonly MissionReplayMove[],
  count: number,
  rules: RulesConfig,
): GameState {
  const eng = SubspaceLatticeEngine.fromState(
    fleetOpeningWithoutInfiltrators(rules),
    rules,
  );
  for (let i = 0; i < count; i++) {
    const m = moves[i]!;
    if (!eng.movePiece(m.pieceId, m.to)) {
      throw new Error(`Mission replay failed at ply ${i + 1} (${m.pieceId})`);
    }
  }
  return eng.getStateCopy();
}

/** Chess-length Surgical Strike (~40–60 plies), pre-calculated. */
export function buildStandardBattleMission(): TutorialLesson {
  return {
    id: 'mission-standard-battle',
    number: '17',
    title: 'Mission: Standard battle',
    concept: 'Guided mission · chess-length game',
    presentation: 'walkthrough',
    explanation: `Guided mission 2 of 3. Fixed ${standard.plies}-ply game: White is building toward Surgical Strike — park Beams, grow Escorts so those Beams can ride, march the Hub for coverage, then peel the enemy Hub’s screen. Quiet hops are just relay work; use “Play next 5” to skim them.`,
    success: `Mission complete. White wins by Surgical Strike after ${standard.plies} plies — the usual finish when the Hub hunt works. Next: a dig-in game where Strike never lands and the sector clock decides.`,
    rules: fleetNoClock,
    createState: () => fleetOpeningWithoutInfiltrators(fleetNoClock),
    steps: stepsFromReplay(standard.moves, {
      annotations: standardAnnotations,
    }),
  };
}

/**
 * Late territorial finish: join after the clock arms, watch Sector Integration.
 */
export function buildClockFinishMission(): TutorialLesson {
  const joinAfter = Math.min(95, Math.max(0, clock.plies - 20));
  const remaining = clock.moves.slice(joinAfter);
  return {
    id: 'mission-clock-finish',
    number: '18',
    title: 'Mission: When the clock decides',
    concept: 'Guided mission · Sector Integration',
    presentation: 'walkthrough',
    hudPaused: false,
    explanation: `Guided mission 3 of 3. We join at ply ${joinAfter + 1} of a ${clock.plies}-ply dig-in: neither Hub falls. After ply 100 the scoreboard is Sovereign Space — White wins by Sector Integration. Watch coverage and Contested Space on the HUD.`,
    success: `Mission complete. White wins by Sector Integration — saturation, not decapitation. Strike stays legal until the end; here the fleets simply never found it.`,
    rules: fleetRules,
    createState: () => replayPrefix(clock.moves, joinAfter, fleetRules),
    steps: stepsFromReplay(remaining, {
      clockArmedFromPly: 100,
      startPlyOffset: joinAfter,
      annotations: clockAnnotations,
    }),
  };
}
