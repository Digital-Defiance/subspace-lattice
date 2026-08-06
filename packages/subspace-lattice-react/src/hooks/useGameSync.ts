import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from 'firebase/firestore';
import {
  buildLatticeDebugPayload,
  Coordinate,
  createMatchDebugLog,
  diffStatesToLpgnEntry,
  GameState,
  IChatMessage,
  IGameRoom,
  LATTICE_COLLECTIONS,
  LatticeDebugExport,
  PieceType,
  SubspaceLatticeEngine,
} from '@subspace-lattice/core';
import { getFirebaseDb } from '../firebase/app';
import { createSubspaceLatticeApiClient } from '../services/api';

interface RoomDoc {
  roomCode: string;
  name: string;
  creatorId: string;
  whitePlayerId?: string;
  blackPlayerId?: string;
  whiteDisplayName?: string;
  blackDisplayName?: string;
  observerIds: string[];
  allowObservers: boolean;
  rated?: boolean;
  assisted?: boolean;
  rulesVersion?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface RoomEventDoc {
  id: string;
  type: string;
  pieceId?: string;
  to?: { x: number; y: number };
  uid?: string;
  resigned?: string;
  winner?: string;
  timestamp?: string;
  [key: string]: unknown;
}

function toDate(value: Timestamp | Date | undefined): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  return value.toDate();
}

function toIso(value: Timestamp | Date | undefined): string | undefined {
  if (!value) return undefined;
  return toDate(value).toISOString();
}

