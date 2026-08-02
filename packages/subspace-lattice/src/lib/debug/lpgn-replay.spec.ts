import { describe, expect, it } from 'vitest';
import { PlayerColor } from '../interfaces';
import {
  parseLpgn,
  parseLpgnPlyToken,
  lpgnSquareToCoord,
} from './lpgn-parse';
import { replayLpgn } from './lpgn-replay';
import { annotateLpgnReplay } from './lpgn-annotate';
import { formatLpgnPlyToken, pieceLetter, coordToLpgnSquare } from './lpgn';
import { resolveRulesConfig } from '../rules/rules-config';
import { PieceType } from '../interfaces/pieceType';
import { SubspaceLatticeEngine } from '../game-engine';

describe('LPGN parse + replay', () => {
  it('parses squares and piece tokens', () => {
    expect(lpgnSquareToCoord('f6')).toEqual({ x: 5, y: 5 });
    expect(lpgnSquareToCoord('k11')).toEqual({ x: 10, y: 10 });
    const move = parseLpgnPlyToken('Qd5xc6');
    expect(move).toMatchObject({
      kind: 'move',
      letter: 'Q',
      capture: true,
      from: { x: 3, y: 4 },
      to: { x: 2, y: 5 },
    });
    expect(parseLpgnPlyToken('EMP@f1/r3')).toMatchObject({
      kind: 'emp',
      origin: { x: 5, y: 0 },
      radius: 3,
    });
    expect(parseLpgnPlyToken('TEMP@c2/r4')).toMatchObject({
      kind: 'terminal-emp',
      radius: 4,
    });
  });

  it('replays two legal opening plies from fleet-draft', async () => {
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

    const token = (from: { x: number; y: number }, to: { x: number; y: number }, type: PieceType) =>
      formatLpgnPlyToken({
        at: '',
        player: PlayerColor.White,
        pieceId: 'x',
        kind: 'move',
        moverType: type,
        from,
        to,
        source: 'human',
        ok: true,
      })!;

    const body = `1. ${token(wFrom, wMove.to, wPiece.type)} ${token(bFrom, bMove.to, bPiece.type)}`;
    const text = `[Event "t"]
[Site "offline"]
[Date "2026.07.31"]
[White "W"]
[Black "B"]
[Result "*"]
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

${body}
`;
    expect(parseLpgn(text).plies).toHaveLength(2);
    const replay = replayLpgn(text);
    expect(replay.plies).toHaveLength(2);
    const report = await annotateLpgnReplay(replay, {
      perspective: PlayerColor.White,
      mateDepth: 1,
      advisorStrength: 'fast',
      yieldEvery: 0,
    });
    expect(report.annotations).toHaveLength(2);
    expect(report.annotations[0]?.grade).toBeTruthy();
    expect(report.annotations[0]?.why.length).toBeGreaterThan(0);
    expect(pieceLetter(PieceType.Escort)).toBe('P');
    expect(coordToLpgnSquare(wFrom).length).toBeGreaterThan(1);
  });
});
