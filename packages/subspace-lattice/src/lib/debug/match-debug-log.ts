import type { Coordinate } from '../interfaces/coordinate';
import type { GameState } from '../interfaces/gameState';
import type { PlayerColor } from '../interfaces/playerColor';
import type { AiStrengthId } from '../ai/mcts-ai';

export const LATTICE_DEBUG_FORMAT = 'subspace-lattice-debug-v1' as const;

export type MatchDebugMoveSource = 'human' | 'ai' | 'system';

export interface MatchDebugMoveEntry {
  at: string;
  player: PlayerColor | string;
  pieceId: string;
  from?: Coordinate;
  to: Coordinate;
  captured?: string;
  source: MatchDebugMoveSource;
  ok: boolean;
}

export interface MatchDebugLog {
  append(entry: Omit<MatchDebugMoveEntry, 'at'> & { at?: string }): void;
  snapshot(): readonly MatchDebugMoveEntry[];
  clear(): void;
}

export function createMatchDebugLog(): MatchDebugLog {
  const entries: MatchDebugMoveEntry[] = [];
  return {
    append(entry) {
      entries.push({
        ...entry,
        at: entry.at ?? new Date().toISOString(),
      });
    },
    snapshot() {
      return [...entries];
    },
    clear() {
      entries.length = 0;
    },
  };
}

export function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 64);
}

export function buildLatticeDebugFilename(
  sectorCode: string,
  exportedAt: string,
): string {
  const stamp = exportedAt.slice(0, 19).replace(/[:T]/g, '-');
  return `lattice-${sanitizeFilenamePart(sectorCode)}-${stamp}.json`;
}

export type LatticeDebugMode = 'local-ai' | 'pass-and-play' | 'online';

export interface LatticeDebugExportMeta {
  exportedAt?: string;
  mode: LatticeDebugMode;
  sectorCode: string;
  viewerId?: string;
  notes?: string[];
}

export interface LatticeDebugClientSnapshot {
  gameState: GameState;
  /** Board at match start — enables replay of moveLog. */
  initialState?: GameState;
  moveLog: readonly MatchDebugMoveEntry[];
  displayLog?: readonly string[];
  localAi?: {
    strength: AiStrengthId;
    localPlayerColor: PlayerColor;
    matchId: string | null;
    assisted: boolean;
  };
  passAndPlay?: {
    whiteName: string;
    blackName: string;
  };
  online?: {
    roomId: string;
    roomCode: string;
    roomName: string;
    creatorId: string;
    whitePlayerId?: string;
    blackPlayerId?: string;
    whiteDisplayName?: string;
    blackDisplayName?: string;
    rated?: boolean;
    assisted?: boolean;
    rulesVersion?: string;
  };
}

export interface LatticeDebugExport {
  format: typeof LATTICE_DEBUG_FORMAT;
  exportedAt: string;
  mode: LatticeDebugMode;
  sectorCode: string;
  viewerId?: string;
  client: LatticeDebugClientSnapshot;
  /** Online: authoritative event stream from Firestore `events/`. */
  firestore?: {
    events: readonly unknown[];
  };
  notes: string[];
}

export function buildLatticeDebugPayload(
  meta: LatticeDebugExportMeta,
  client: LatticeDebugClientSnapshot,
  firestore?: { events: readonly unknown[] },
): LatticeDebugExport {
  const exportedAt = meta.exportedAt ?? new Date().toISOString();
  const notes = [
    ...(meta.notes ?? []),
    `Moves: ${client.moveLog.length}.`,
    client.initialState
      ? 'initialState + moveLog support offline replay.'
      : 'No initialState — current gameState only.',
  ];
  if (firestore) {
    notes.push(`Firestore events: ${firestore.events.length}.`);
  }

  return {
    format: LATTICE_DEBUG_FORMAT,
    exportedAt,
    mode: meta.mode,
    sectorCode: meta.sectorCode,
    viewerId: meta.viewerId,
    client,
    ...(firestore ? { firestore } : {}),
    notes,
  };
}
