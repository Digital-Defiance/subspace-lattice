import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig } from '../rules/rules-config';
import { HeuristicAi } from './heuristic-ai';
import { createSeededRng } from './rng';
import {
  collectLpgnDataset,
  collectSelfPlayDataset,
  samplesToJsonl,
} from './dataset';
import { ENCODING_VERSION } from './position-encoder';
import {
  formatLpgnPlyToken,
} from '../debug/lpgn';
import { PieceType } from '../interfaces/pieceType';

describe('dataset collect', () => {
  it('labels self-play samples with encoder version and outcome', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const { match, samples } = collectSelfPlayDataset(
      new HeuristicAi(createSeededRng(7)),
      new HeuristicAi(createSeededRng(11)),
      { rules, maxPlies: 24 },
    );
    expect(samples.length).toBe(match.plies);
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(s.encodingVersion).toBe(ENCODING_VERSION);
      expect(s.features.length).toBeGreaterThan(100);
      expect([-1, 0, 1]).toContain(s.z);
      expect(s.source).toBe('self-play');
      expect(s.rulesVersion).toBe(rules.version);
    }
    if (match.truncated || match.winner == null) {
      expect(samples.every((s) => s.z === 0)).toBe(true);
    } else {
      expect(samples.some((s) => s.z !== 0)).toBe(true);
    }
    const jsonl = samplesToJsonl(samples.slice(0, 2));
    expect(jsonl.trim().split('\n')).toHaveLength(2);
    expect(JSON.parse(jsonl.trim().split('\n')[0]!)).toMatchObject({
      encodingVersion: ENCODING_VERSION,
      source: 'self-play',
    });
  });

  it('exports LPGN pre-ply features', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      heavyUnitDraft: 'refractor-carrier',
      heavyUnitFiles: [3, 7],
      carrierRequiresHubAnchor: true,
    });
    const engine = new SubspaceLatticeEngine({ rules });
    const wMove = engine.listLegalMoves()[0]!;
    const wPiece = engine.getPiece(wMove.pieceId)!;
    const wFrom = { ...wPiece.position };
    expect(engine.movePiece(wMove.pieceId, wMove.to)).toBe(true);
    const bMove = engine.listLegalMoves()[0]!;
    const bPiece = engine.getPiece(bMove.pieceId)!;
    const bFrom = { ...bPiece.position };
    expect(engine.movePiece(bMove.pieceId, bMove.to)).toBe(true);

    const token = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      type: PieceType,
      player: PlayerColor,
    ) =>
      formatLpgnPlyToken({
        at: '',
        player,
        pieceId: 'x',
        kind: 'move',
        moverType: type,
        from,
        to,
        source: 'human',
        ok: true,
      })!;

    const text = `[Event "t"]
[Site "offline"]
[Date "2026.07.31"]
[White "W"]
[Black "B"]
[Result "1-0"]
[Rules "hybrid-fleet"]
[Mode "pass-and-play"]
[LPGN "0.2"]
[HeavyWing "fleet-draft"]
[SectorClock "100"]
[EmpRadius "3"]
[EmpCharge "15"]
[EmpBlackout "1"]
[TerminalOverclock "1"]
[TerminalBothLone "1"]
[TerminalSharedClock "1"]
[TerminalEmpCharge "10"]
[TerminalGrowth "5"]
[TerminalRadiusMax "10"]
[InfiltratorSpool "0"]
[InfiltratorUnlock "0"]

1. ${token(wFrom, wMove.to, wPiece.type, PlayerColor.White)} ${token(bFrom, bMove.to, bPiece.type, PlayerColor.Black)}
`;
    const { samples } = collectLpgnDataset(text);
    expect(samples).toHaveLength(2);
    expect(samples[0]!.z).toBe(1); // White to move, White wins
    expect(samples[1]!.z).toBe(-1); // Black to move, White wins
    expect(samples[0]!.source).toBe('lpgn');
  });
});
