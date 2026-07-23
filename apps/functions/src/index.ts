import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import {
  isRulesVersion,
  LATTICE_COLLECTIONS,
  FEDERATION_COLLECTIONS,
  onlineRatingEventId,
  rateLocalAiMatch,
  rateOnlinePvpMatch,
  SubspaceLatticeEngine,
  type AiStrengthId,
  type GameState,
} from '@subspace-lattice/core';
import {
  applyAuthoritativeMove,
  applyResign,
  canSendChat,
  generateRoomCode,
  isMember,
  isSeatedPlayer,
  planJoinRoom,
  planOnlineTeiReport,
  sanitizeSeatDisplayName,
  serializeRoom,
  type RoomData,
} from './room-logic';

// Org policy blocks allUsers, so never use invoker: 'public' (Firebase deploy
// fails setting IAM). Deploy private; scripts/ensure-functions-public-invoker.sh
// disables the Cloud Run invoker IAM check so browser callables still work.
setGlobalOptions({ region: 'us-central1', invoker: 'private' });
initializeApp();

const db: Firestore = getFirestore();
const ROOMS = LATTICE_COLLECTIONS.rooms;
const ROOM_CODES = LATTICE_COLLECTIONS.roomCodes;
const TEI = LATTICE_COLLECTIONS.tei;
const RATING_EVENTS = LATTICE_COLLECTIONS.ratingEvents;

/** Soft-shipped fleet rules for all new rooms and local AI. */
const DEFAULT_RULES_VERSION = 'hybrid-fleet' as const;

function requireAuth(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  return uid;
}

/** Federation bans live in shared `bans` (same project as Warp). */
async function assertNotBanned(uid: string): Promise<void> {
  const snap = await db.collection('bans').doc(uid).get();
  if (!snap.exists) return;
  const data = snap.data() as {
    active?: boolean;
    expiresAt?: { toMillis?: () => number } | null;
  };
  if (data.active === false) return;
  const exp = data.expiresAt;
  if (exp && typeof exp.toMillis === 'function') {
    if (exp.toMillis() <= Date.now()) return;
  }
  throw new HttpsError(
    'permission-denied',
    'This captain is banned from IWGF online services.'
  );
}

async function allocateUniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateRoomCode();
    const ref = db.collection(ROOM_CODES).doc(code);
    const existing = await ref.get();
    if (!existing.exists) {
      return code;
    }
  }
  throw new HttpsError('internal', 'Could not allocate a room code.');
}

async function appendSystemChat(roomId: string, text: string): Promise<void> {
  await db.collection(ROOMS).doc(roomId).collection('chat').add({
    senderId: 'SYSTEM',
    text,
    timestamp: FieldValue.serverTimestamp(),
    isSystemMessage: true,
  });
}

/** IWGF Federation Profile call sign — never Google Auth displayName. */
async function resolveFederationCallSign(uid: string): Promise<string> {
  const profile = await db
    .collection(FEDERATION_COLLECTIONS.playerProfiles)
    .doc(uid)
    .get();
  const fromProfile = String(profile.data()?.displayName ?? '').trim();
  if (fromProfile) return fromProfile.slice(0, 40);
  const stats = await db
    .collection(FEDERATION_COLLECTIONS.playerStats)
    .doc(uid)
    .get();
  const fromStats = String(stats.data()?.displayName ?? '').trim();
  if (fromStats) return fromStats.slice(0, 40);
  return 'Commander';
}

