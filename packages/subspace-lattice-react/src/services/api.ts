import { httpsCallable } from 'firebase/functions';
import type { IGameRoom } from '@subspace-lattice/core';
import { getFirebaseFunctions } from '../firebase/app';

export interface CreateRoomRequest {
  name: string;
  password?: string;
  allowObservers?: boolean;
  rated?: boolean;
  preferredColor?: 'WHITE' | 'BLACK';
  rulesVersion?: string;
}

export interface JoinRoomRequest {
  roomCode: string;
  password?: string;
  asObserver?: boolean;
}

export interface SubmitMoveRequest {
  roomId: string;
  pieceId: string;
  to: { x: number; y: number };
}

export interface SendChatRequest {
  roomId: string;
  text: string;
}

export interface ReportLocalAiMatchRequest {
  eventId: string;
  strength: 'fast' | 'normal' | 'strong';
  humanWon: boolean;
  displayName?: string;
}

export function createSubspaceLatticeApiClient() {
  const functions = getFirebaseFunctions();

  const createRoomFn = httpsCallable<CreateRoomRequest, IGameRoom>(
    functions,
    'createRoom',
  );
  const joinRoomFn = httpsCallable<JoinRoomRequest, IGameRoom>(
    functions,
    'joinRoom',
  );
  const submitMoveFn = httpsCallable<SubmitMoveRequest, { ok: true }>(
    functions,
    'submitMove',
  );
  const sendChatFn = httpsCallable<SendChatRequest, { ok: true }>(
    functions,
    'sendChat',
  );

  const lookupRoomFn = httpsCallable<{ roomCode: string }, IGameRoom>(
    functions,
    'lookupRoom',
  );

  const reportLocalAiFn = httpsCallable<
    ReportLocalAiMatchRequest,
    { ok: true; duplicate: boolean; tei: string | null }
  >(functions, 'reportLatticeLocalAiMatch');

  const setAllowObserversFn = httpsCallable<
    { roomId: string; allowObservers: boolean },
    { ok: true; allowObservers: boolean }
  >(functions, 'setAllowObservers');

  const markRoomAssistedFn = httpsCallable<
    { roomId: string },
    { ok: true; assisted: boolean; already?: boolean }
  >(functions, 'markRoomAssisted');

  const reportOnlineFn = httpsCallable<
    { roomId: string },
    | {
        ok: true;
        rated: true;
        duplicate: boolean;
        whiteTei: string | null;
        blackTei: string | null;
      }
    | { ok: true; rated: false; reason: string }
  >(functions, 'reportLatticeOnlineMatch');

  const resignMatchFn = httpsCallable<
    { roomId: string },
    {
      ok: true;
      alreadyFinished: boolean;
      winner: string;
      resigned?: string;
    }
  >(functions, 'resignMatch');

  return {
    createRoom: async (
      name: string,
      password?: string,
      options?: {
        allowObservers?: boolean;
        rated?: boolean;
        preferredColor?: 'WHITE' | 'BLACK';
      },
    ) => {
      const result = await createRoomFn({
        name,
        password,
        rulesVersion: 'hybrid-fleet',
        allowObservers: options?.allowObservers !== false,
        rated: options?.rated === true,
        preferredColor: options?.preferredColor === 'BLACK' ? 'BLACK' : 'WHITE',
      });
      return result.data;
    },
    getRoomByCode: async (roomCode: string) => {
      const result = await lookupRoomFn({ roomCode });
      return result.data;
    },
    joinRoomByCode: async (
      roomCode: string,
      payload: { password?: string; asObserver?: boolean } = {},
    ) => {
      const result = await joinRoomFn({
        roomCode,
        password: payload.password,
        asObserver: payload.asObserver,
      });
      return result.data;
    },
    submitMove: async (roomId: string, pieceId: string, to: { x: number; y: number }) => {
      await submitMoveFn({ roomId, pieceId, to });
    },
    sendChat: async (roomId: string, text: string) => {
      await sendChatFn({ roomId, text });
    },
    setAllowObservers: async (roomId: string, allowObservers: boolean) => {
      const result = await setAllowObserversFn({ roomId, allowObservers });
      return result.data;
    },
    markRoomAssisted: async (roomId: string) => {
      const result = await markRoomAssistedFn({ roomId });
      return result.data;
    },
    reportLocalAiMatch: async (payload: ReportLocalAiMatchRequest) => {
      const result = await reportLocalAiFn(payload);
      return result.data;
    },
    reportOnlineMatch: async (roomId: string) => {
      const result = await reportOnlineFn({ roomId });
      return result.data;
    },
    resignMatch: async (roomId: string) => {
      const result = await resignMatchFn({ roomId });
      return result.data;
    },
  };
}

export type SubspaceLatticeApiClient = ReturnType<
  typeof createSubspaceLatticeApiClient
>;
