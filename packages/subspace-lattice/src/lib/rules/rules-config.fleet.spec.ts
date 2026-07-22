import { describe, expect, it } from 'vitest';
import {
  FLEET_V1_RULES,
  HYBRID_FLEET_RULES,
  HYBRID_RULES,
  isRulesVersion,
  resolveRulesConfig,
  usesSensorNet,
} from './rules-config';
import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces';

describe('hybrid-fleet soft-ship preset', () => {
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