export const createRoom = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  await assertNotBanned(uid);
  const name = String(request.data?.name ?? '').trim();
  const password =
    typeof request.data?.password === 'string' && request.data.password
      ? request.data.password
      : undefined;
  const allowObservers = request.data?.allowObservers !== false;
  const rated = request.data?.rated === true;
  const preferredRaw = String(request.data?.preferredColor ?? 'WHITE')
    .trim()
    .toUpperCase();
  const hostAsBlack = preferredRaw === 'BLACK';
  const seatDisplayName = sanitizeSeatDisplayName(request.data?.displayName);
  const requestedRules = request.data?.rulesVersion;
  const rulesVersion =
    isRulesVersion(requestedRules) && requestedRules !== 'classic'
      ? requestedRules
      : DEFAULT_RULES_VERSION;

  if (!name) {
    throw new HttpsError('invalid-argument', 'Room name is required.');
  }

  const roomCode = await allocateUniqueRoomCode();
  const engine = new SubspaceLatticeEngine({ rulesVersion });
  const gameState = engine.getState();
  const roomRef = db.collection(ROOMS).doc();
  const whitePlayerId = hostAsBlack ? null : uid;
  const blackPlayerId = hostAsBlack ? uid : null;
  const whiteDisplayName = hostAsBlack ? null : seatDisplayName ?? null;
  const blackDisplayName = hostAsBlack ? seatDisplayName ?? null : null;

  await db.runTransaction(async (tx) => {
    tx.set(db.collection(ROOM_CODES).doc(roomCode), { roomId: roomRef.id });
    tx.set(roomRef, {
      roomCode,
      name,
      password: password ?? null,
      creatorId: uid,
      whitePlayerId,
      blackPlayerId,
      whiteDisplayName,
      blackDisplayName,
      observerIds: [],
      allowObservers,
      rated,
      assisted: false,
      memberIds: [uid],
      rulesVersion,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(roomRef.collection('meta').doc('gameState'), gameState);
  });

  const hostLabel =
    seatDisplayName ?? (hostAsBlack ? 'Black' : 'White');
  await appendSystemChat(
    roomRef.id,
    `Room "${name}" created (Code: ${roomCode}, rules: ${rulesVersion}${
      rated ? ', rated' : ', casual'
    }, host ${hostLabel} as ${hostAsBlack ? 'Black' : 'White'}).`,
  );

  return serializeRoom(
    roomRef.id,
    {
      roomCode,
      name,
      creatorId: uid,
      whitePlayerId: whitePlayerId ?? undefined,
      blackPlayerId: blackPlayerId ?? undefined,
      whiteDisplayName: whiteDisplayName ?? undefined,
      blackDisplayName: blackDisplayName ?? undefined,
      observerIds: [],
      allowObservers,
      rated,
      assisted: false,
      rulesVersion,
      createdAt: { toDate: () => new Date() },
      updatedAt: { toDate: () => new Date() },
    },
    gameState,
  );
});

export const lookupRoom = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  const roomCode = String(request.data?.roomCode ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(roomCode)) {
    throw new HttpsError('invalid-argument', 'Invalid room code.');
  }

  const codeSnap = await db.collection(ROOM_CODES).doc(roomCode).get();
  if (!codeSnap.exists) {
    throw new HttpsError('not-found', 'Room not found.');
  }
  const roomId = codeSnap.data()?.roomId as string;
  const roomSnap = await db.collection(ROOMS).doc(roomId).get();
  if (!roomSnap.exists) {
    throw new HttpsError('not-found', 'Room not found.');
  }
  const room = roomSnap.data()! as RoomData;
  const stateSnap = await roomSnap.ref.collection('meta').doc('gameState').get();
  const gameState = stateSnap.data() as GameState;

  return serializeRoom(roomId, room, gameState);
});

export const joinRoom = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  await assertNotBanned(uid);
  const roomCode = String(request.data?.roomCode ?? '')
    .trim()
    .toUpperCase();
  const password =
    typeof request.data?.password === 'string'
      ? request.data.password
      : undefined;
  const asObserver = Boolean(request.data?.asObserver);
  const displayName = sanitizeSeatDisplayName(request.data?.displayName);

  if (!/^[A-Z0-9]{5}$/.test(roomCode)) {
    throw new HttpsError('invalid-argument', 'Invalid room code.');
  }

  const codeSnap = await db.collection(ROOM_CODES).doc(roomCode).get();
  if (!codeSnap.exists) {
    throw new HttpsError('not-found', 'Room not found.');
  }
  const roomId = codeSnap.data()?.roomId as string;
  const roomRef = db.collection(ROOMS).doc(roomId);

  let systemMessage: string | undefined;

  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) {
      throw new HttpsError('not-found', 'Room not found.');
    }
    const room = roomSnap.data()! as RoomData;
    const decision = planJoinRoom(room, uid, {
      password,
      asObserver,
      displayName,
    });

    if (!decision.ok) {
      if (decision.reason === 'password') {
        throw new HttpsError('permission-denied', 'Invalid password.');
      }
      if (decision.reason === 'observers-disabled') {
        throw new HttpsError(
          'failed-precondition',
          'Spectators are not allowed in this room.',
        );
      }
      if (decision.reason === 'gallery-full') {
        throw new HttpsError(
          'resource-exhausted',
          'Spectator gallery is full.',
        );
      }
      throw new HttpsError('failed-precondition', 'Room is full.');
    }

    if (decision.alreadyMember) return;

    systemMessage = decision.systemMessage;
    tx.update(roomRef, {
      ...decision.patch,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  if (systemMessage) {
    await appendSystemChat(roomId, systemMessage);
  }

  const stateSnap = await roomRef.collection('meta').doc('gameState').get();
  const gameState = stateSnap.data() as GameState;
  const updated = (await roomRef.get()).data()! as RoomData;
  return serializeRoom(roomId, updated, gameState);
});

