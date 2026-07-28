import { describe, expect, it } from 'vitest';
import {
  FLEET_LOBBY_DEFAULTS,
  FLEET_V1_RULES,
  HYBRID_FLEET_RULES,
  HYBRID_RULES,
  isDefaultFleetLobby,
  isRulesVersion,
  resolveFleetLobbyRules,
  resolveRulesConfig,
  sanitizeRulesLobbyOverrides,
  usesSensorNet,
} from './rules-config';
import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType, PlayerColor } from '../interfaces';

describe('hybrid-fleet shipping preset', () => {
  it('resolveRulesConfig(hybrid-fleet) matches FLEET_V1 + hybrid base', () => {
    const cfg = resolveRulesConfig('hybrid-fleet');
    expect(cfg).toEqual(HYBRID_FLEET_RULES);
    expect(cfg.version).toBe('hybrid-fleet');
    expect(cfg.hubSensorRadius).toBe(HYBRID_RULES.hubSensorRadius);
    expect(cfg.sectorIntegrationRatio).toBe(0.45);
    expect(cfg.sectorHoldPlies).toBe(FLEET_V1_RULES.sectorHoldPlies);
    expect(cfg.contestedCellsNeutral).toBe(true);
    expect(cfg.sectorActivationPly).toBe(100);
    expect(cfg.firstPlayerRelayCount).toBe(1);
    expect(cfg.infiltratorSpoolUp).toBe(false);
    expect(cfg.infiltratorActivationPly).toBe(0);
  });

  it('isRulesVersion / usesSensorNet accept hybrid-fleet', () => {
    expect(isRulesVersion('hybrid-fleet')).toBe(true);
    expect(usesSensorNet('hybrid-fleet')).toBe(true);
    expect(isRulesVersion('nope')).toBe(false);
  });

  it('engine(rulesVersion: hybrid-fleet) places Initiative Relay and stores version', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid-fleet' });
    const state = engine.getState();
    expect(state.rulesVersion).toBe('hybrid-fleet');
    expect(engine.getPiece('w-e4')).toMatchObject({
      owner: PlayerColor.White,
      position: { x: 5, y: 3 },
    });
    expect(engine.getPiece('b-e4')).toBeUndefined();
    // White has 9 pieces (8 + relay); Black still 8
    const white = Object.values(state.pieces).filter(
      (p) => p.owner === PlayerColor.White,
    );
    const black = Object.values(state.pieces).filter(
      (p) => p.owner === PlayerColor.Black,
    );
    expect(white).toHaveLength(9);
    expect(black).toHaveLength(8);
  });

  it('sector clock stays disarmed before activation ply 100', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid-fleet', {
        sectorIntegrationRatio: 0.12,
        hubSensorRadius: 2,
        sectorHoldPlies: 1,
        // keep fleet activation at 100
      }),
    });
    expect(engine.hasSectorIntegration(PlayerColor.White)).toBe(true);
    const move = engine.listLegalMoves(PlayerColor.White)[0]!;
    expect(engine.movePiece(move.pieceId, move.to)).toBe(true);
    expect(engine.getState().winner).toBeUndefined();
    expect(engine.getState().plyCount).toBe(1);
  });
});

