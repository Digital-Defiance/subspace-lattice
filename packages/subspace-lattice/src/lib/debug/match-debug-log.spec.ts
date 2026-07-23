import { describe, expect, it } from 'vitest';
import {
  buildLatticeDebugFilename,
  buildLatticeDebugPayload,
  createMatchDebugLog,
  LATTICE_DEBUG_FORMAT,
  sanitizeFilenamePart,
} from './match-debug-log';
import { PlayerColor } from '../interfaces/playerColor';
import type { GameState } from '../interfaces/gameState';
import { CellType } from '../interfaces/cellType';

function stubState(): GameState {
  return {
    boardSize: 11,
    cells: [
      { coordinate: { x: 0, y: 0 }, type: CellType.Empty },
    ],
    pieces: {},
    currentPlayer: PlayerColor.White,
    rulesVersion: 'hybrid-fleet',
  };
}

describe('match-debug-log', () => {
  it('appends timestamped moves and snapshots a copy', () => {
    const log = createMatchDebugLog();
    log.append({
      player: PlayerColor.White,
      pieceId: 'w-e1',
      to: { x: 1, y: 2 },
      source: 'human',
      ok: true,
      at: '2026-07-23T12:00:00.000Z',
    });
    const snap = log.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]!.at).toBe('2026-07-23T12:00:00.000Z');
    log.clear();
    expect(log.snapshot()).toHaveLength(0);
    expect(snap).toHaveLength(1);
  });

  it('builds a stable filename and payload envelope', () => {
    expect(sanitizeFilenamePart('ab/c d!')).toBe('ab-c-d-');
    expect(
      buildLatticeDebugFilename('ROOM1', '2026-07-23T12:34:56.789Z'),
    ).toBe('lattice-ROOM1-2026-07-23-12-34-56.json');

    const payload = buildLatticeDebugPayload(
      {
        mode: 'local-ai',
        sectorCode: 'local',
        exportedAt: '2026-07-23T12:00:00.000Z',
        viewerId: 'uid-1',
      },
      {
        gameState: stubState(),
        initialState: stubState(),
        moveLog: [],
        displayLog: ['hello'],
      },
    );
    expect(payload.format).toBe(LATTICE_DEBUG_FORMAT);
    expect(payload.mode).toBe('local-ai');
    expect(payload.client.displayLog).toEqual(['hello']);
    expect(payload.notes.some((n) => /initialState/.test(n))).toBe(true);
  });
});
