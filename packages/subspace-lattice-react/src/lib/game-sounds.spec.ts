import { describe, expect, it } from 'vitest';
import {
  PieceType,
  PlayerColor,
  SubspaceLatticeEngine,
  resolveRulesConfig,
} from '@subspace-lattice/core';
import { collectLatticeSoundsAfterPly } from './game-sounds';

describe('collectLatticeSoundsAfterPly', () => {
  it('emits surgical-strike on hub capture', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      sectorActivationPly: 10_000,
      empChargeTarget: 0,
      empRadius: 0,
    });
    const engine = new SubspaceLatticeEngine({ rules });
    const before = structuredClone(engine.getState());
    // Force a hub-capture ending via resign is resignation; use winner injection.
    const after = structuredClone(before);
    after.winner = PlayerColor.White;
    after.winnerReason = 'hub-capture';
    expect(collectLatticeSoundsAfterPly(before, after, rules)).toEqual([
      'surgical-strike',
    ]);
  });

  it('emits command-overload when empActive appears', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const engine = new SubspaceLatticeEngine({ rules });
    const before = structuredClone(engine.getState());
    const after = structuredClone(before);
    after.empActive = {
      origin: { x: 5, y: 0 },
      radius: 3,
      firedBy: PlayerColor.White,
      targetSide: PlayerColor.Black,
      pliesRemaining: 1,
    };
    after.plyCount = (before.plyCount ?? 0) + 1;
    expect(collectLatticeSoundsAfterPly(before, after, rules)).toContain(
      'command-overload',
    );
  });

  it('emits infiltrator-warp when an infiltrator jumps', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const engine = new SubspaceLatticeEngine({ rules });
    const before = structuredClone(engine.getState());
    const after = structuredClone(before);
    const infiltrator = Object.values(after.pieces).find(
      (p) => p.type === PieceType.Infiltrator,
    );
    expect(infiltrator).toBeTruthy();
    infiltrator!.position = {
      x: infiltrator!.position.x + 3,
      y: infiltrator!.position.y,
    };
    after.plyCount = (before.plyCount ?? 0) + 1;
    expect(
      collectLatticeSoundsAfterPly(before, after, rules, {
        moverType: PieceType.Infiltrator,
      }),
    ).toContain('infiltrator-warp');
  });

  it('emits escort-move when an escort relocates', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const engine = new SubspaceLatticeEngine({ rules });
    const before = structuredClone(engine.getState());
    const after = structuredClone(before);
    const escort = Object.values(after.pieces).find(
      (p) => p.type === PieceType.Escort,
    );
    expect(escort).toBeTruthy();
    escort!.position = {
      x: escort!.position.x,
      y: escort!.position.y + 1,
    };
    after.plyCount = (before.plyCount ?? 0) + 1;
    expect(
      collectLatticeSoundsAfterPly(before, after, rules, {
        moverType: PieceType.Escort,
      }),
    ).toContain('escort-move');
  });

  it('emits beam-move when a beam relocates', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const engine = new SubspaceLatticeEngine({ rules });
    const before = structuredClone(engine.getState());
    const after = structuredClone(before);
    const beam = Object.values(after.pieces).find(
      (p) => p.type === PieceType.Beam,
    );
    expect(beam).toBeTruthy();
    beam!.position = { x: beam!.position.x + 2, y: beam!.position.y };
    after.plyCount = (before.plyCount ?? 0) + 1;
    expect(collectLatticeSoundsAfterPly(before, after, rules)).toContain(
      'beam-move',
    );
  });

  it('emits capture when a piece is removed', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const engine = new SubspaceLatticeEngine({ rules });
    const before = structuredClone(engine.getState());
    const after = structuredClone(before);
    const pieces = Object.values(after.pieces);
    const victim = pieces.find((p) => p.type === PieceType.Escort);
    const mover = pieces.find(
      (p) => p.id !== victim?.id && p.type !== PieceType.CommandHub,
    );
    expect(victim).toBeTruthy();
    expect(mover).toBeTruthy();
    mover!.position = { ...victim!.position };
    delete after.pieces[victim!.id];
    after.plyCount = (before.plyCount ?? 0) + 1;
    const sounds = collectLatticeSoundsAfterPly(before, after, rules, {
      moverType: mover!.type,
      capturedType: PieceType.Escort,
    });
    expect(sounds).toContain('capture');
  });

  it('emits infiltrator-spool on spool announce', () => {
    const rules = resolveRulesConfig('hybrid-spool');
    const engine = new SubspaceLatticeEngine({ rules });
    const before = structuredClone(engine.getState());
    const after = structuredClone(before);
    const infiltrator = Object.values(after.pieces).find(
      (p) => p.type === PieceType.Infiltrator,
    );
    expect(infiltrator).toBeTruthy();
    infiltrator!.spoolTarget = {
      x: infiltrator!.position.x + 2,
      y: infiltrator!.position.y + 1,
    };
    after.plyCount = (before.plyCount ?? 0) + 1;
    expect(
      collectLatticeSoundsAfterPly(before, after, rules, {
        moverType: PieceType.Infiltrator,
        spoolAnnounce: true,
      }),
    ).toEqual(expect.arrayContaining(['infiltrator-spool']));
  });

  it('emits clock-arm when ply crosses activation', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      sectorActivationPly: 100,
    });
    const engine = new SubspaceLatticeEngine({ rules });
    const before = structuredClone(engine.getState());
    before.plyCount = 99;
    const after = structuredClone(before);
    after.plyCount = 100;
    expect(collectLatticeSoundsAfterPly(before, after, rules)).toContain(
      'clock-arm',
    );
  });

  it('emits emp-charged when charge reaches target', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      empChargeTarget: 15,
      empRadius: 3,
    });
    const engine = new SubspaceLatticeEngine({ rules });
    const before = structuredClone(engine.getState());
    before.empCharge = { [PlayerColor.White]: 14, [PlayerColor.Black]: 0 };
    const after = structuredClone(before);
    after.empCharge = { [PlayerColor.White]: 15, [PlayerColor.Black]: 0 };
    after.plyCount = (before.plyCount ?? 0) + 1;
    expect(collectLatticeSoundsAfterPly(before, after, rules)).toContain(
      'emp-charged',
    );
  });

  it('emits resignation on resign winnerReason', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const engine = new SubspaceLatticeEngine({ rules });
    const before = structuredClone(engine.getState());
    const after = structuredClone(before);
    after.winner = PlayerColor.Black;
    after.winnerReason = 'resign';
    expect(collectLatticeSoundsAfterPly(before, after, rules)).toEqual([
      'resignation',
    ]);
  });
});