export const submitMove = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const roomId = String(request.data?.roomId ?? '');
  const pieceId = String(request.data?.pieceId ?? '');
  const to = request.data?.to as { x: number; y: number } | undefined;

  if (
    !roomId ||
    !pieceId ||
    !to ||
    typeof to.x !== 'number' ||
    typeof to.y !== 'number'
  ) {
    throw new HttpsError(
      'invalid-argument',
      'roomId, pieceId, and to are required.',
    );
  }

  const roomRef = db.collection(ROOMS).doc(roomId);
  const stateRef = roomRef.collection('meta').doc('gameState');

  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) {
      throw new HttpsError('not-found', 'Room not found.');
    }
    const room = roomSnap.data()! as RoomData;
    const stateSnap = await tx.get(stateRef);
    if (!stateSnap.exists) {
      throw new HttpsError('failed-precondition', 'Missing game state.');
    }

    const result = applyAuthoritativeMove(
      stateSnap.data() as GameState,
      uid,
      room,
      pieceId,
      to,
    );
    if (!result.ok) {
      if (result.reason === 'not-player') {
        throw new HttpsError(
          'permission-denied',
          'Only seated players may move.',
        );
      }
      if (result.reason === 'not-turn') {
        throw new HttpsError('failed-precondition', 'Not your turn.');
      }
      throw new HttpsError('invalid-argument', 'Illegal move.');
    }

    tx.set(stateRef, result.next);
    tx.update(roomRef, { updatedAt: FieldValue.serverTimestamp() });
    tx.set(roomRef.collection('events').doc(), {
      type: 'move',
      pieceId,
      to,
      uid,
      timestamp: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true as const };
});

/**
 * Seated player resigns: opponent wins immediately (winnerReason: resign).
 * Idempotent if the match already has a winner. Spectators cannot resign.
 */
export const resignMatch = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const roomId = String(request.data?.roomId ?? '');
  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required.');
  }

  const roomRef = db.collection(ROOMS).doc(roomId);
  const stateRef = roomRef.collection('meta').doc('gameState');

  const outcome = await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) {
      throw new HttpsError('not-found', 'Room not found.');
    }
    const room = roomSnap.data()! as RoomData;
    const stateSnap = await tx.get(stateRef);
    if (!stateSnap.exists) {
      throw new HttpsError('failed-precondition', 'Missing game state.');
    }
    const gameState = stateSnap.data() as GameState;
    if (gameState.winner) {
      return {
        ok: true as const,
        alreadyFinished: true as const,
        winner: gameState.winner,
      };
    }

    const result = applyResign(gameState, uid, room);
    if (!result.ok) {
      if (result.reason === 'not-player') {
        throw new HttpsError(
          'permission-denied',
          'Only seated players may resign.',
        );
      }
      if (result.reason === 'no-opponent') {
        throw new HttpsError(
          'failed-precondition',
          'Cannot resign before an opponent is seated.',
        );
      }
      throw new HttpsError('failed-precondition', 'Match already finished.');
    }

    tx.set(stateRef, result.next);
    tx.update(roomRef, { updatedAt: FieldValue.serverTimestamp() });
    tx.set(roomRef.collection('events').doc(), {
      type: 'resign',
      uid,
      resigned: result.resigned,
      winner: result.winner,
      timestamp: FieldValue.serverTimestamp(),
    });
    return {
      ok: true as const,
      alreadyFinished: false as const,
      winner: result.winner,
      resigned: result.resigned,
    };
  });

  if (!outcome.alreadyFinished && 'resigned' in outcome && outcome.resigned) {
    await appendSystemChat(
      roomId,
      `${outcome.resigned} resigned. ${outcome.winner} wins.`,
    );
  }

  return outcome;
});

