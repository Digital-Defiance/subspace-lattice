import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from '../game-engine';
import { resolveRulesConfig } from '../rules/rules-config';
import {
  ENCODER_FEATURE_COUNT,
  ENCODING_VERSION,
  encodePosition,
  encodingFingerprint,
} from './position-encoder';

describe('position encoder', () => {
  it('emits fixed-length v1 features for hybrid-fleet', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      heavyUnitDraft: 'refractor-carrier',
      heavyUnitFiles: [3, 7],
      carrierRequiresHubAnchor: true,
    });
    const engine = new SubspaceLatticeEngine({ rules });
    const enc = encodePosition(engine);
    expect(enc.version).toBe(ENCODING_VERSION);
    expect(enc.features).toHaveLength(ENCODER_FEATURE_COUNT);
    expect(enc.features.some((v) => v !== 0)).toBe(true);
    expect(encodingFingerprint(enc.features).length).toBe(8);
  });

  it('is deterministic for the same position', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const a = encodePosition(new SubspaceLatticeEngine({ rules }));
    const b = encodePosition(new SubspaceLatticeEngine({ rules }));
    expect(encodingFingerprint(a.features)).toBe(
      encodingFingerprint(b.features),
    );
  });

  it('changes after a legal move', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      heavyUnitDraft: 'refractor-carrier',
      heavyUnitFiles: [3, 7],
      carrierRequiresHubAnchor: true,
    });
    const engine = new SubspaceLatticeEngine({ rules });
    const before = encodingFingerprint(encodePosition(engine).features);
    const move = engine.listLegalMoves()[0]!;
    expect(engine.movePiece(move.pieceId, move.to)).toBe(true);
    const after = encodingFingerprint(encodePosition(engine).features);
    expect(after).not.toBe(before);
  });
});