describe('lobby rules overrides', () => {
  it('sanitizeRulesLobbyOverrides clamps and ignores junk', () => {
    expect(
      sanitizeRulesLobbyOverrides({
        infiltratorSpoolUp: true,
        infiltratorActivationPly: 12.9,
        sectorActivationPly: -3,
        hubSensorRadius: 99,
        heavyWingPreset: 'not-a-preset',
      }),
    ).toEqual({
      infiltratorSpoolUp: true,
      infiltratorActivationPly: 12,
      sectorActivationPly: 0,
    });
  });

  it('sanitize accepts heavyWingPreset', () => {
    expect(
      sanitizeRulesLobbyOverrides({ heavyWingPreset: 'fleet-draft' }),
    ).toEqual({ heavyWingPreset: 'fleet-draft' });
  });

  it('resolveFleetLobbyRules + isDefaultFleetLobby', () => {
    expect(isDefaultFleetLobby(undefined)).toBe(true);
    expect(isDefaultFleetLobby(FLEET_LOBBY_DEFAULTS)).toBe(true);
    const custom = resolveFleetLobbyRules({
      infiltratorSpoolUp: true,
      sectorActivationPly: 40,
    });
    expect(custom.infiltratorSpoolUp).toBe(true);
    expect(custom.sectorActivationPly).toBe(40);
    expect(custom.firstPlayerRelayCount).toBe(1);
    expect(custom.heavyUnitDraft).toBe('standard');
    expect(custom.heavyUnitFiles).toEqual([2, 8]);
    expect(
      isDefaultFleetLobby({
        infiltratorSpoolUp: true,
        infiltratorActivationPly: 0,
        sectorActivationPly: 100,
      }),
    ).toBe(false);
  });

  it('maps heavyWingPreset to draft / files / anchor', () => {
    const standard = resolveFleetLobbyRules({ heavyWingPreset: 'standard' });
    expect(standard.heavyUnitDraft).toBe('standard');
    expect(standard.heavyUnitFiles).toEqual([2, 8]);
    expect(standard.carrierRequiresHubAnchor).toBe(false);

    const refractorWing = resolveFleetLobbyRules({
      heavyWingPreset: 'refractor-wing',
    });
    expect(refractorWing.heavyUnitDraft).toBe('refractor-beam');
    expect(refractorWing.heavyUnitFiles).toEqual([3, 7]);
    expect(refractorWing.carrierRequiresHubAnchor).toBe(false);
    expect(isDefaultFleetLobby({ heavyWingPreset: 'refractor-wing' })).toBe(
      false,
    );

    const fleetDraft = resolveFleetLobbyRules({
      heavyWingPreset: 'fleet-draft',
    });
    expect(fleetDraft.heavyUnitDraft).toBe('refractor-carrier');
    expect(fleetDraft.heavyUnitFiles).toEqual([3, 7]);
    expect(fleetDraft.carrierRequiresHubAnchor).toBe(true);
    expect(isDefaultFleetLobby({ heavyWingPreset: 'fleet-draft' })).toBe(
      false,
    );
  });

  it('opening setup places Refractor Wing and Fleet Draft on files 3–7', () => {
    const rw = new SubspaceLatticeEngine({
      rules: resolveFleetLobbyRules({ heavyWingPreset: 'refractor-wing' }),
    });
    expect(rw.getPiece('w-h1')).toMatchObject({
      type: PieceType.Refractor,
      position: { x: 3, y: 0 },
    });
    expect(rw.getPiece('w-h2')).toMatchObject({
      type: PieceType.Beam,
      position: { x: 7, y: 0 },
    });
    // Infiltrators vacate 3–7 when heavies take those files.
    expect(rw.getPiece('w-i1')?.position).toEqual({ x: 2, y: 0 });
    expect(rw.getPiece('w-i2')?.position).toEqual({ x: 8, y: 0 });
    expect(rw.getState().rulesOverrides?.heavyWingPreset).toBe(
      'refractor-wing',
    );

    const fd = new SubspaceLatticeEngine({
      rules: resolveFleetLobbyRules({ heavyWingPreset: 'fleet-draft' }),
    });
    expect(fd.getPiece('w-h1')).toMatchObject({
      type: PieceType.Refractor,
      position: { x: 3, y: 0 },
    });
    expect(fd.getPiece('w-h2')).toMatchObject({
      type: PieceType.Carrier,
      position: { x: 7, y: 0 },
    });
    expect(fd.getState().rulesOverrides?.heavyWingPreset).toBe('fleet-draft');

    const hydrated = SubspaceLatticeEngine.fromState(fd.getState());
    expect(hydrated.getRules().heavyUnitDraft).toBe('refractor-carrier');
    expect(hydrated.getRules().carrierRequiresHubAnchor).toBe(true);
    expect(hydrated.getRules().heavyUnitFiles).toEqual([3, 7]);
  });
});
