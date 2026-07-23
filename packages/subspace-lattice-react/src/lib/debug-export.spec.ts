import { describe, expect, it, vi } from 'vitest';
import {
  buildLatticeDebugFilename,
  buildLatticeDebugPayload,
  LATTICE_DEBUG_FORMAT,
  PlayerColor,
  type GameState,
} from '@subspace-lattice/core';
import { CellType } from '@subspace-lattice/core';

vi.mock('../firebase/platform', () => ({
  isTauriDesktop: () => false,
  isTauriMobile: () => false,
}));

import { canUseAnchorDownload } from './deliver-file';

function stubState(): GameState {
  return {
    boardSize: 11,
    cells: [{ coordinate: { x: 0, y: 0 }, type: CellType.Empty }],
    pieces: {},
    currentPlayer: PlayerColor.White,
    rulesVersion: 'hybrid-fleet',
  };
}

describe('debug-export helpers', () => {
  it('names files with lattice prefix', () => {
    expect(
      buildLatticeDebugFilename('ABC12', '2026-07-23T18:00:00.000Z'),
    ).toBe('lattice-ABC12-2026-07-23-18-00-00.json');
  });

  it('builds v1 payload for local AI', () => {
    const payload = buildLatticeDebugPayload(
      { mode: 'local-ai', sectorCode: 'local' },
      {
        gameState: stubState(),
        moveLog: [
          {
            at: '2026-07-23T18:00:01.000Z',
            player: PlayerColor.White,
            pieceId: 'w-e1',
            to: { x: 5, y: 1 },
            source: 'human',
            ok: true,
          },
        ],
      },
    );
    expect(payload.format).toBe(LATTICE_DEBUG_FORMAT);
    expect(payload.client.moveLog).toHaveLength(1);
  });

  it('allows anchor download on desktop-like environments', () => {
    expect(canUseAnchorDownload()).toBe(true);
  });
});