export const useGameSync = (localPlayerId: string) => {
  const apiClient = useMemo(() => createSubspaceLatticeApiClient(), []);
  const [engine, setEngine] = useState<SubspaceLatticeEngine | null>(null);
  const [activeRoom, setActiveRoom] = useState<IGameRoom<string> | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomEvents, setRoomEvents] = useState<RoomEventDoc[]>([]);
  const debugLog = useRef(createMatchDebugLog());
  const prevOnlineStateRef = useRef<GameState | null>(null);
  const initialOnlineStateRef = useRef<GameState | null>(null);
  const engineRef = useRef<SubspaceLatticeEngine | null>(null);
  engineRef.current = engine;

  // Derive LPGN/debug plies from authoritative state deltas (works for both seats).
  useEffect(() => {
    if (!engine) {
      prevOnlineStateRef.current = null;
      return;
    }
    const after = engine.getState();
    const before = prevOnlineStateRef.current;
    if (!before) {
      prevOnlineStateRef.current = structuredClone(after);
      if (!initialOnlineStateRef.current) {
        initialOnlineStateRef.current = structuredClone(after);
      }
      return;
    }
    const entry = diffStatesToLpgnEntry(before, after);
    prevOnlineStateRef.current = structuredClone(after);
    if (entry) debugLog.current.append(entry);
  }, [engine]);

  useEffect(() => {
    if (roomId) return;
    debugLog.current.clear();
    prevOnlineStateRef.current = null;
    initialOnlineStateRef.current = null;
  }, [roomId]);

  // Subscribe to room + gameState + chat + events when we have a roomId
  useEffect(() => {
    if (!roomId || !localPlayerId) return;

    const db = getFirebaseDb();
    const rooms = LATTICE_COLLECTIONS.rooms;
    const roomRef = doc(db, rooms, roomId);
    const gameStateRef = doc(db, rooms, roomId, 'meta', 'gameState');
    const chatQuery = query(
      collection(db, rooms, roomId, 'chat'),
      orderBy('timestamp', 'asc'),
    );
    const eventsQuery = query(
      collection(db, rooms, roomId, 'events'),
      orderBy('timestamp', 'asc'),
    );

    let roomData: RoomDoc | null = null;
    let gameState: GameState | null = null;
    let chatMessages: IChatMessage<string>[] = [];

    const publishRoom = () => {
      if (!roomData || !gameState) return;
      setActiveRoom({
        id: roomId,
        roomCode: roomData.roomCode,
        name: roomData.name,
        creatorId: roomData.creatorId,
        whitePlayerId: roomData.whitePlayerId,
        blackPlayerId: roomData.blackPlayerId,
        whiteDisplayName: roomData.whiteDisplayName,
        blackDisplayName: roomData.blackDisplayName,
        observerIds: roomData.observerIds ?? [],
        allowObservers: roomData.allowObservers,
        rated: roomData.rated === true,
        assisted: roomData.assisted === true,
        rulesVersion: roomData.rulesVersion as IGameRoom['rulesVersion'],
        gameState,
        chatMessages,
        createdAt: toDate(roomData.createdAt),
        updatedAt: toDate(roomData.updatedAt),
      });
    };

    const publishGameState = () => {
      if (!gameState) return;
      setEngine(SubspaceLatticeEngine.fromState(gameState));
      publishRoom();
    };

    const unsubRoom = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) return;
      roomData = snap.data() as RoomDoc;
      publishRoom();
    });

    const unsubState = onSnapshot(gameStateRef, (snap) => {
      if (!snap.exists()) return;
      gameState = snap.data() as GameState;
      publishGameState();
    });

    const unsubChat = onSnapshot(chatQuery, (snap) => {
      chatMessages = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          senderId: data.senderId,
          text: data.text,
          timestamp: toDate(data.timestamp),
          isSystemMessage: Boolean(data.isSystemMessage),
        } as IChatMessage<string>;
      });
      // Chat must not rebuild the engine from a possibly pre-move snapshot.
      publishRoom();
    });

    const unsubEvents = onSnapshot(eventsQuery, (snap) => {
      setRoomEvents(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            timestamp: toIso(data.timestamp as Timestamp | undefined),
          } as RoomEventDoc;
        }),
      );
    });

    return () => {
      unsubRoom();
      unsubState();
      unsubChat();
      unsubEvents();
      setRoomEvents([]);
    };
  }, [roomId, localPlayerId]);

  const createAndJoinRoom = async (
    name: string,
    password?: string,
    options?: {
      allowObservers?: boolean;
      rated?: boolean;
      preferredColor?: 'WHITE' | 'BLACK';
      displayName?: string;
      rulesOverrides?: {
        infiltratorSpoolUp?: boolean;
        infiltratorActivationPly?: number;
        sectorActivationPly?: number;
        sectorIntegrationRatio?: number;
        heavyWingPreset?: 'standard' | 'refractor-wing' | 'fleet-draft';
        empRadius?: number;
        empChargeTarget?: number;
        empBlackoutPlies?: number;
        terminalEmpRadiusGrowthInterval?: number;
      };
    },
  ) => {
    try {
      const room = await apiClient.createRoom(name, password, options);
      setRoomId(room.id);
      return room;
    } catch (error) {
      console.error('Failed to create room:', error);
      alert('Failed to create room.');
      return null;
    }
  };

  const joinRoom = async (
    roomCode: string,
    password?: string,
    asObserver?: boolean,
    displayName?: string,
  ) => {
    try {
      const room = await apiClient.joinRoomByCode(roomCode, {
        password,
        asObserver,
        displayName,
      });
      setRoomId(room.id);
      return room;
    } catch (error) {
      console.error('Failed to join room:', error);
      alert('Failed to join room.');
      return null;
    }
  };

  const hydrateFromRoomCode = useCallback(
    async (code: string) => {
      try {
        const room = await apiClient.getRoomByCode(code);
        const isAlreadyPlayer =
          room.whitePlayerId === localPlayerId ||
          room.blackPlayerId === localPlayerId ||
          room.observerIds.includes(localPlayerId);
        if (isAlreadyPlayer) {
          setRoomId(room.id);
        } else {
          setActiveRoom({ ...room, chatMessages: room.chatMessages ?? [] });
        }
        return room;
      } catch (error) {
        console.error('Failed to hydrate room:', error);
        return null;
      }
    },
    [apiClient, localPlayerId],
  );

  const sendMove = async (
    activeRoomId: string,
    pieceId: string,
    to: Coordinate,
  ): Promise<boolean> => {
    const current = engineRef.current;
    if (!current) return false;
    const before = current.clone();
    const optimistic = current.clone();
    if (!optimistic.movePiece(pieceId, to)) return false;
    setEngine(optimistic);

    try {
      await apiClient.submitMove(activeRoomId, pieceId, to);
      return true;
    } catch (error) {
      console.error('Failed to send move:', error);
      setEngine(before);
      return false;
    }
  };

  const sendEmp = async (activeRoomId: string): Promise<boolean> => {
    const current = engineRef.current;
    if (!current) return false;
    const before = current.clone();
    const optimistic = current.clone();
    if (!optimistic.fireEmp()) return false;
    setEngine(optimistic);

    try {
      await apiClient.submitEmp(activeRoomId);
      return true;
    } catch (error) {
      console.error('Failed to fire EMP:', error);
      setEngine(before);
      return false;
    }
  };

  const sendChatMessage = async (activeRoomId: string, text: string) => {
    try {
      await apiClient.sendChat(activeRoomId, text);
    } catch (error) {
      console.error('Failed to send chat:', error);
    }
  };

  const sendPlacement = async (
    _roomId: string,
    _pieceType: PieceType,
    _to: Coordinate,
  ) => {
    // Placement phase not yet implemented
  };

  const setAllowObservers = async (
    activeRoomId: string,
    allowObservers: boolean,
  ) => {
    try {
      await apiClient.setAllowObservers(activeRoomId, allowObservers);
    } catch (error) {
      console.error('Failed to update spectator access:', error);
      alert('Could not update spectator access.');
    }
  };

  const markRoomAssisted = async (activeRoomId: string) => {
    try {
      await apiClient.markRoomAssisted(activeRoomId);
    } catch (error) {
      console.error('Failed to mark sector assisted:', error);
    }
  };

  const reportOnlineMatch = useCallback(async (activeRoomId: string) => {
    try {
      return await apiClient.reportOnlineMatch(activeRoomId);
    } catch (error) {
      console.error('Failed to report online TEI:', error);
      return null;
    }
  }, [apiClient]);

  const leaveRoom = useCallback(() => {
    setRoomId(null);
    setActiveRoom(null);
    setEngine(null);
    setRoomEvents([]);
  }, []);

  const resignMatch = useCallback(
    async (activeRoomId: string) => {
      try {
        return await apiClient.resignMatch(activeRoomId);
      } catch (error) {
        console.error('Failed to resign match:', error);
        throw error;
      }
    },
    [apiClient],
  );

  const buildDebugExport = useCallback((): LatticeDebugExport | null => {
    if (!engine || !activeRoom) return null;

    return buildLatticeDebugPayload(
      {
        mode: 'online',
        sectorCode: activeRoom.roomCode,
        viewerId: localPlayerId || undefined,
        notes: [
          'Online sector — current gameState + Firestore events.',
          'Move list inferred from live state deltas for LPGN.',
        ],
      },
      {
        gameState: structuredClone(engine.getState()),
        initialState: initialOnlineStateRef.current
          ? structuredClone(initialOnlineStateRef.current)
          : undefined,
        moveLog: debugLog.current.snapshot(),
        online: {
          roomId: activeRoom.id,
          roomCode: activeRoom.roomCode,
          roomName: activeRoom.name,
          creatorId: activeRoom.creatorId,
          whitePlayerId: activeRoom.whitePlayerId,
          blackPlayerId: activeRoom.blackPlayerId,
          whiteDisplayName: activeRoom.whiteDisplayName,
          blackDisplayName: activeRoom.blackDisplayName,
          rated: activeRoom.rated,
          assisted: activeRoom.assisted,
          rulesVersion:
            engine.getState().rulesVersion ?? activeRoom.rulesVersion,
        },
      },
      { events: roomEvents },
    );
  }, [activeRoom, engine, localPlayerId, roomEvents]);

  return {
    activeRoom,
    engine,
    roomEvents,
    createAndJoinRoom,
    joinRoom,
    hydrateFromRoomCode,
    leaveRoom,
    resignMatch,
    sendMove,
    sendEmp,
    sendChatMessage,
    sendPlacement,
    setAllowObservers,
    markRoomAssisted,
    reportOnlineMatch,
    buildDebugExport,
  };
};
