import { describe, expect, it } from 'vitest';
import {
  CellType,
  PieceType,
  PlayerColor,
  SubspaceLatticeEngine,
  resolveRulesConfig,
} from '@subspace-lattice/core';
import {
  hasContestedSensorNet,
  resolveSoundtrackPhase,
  soundtrackPhasePools,
} from './soundtrack';

function stripToLoneHubs(engine: SubspaceLatticeEngine): void {
  const state = engine.getState();
  for (const [id, piece] of Object.entries(state.pieces)) {
    if (piece.type === PieceType.CommandHub) continue;
    const cell = state.cells.find(
      (c) =>
        c.coordinate.x === piece.position.x &&
        c.coordinate.y === piece.position.y,
    );
    if (cell) delete cell.pieceId;
    delete state.pieces[id];
  }
}

describe('resolveSoundtrackPhase', () => {
  it('starts in opening on a fresh fleet match', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const engine = new SubspaceLatticeEngine({ rules });
    // Opening nets usually do not overlap yet.
    expect(resolveSoundtrackPhase(engine)).toBe('opening');
  });

  it('enters midgame when nets first contest', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      sectorActivationPly: 100,
    });
    const engine = new SubspaceLatticeEngine({ rules });
    // Force overlap: expand by moving nothing — place a black escort into white net.
    const state = engine.getState();
    // Hub radii already overlap near center in some configs; check actual.
    if (!hasContestedSensorNet(engine)) {
      // Drag black hub toward white territory enough to overlap.
      const blackHub = state.pieces['b-ch'];
      expect(blackHub).toBeTruthy();
      const from = state.cells.find(
        (c) =>
          c.coordinate.x === blackHub!.position.x &&
          c.coordinate.y === blackHub!.position.y,
      )!;
      delete from.pieceId;
      blackHub!.position = { x: 5, y: 4 };
      const dest = state.cells.find(
        (c) => c.coordinate.x === 5 && c.coordinate.y === 4,
      )!;
      if (dest.type !== CellType.GravityWell) dest.pieceId = 'b-ch';
    }
    const live = SubspaceLatticeEngine.fromState(engine.getState(), rules);
    expect(hasContestedSensorNet(live)).toBe(true);
    expect(resolveSoundtrackPhase(live)).toBe('midgame');
  });

  it('enters siege at sectorActivationPly once contested', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      sectorActivationPly: 100,
    });
    const setup = new SubspaceLatticeEngine({ rules });
    const state = structuredClone(setup.getState());
    // Keep non-Hub ships so Terminal does not arm; nudge Hubs for contested.
    const whiteHub = state.pieces['w-ch']!;
    const blackHub = state.pieces['b-ch']!;
    const clear = (piece: { position: { x: number; y: number } }) => {
      const cell = state.cells.find(
        (c) =>
          c.coordinate.x === piece.position.x &&
          c.coordinate.y === piece.position.y,
      );
      if (cell) delete cell.pieceId;
    };
    clear(whiteHub);
    clear(blackHub);
    whiteHub.position = { x: 5, y: 3 };
    blackHub.position = { x: 5, y: 7 };
    for (const hub of [whiteHub, blackHub]) {
      const dest = state.cells.find(
        (c) =>
          c.coordinate.x === hub.position.x &&
          c.coordinate.y === hub.position.y,
      )!;
      dest.pieceId = hub.id;
    }
    state.plyCount = 100;
    delete state.terminalPhaseArmed;
    delete state.terminalPhaseArmedAtPly;
    const live = SubspaceLatticeEngine.fromState(state, rules);
    expect(live.getState().terminalPhaseArmed).toBeFalsy();
    expect(hasContestedSensorNet(live)).toBe(true);
    expect(resolveSoundtrackPhase(live)).toBe('siege');
  });

  it('terminal overrides siege when Phase 3 arms', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      sectorActivationPly: 100,
    });
    const setup = new SubspaceLatticeEngine({ rules });
    stripToLoneHubs(setup);
    const state = setup.getState();
    state.plyCount = 120;
    state.terminalPhaseArmed = true;
    state.terminalPhaseArmedAtPly = 80;
    const live = SubspaceLatticeEngine.fromState(state, rules);
    expect(resolveSoundtrackPhase(live)).toBe('terminal');
  });

  it('resolved when a winner is set', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const engine = new SubspaceLatticeEngine({ rules });
    const state = engine.getState();
    state.winner = PlayerColor.White;
    state.winnerReason = 'hub-capture';
    const live = SubspaceLatticeEngine.fromState(state, rules);
    expect(resolveSoundtrackPhase(live)).toBe('resolved');
  });
});

describe('soundtrackPhasePools', () => {
  it('command deck plays Void Call then Void Call 2', () => {
    expect(soundtrackPhasePools()['command-deck']).toEqual([
      'Void Call',
      'Void Call 2',
    ]);
  });

  it('lobby plays Pre-Mission Tension then Pre-Mission Tension 2', () => {
    expect(soundtrackPhasePools().lobby).toEqual([
      'Pre-Mission Tension',
      'Pre-Mission Tension 2',
    ]);
  });
});
