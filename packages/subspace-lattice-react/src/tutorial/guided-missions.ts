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
import clockReplay from './data/mission-clock-replay';

const fleetRules = resolveRulesConfig('hybrid-fleet');
const fleetNoClock = resolveRulesConfig('hybrid-fleet', {
  sectorActivationPly: 999,
});

const standard = standardReplay;
const clock = clockReplay;

/** Soft-ship opening with Infiltrators removed (matches recorded missions). */
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
    explanation: `Guided mission 2 of 3. A fixed ${standard.plies}-ply fleet game (no live AI)—chess ballpark. Infiltrators omitted so the story stays on Escorts, Beams, and the Hub hunt. Use “Play next 5” to skim quiet stretches. White wins by Surgical Strike.`,
    success: `Mission complete. White wins by Surgical Strike after ${standard.plies} plies. That length is normal for hybrid-fleet when the Hub hunt succeeds. Next: what happens when both Hubs survive into the sector clock.`,
    rules: fleetNoClock,
    createState: () => fleetOpeningWithoutInfiltrators(fleetNoClock),
    steps: stepsFromReplay(standard.moves),
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
    explanation: `Guided mission 3 of 3. This pre-calculated match ran ${clock.plies} plies; we join at ply ${joinAfter + 1}, near sector-clock activation (ply 100). Watch the HUD—White wins by Sector Integration when Hubs never fall.`,
    success: `Mission complete. White wins by Sector Integration. The clock only matters after activation; Surgical Strike remains the main hunt until then. When both fleets dig in, coverage and Contested Space stop eternal turtling.`,
    rules: fleetRules,
    createState: () => replayPrefix(clock.moves, joinAfter, fleetRules),
    steps: stepsFromReplay(remaining, {
      clockArmedFromPly: 100,
      startPlyOffset: joinAfter,
    }),
  };
}