export const sendChat = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const roomId = String(request.data?.roomId ?? '');
  const text = String(request.data?.text ?? '').trim();

  if (!roomId || !text) {
    throw new HttpsError('invalid-argument', 'roomId and text are required.');
  }
  if (text.length > 500) {
    throw new HttpsError('invalid-argument', 'Message too long.');
  }

  const roomRef = db.collection(ROOMS).doc(roomId);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    throw new HttpsError('not-found', 'Room not found.');
  }
  const room = roomSnap.data()! as RoomData;
  if (!isMember(room, uid)) {
    throw new HttpsError('permission-denied', 'Not a room member.');
  }
  if (!canSendChat(room, uid)) {
    throw new HttpsError(
      'permission-denied',
      'Spectators may watch chat but cannot send messages.',
    );
  }

  await roomRef.collection('chat').add({
    senderId: uid,
    text,
    timestamp: FieldValue.serverTimestamp(),
    isSystemMessage: false,
  });
  await roomRef.update({ updatedAt: FieldValue.serverTimestamp() });

  return { ok: true as const };
});

/** Host toggles spectator gallery (allow / close). Closing does not kick existing watchers. */
export const setAllowObservers = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const roomId = String(request.data?.roomId ?? '');
  const allowObservers = Boolean(request.data?.allowObservers);

  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required.');
  }

  const roomRef = db.collection(ROOMS).doc(roomId);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    throw new HttpsError('not-found', 'Room not found.');
  }
  const room = roomSnap.data()! as RoomData;
  if (room.creatorId !== uid) {
    throw new HttpsError(
      'permission-denied',
      'Only the room host may change spectator access.',
    );
  }

  await roomRef.update({
    allowObservers,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await appendSystemChat(
    roomId,
    allowObservers
      ? 'Spectator gallery opened.'
      : 'Spectator gallery closed — new watchers cannot join.',
  );

  return { ok: true as const, allowObservers };
});

/**
 * Mark a rated sector assisted after advisor use (Warp integrity).
 * Idempotent; seated players only.
 */
export const markRoomAssisted = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const roomId = String(request.data?.roomId ?? '');
  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required.');
  }

  const roomRef = db.collection(ROOMS).doc(roomId);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    throw new HttpsError('not-found', 'Room not found.');
  }
  const room = roomSnap.data()! as RoomData;
  if (!isSeatedPlayer(room, uid)) {
    throw new HttpsError(
      'permission-denied',
      'Only seated players may mark a sector assisted.',
    );
  }

  if (room.assisted === true) {
    return { ok: true as const, assisted: true, already: true };
  }

  await roomRef.update({
    assisted: true,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await appendSystemChat(
    roomId,
    'Sector marked assisted — tactical advisor used; TEI will not apply.',
  );

  return { ok: true as const, assisted: true, already: false };
});

/**
 * Rate a finished local AI match against the TEI AI anchors.
 * Idempotent via latticeRatingEvents/{eventId}.
 */
export const reportLatticeLocalAiMatch = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const eventId = String(request.data?.eventId ?? '').trim();
  const strength = String(request.data?.strength ?? 'normal') as AiStrengthId;
  const humanWon = Boolean(request.data?.humanWon);
  const displayName = await resolveFederationCallSign(uid);

  if (!eventId || eventId.length > 128) {
    throw new HttpsError('invalid-argument', 'eventId is required.');
  }
  if (strength !== 'fast' && strength !== 'normal' && strength !== 'strong') {
    throw new HttpsError('invalid-argument', 'Invalid AI strength.');
  }

  const eventRef = db.collection(RATING_EVENTS).doc(eventId);
  const teiRef = db.collection(TEI).doc(uid);

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) {
      const priorDoc = await tx.get(teiRef);
      return {
        ok: true as const,
        duplicate: true,
        tei: priorDoc.data()?.localAi?.displayGrade ?? null,
      };
    }

    const teiSnap = await tx.get(teiRef);
    const prior = teiSnap.data()?.localAi as
      | { mu?: number; sigma?: number; matches?: number; wins?: number }
      | undefined;
    const next = rateLocalAiMatch(prior, strength, humanWon);

    tx.set(
      teiRef,
      {
        uid,
        displayName,
        updatedAt: FieldValue.serverTimestamp(),
        localAi: {
          mu: next.mu,
          sigma: next.sigma,
          matches: next.matches,
          wins: next.wins,
          displayGrade: next.displayGrade,
        },
      },
      { merge: true },
    );
    tx.set(eventRef, {
      uid,
      kind: 'local-ai',
      strength,
      humanWon,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { ok: true as const, duplicate: false, tei: next.displayGrade };
  });
});

