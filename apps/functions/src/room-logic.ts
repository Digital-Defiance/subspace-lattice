import type { GameState, IGameRoom } from '@subspace-lattice/core';
import { PlayerColor, SubspaceLatticeEngine } from '@subspace-lattice/core';

export type RoomData = {
  roomCode: string;
  name: string;
  password?: string | null;
  creatorId: string;
  whitePlayerId?: string | null;
  blackPlayerId?: string | null;
  observerIds?: string[];
  allowObservers?: boolean;
  rated?: boolean;
  assisted?: boolean;
  memberIds?: string[];
  rulesVersion?: string | null;
  createdAt?: { toDate: () => Date };
  updatedAt?: { toDate: () => Date };
};

export function isMember(room: RoomData, uid: string): boolean {
  return (
    room.creatorId === uid ||
    room.whitePlayerId === uid ||
    room.blackPlayerId === uid ||
    (Array.isArray(room.observerIds) && room.observerIds.includes(uid))
  );
}

export function isSeatedPlayer(room: RoomData, uid: string): boolean {
  return room.whitePlayerId === uid || room.blackPlayerId === uid;
}

export type OnlineTeiEligibility =
  | {
      ok: true;
      whitePlayerId: string;
      blackPlayerId: string;
      winner: 'WHITE' | 'BLACK';
    }
  | {
      ok: false;
      reason: 'casual' | 'assisted' | 'incomplete' | 'missing-seats';
    };

/** Server-side gate for reportLatticeOnlineMatch. */
export function planOnlineTeiReport(
  room: RoomData,
  winner: string | null | undefined,
): OnlineTeiEligibility {
  if (room.rated !== true) {
    return { ok: false, reason: 'casual' };
  }
  if (room.assisted === true) {
    return { ok: false, reason: 'assisted' };
  }
  if (winner !== 'WHITE' && winner !== 'BLACK') {
    return { ok: false, reason: 'incomplete' };
  }
  const whitePlayerId = room.whitePlayerId ?? undefined;
  const blackPlayerId = room.blackPlayerId ?? undefined;
  if (!whitePlayerId || !blackPlayerId) {
    return { ok: false, reason: 'missing-seats' };
  }
  return {
    ok: true,
    whitePlayerId,
    blackPlayerId,
    winner,
  };
}

/** Observers may watch chat; only seated players (and creator if seated) may send. */
export function canSendChat(room: RoomData, uid: string): boolean {
  return isSeatedPlayer(room, uid);
}

export const MAX_OBSERVERS = 32;

export function serializeRoom(
  roomId: string,
  room: RoomData,
  gameState: GameState,
  chatMessages: IGameRoom['chatMessages'] = [],
): IGameRoom {
  return {
    id: roomId,
    roomCode: room.roomCode,
    name: room.name,
    creatorId: room.creatorId,
    whitePlayerId: room.whitePlayerId ?? undefined,
    blackPlayerId: room.blackPlayerId ?? undefined,
    observerIds: room.observerIds ?? [],
    allowObservers: room.allowObservers ?? true,
    rated: room.rated === true,
    assisted: room.assisted === true,
    rulesVersion:
      (room.rulesVersion as IGameRoom['rulesVersion']) ??
      gameState.rulesVersion,
    gameState,
    chatMessages,
    createdAt: room.createdAt?.toDate?.() ?? new Date(),
    updatedAt: room.updatedAt?.toDate?.() ?? new Date(),
  };
}

export function generateRoomCode(rng: () => number = Math.random): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(rng() * chars.length));
  }
  return code;
}

export type JoinDecision =
  | { ok: true; alreadyMember: true }
  | {
      ok: true;
      alreadyMember: false;
      patch: Partial<RoomData> & { memberIds: string[] };
      systemMessage?: string;
    }
  | {
      ok: false;
      reason: 'password' | 'observers-disabled' | 'full' | 'gallery-full';
    };

export function planJoinRoom(
  room: RoomData,
  uid: string,
  options: { password?: string; asObserver?: boolean } = {},
): JoinDecision {
  if (room.password && room.password !== options.password) {
    return { ok: false, reason: 'password' };
  }

  if (isMember(room, uid)) {
    return { ok: true, alreadyMember: true };
  }

  const memberIds = Array.from(new Set([...(room.memberIds ?? []), uid]));

  if (options.asObserver) {
    if (room.allowObservers === false) {
      return { ok: false, reason: 'observers-disabled' };
    }
    const gallery = room.observerIds ?? [];
    if (gallery.length >= MAX_OBSERVERS) {
      return { ok: false, reason: 'gallery-full' };
    }
    return {
      ok: true,
      alreadyMember: false,
      patch: {
        observerIds: [...gallery, uid],
        memberIds,
      },
      systemMessage: 'A spectator has joined the gallery.',
    };
  }

  if (!room.whitePlayerId) {
    return {
      ok: true,
      alreadyMember: false,
      patch: { whitePlayerId: uid, memberIds },
      systemMessage: 'White player has joined.',
    };
  }

  if (!room.blackPlayerId && room.whitePlayerId !== uid) {
    return {
      ok: true,
      alreadyMember: false,
      patch: { blackPlayerId: uid, memberIds },
      systemMessage: 'Black player has joined.',
    };
  }

  return { ok: false, reason: 'full' };
}

export function applyAuthoritativeMove(
  gameState: GameState,
  actorUid: string,
  room: RoomData,
  pieceId: string,
  to: { x: number; y: number },
):
  | { ok: true; next: GameState }
  | { ok: false; reason: 'not-player' | 'not-turn' | 'illegal' } {
  const expectedColor =
    room.whitePlayerId === actorUid
      ? PlayerColor.White
      : room.blackPlayerId === actorUid
        ? PlayerColor.Black
        : null;
  if (!expectedColor) return { ok: false, reason: 'not-player' };

  const engine = SubspaceLatticeEngine.fromState(gameState);
  if (engine.getState().currentPlayer !== expectedColor) {
    return { ok: false, reason: 'not-turn' };
  }
  const ok = engine.movePiece(pieceId, to);
  if (!ok) return { ok: false, reason: 'illegal' };
  return { ok: true, next: engine.getState() };
}

export type ResignDecision =
  | {
      ok: true;
      next: GameState;
      winner: PlayerColor;
      resigned: PlayerColor;
    }
  | {
      ok: false;
      reason: 'not-player' | 'already-finished' | 'no-opponent';
    };

/** Award the opponent when a seated player resigns mid-match. */
export function applyResign(
  gameState: GameState,
  actorUid: string,
  room: RoomData,
): ResignDecision {
  const resigned =
    room.whitePlayerId === actorUid
      ? PlayerColor.White
      : room.blackPlayerId === actorUid
        ? PlayerColor.Black
        : null;
  if (!resigned) return { ok: false, reason: 'not-player' };
  if (!room.whitePlayerId || !room.blackPlayerId) {
    return { ok: false, reason: 'no-opponent' };
  }
  if (gameState.winner) return { ok: false, reason: 'already-finished' };

  const winner =
    resigned === PlayerColor.White ? PlayerColor.Black : PlayerColor.White;
  return {
    ok: true,
    resigned,
    winner,
    next: {
      ...gameState,
      winner,
      winnerReason: 'resign',
    },
  };
}
