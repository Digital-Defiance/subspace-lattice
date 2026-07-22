import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from 'firebase/firestore';
import {
  Coordinate,
  GameState,
  IChatMessage,
  IGameRoom,
  LATTICE_COLLECTIONS,
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

function toDate(value: Timestamp | Date | undefined): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  return value.toDate();
}

export const useGameSync = (localPlayerId: string) => {
  const apiClient = useMemo(() => createSubspaceLatticeApiClient(), []);
  const [engine, setEngine] = useState<SubspaceLatticeEngine | null>(null);
  const [activeRoom, setActiveRoom] = useState<IGameRoom<string> | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);

  // Subscribe to room + gameState + chat when we have a roomId
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

    let roomData: RoomDoc | null = null;
    let gameState: GameState | null = null;
    let chatMessages: IChatMessage<string>[] = [];

    const rebuild = () => {
      if (!roomData || !gameState) return;
      const nextEngine = SubspaceLatticeEngine.fromState(gameState);
      setEngine(nextEngine);
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
        gameState,
        chatMessages,
        createdAt: toDate(roomData.createdAt),
        updatedAt: toDate(roomData.updatedAt),
      });
    };

    const unsubRoom = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) return;
      roomData = snap.data() as RoomDoc;
      rebuild();
    });

    const unsubState = onSnapshot(gameStateRef, (snap) => {
      if (!snap.exists()) return;
      gameState = snap.data() as GameState;
      rebuild();
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
      rebuild();
    });

    return () => {
      unsubRoom();
      unsubState();
      unsubChat();
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

  const sendMove = async (activeRoomId: string, pieceId: string, to: Coordinate) => {
    try {
      await apiClient.submitMove(activeRoomId, pieceId, to);
    } catch (error) {
      console.error('Failed to send move:', error);
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

  return {
    activeRoom,
    engine,
    createAndJoinRoom,
    joinRoom,
    hydrateFromRoomCode,
    leaveRoom,
    resignMatch,
    sendMove,
    sendChatMessage,
    sendPlacement,
    setAllowObservers,
    markRoomAssisted,
    reportOnlineMatch,
  };
};