/**
 * Rate a finished online human-vs-human match into latticeTei.online.
 * Idempotent via latticeRatingEvents/online:{roomId}. Seated callers only.
 */
export const reportLatticeOnlineMatch = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const roomId = String(request.data?.roomId ?? '').trim();
  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required.');
  }

  const roomRef = db.collection(ROOMS).doc(roomId);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    throw new HttpsError('not-found', 'Room not found.');
  }
  const room = roomSnap.data()! as RoomData;
  if (!isSeatedPlayer(room, uid)) {
    throw new HttpsError(
      'permission-denied',
      'Only seated players may report TEI.',
    );
  }

  const stateSnap = await roomRef.collection('meta').doc('gameState').get();
  if (!stateSnap.exists) {
    throw new HttpsError('failed-precondition', 'Game state missing.');
  }
  const gameState = stateSnap.data() as GameState;
  const plan = planOnlineTeiReport(room, gameState.winner);
  if (!plan.ok) {
    return { ok: true as const, rated: false as const, reason: plan.reason };
  }

  const [whiteCallSign, blackCallSign] = await Promise.all([
    resolveFederationCallSign(plan.whitePlayerId),
    resolveFederationCallSign(plan.blackPlayerId),
  ]);

  const eventId = onlineRatingEventId(roomId);
  const eventRef = db.collection(RATING_EVENTS).doc(eventId);
  const whiteTeiRef = db.collection(TEI).doc(plan.whitePlayerId);
  const blackTeiRef = db.collection(TEI).doc(plan.blackPlayerId);

  type OnlinePrior = {
    mu?: number;
    sigma?: number;
    matches?: number;
    wins?: number;
  };

  const result = await db.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) {
      const wSnap = await tx.get(whiteTeiRef);
      const bSnap = await tx.get(blackTeiRef);
      return {
        ok: true as const,
        rated: true as const,
        duplicate: true,
        whiteTei:
          (wSnap.data()?.online?.displayGrade as string | undefined) ?? null,
        blackTei:
          (bSnap.data()?.online?.displayGrade as string | undefined) ?? null,
      };
    }

    const wSnap = await tx.get(whiteTeiRef);
    const bSnap = await tx.get(blackTeiRef);
    const next = rateOnlinePvpMatch(
      wSnap.data()?.online as OnlinePrior | undefined,
      bSnap.data()?.online as OnlinePrior | undefined,
      plan.winner === 'WHITE' ? 'white' : 'black',
    );

    tx.set(
      whiteTeiRef,
      {
        uid: plan.whitePlayerId,
        displayName: whiteCallSign,
        updatedAt: FieldValue.serverTimestamp(),
        online: {
          mu: next.white.mu,
          sigma: next.white.sigma,
          matches: next.white.matches,
          wins: next.white.wins,
          displayGrade: next.white.displayGrade,
        },
      },
      { merge: true },
    );
    tx.set(
      blackTeiRef,
      {
        uid: plan.blackPlayerId,
        displayName: blackCallSign,
        updatedAt: FieldValue.serverTimestamp(),
        online: {
          mu: next.black.mu,
          sigma: next.black.sigma,
          matches: next.black.matches,
          wins: next.black.wins,
          displayGrade: next.black.displayGrade,
        },
      },
      { merge: true },
    );
    tx.set(eventRef, {
      kind: 'online',
      roomId,
      whitePlayerId: plan.whitePlayerId,
      blackPlayerId: plan.blackPlayerId,
      winner: plan.winner,
      memberUids: [plan.whitePlayerId, plan.blackPlayerId],
      uid: plan.whitePlayerId,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true as const,
      rated: true as const,
      duplicate: false,
      whiteTei: next.white.displayGrade,
      blackTei: next.black.displayGrade,
    };
  });

  if (result.rated && !result.duplicate && result.whiteTei && result.blackTei) {
    await appendSystemChat(
      roomId,
      `Rated sector complete — TEI updated (White ${result.whiteTei} · Black ${result.blackTei}).`,
    );
  }

  return result;
});
