import { useCallback, useRef, useState } from 'react';
import {
  Coordinate,
  formatMoveLogLine,
  formatSystemLogLine,
  PlayerColor,
  SubspaceLatticeEngine,
} from '@subspace-lattice/core';

export type PassPlaySeatNames = {
  white: string;
  black: string;
};

function normalizeName(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  return trimmed || fallback;
}

/**
 * Offline pass-and-play (hotseat): two humans share one device.
 * Optional name setup, then a Warp-style handoff gate between turns.
 * Soft-shipped hybrid-fleet rules (Initiative Relay + sector clock).
 */
export function usePassAndPlayGame() {
  const [engine, setEngine] = useState<SubspaceLatticeEngine | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [active, setActive] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [seatNames, setSeatNames] = useState<PassPlaySeatNames>({
    white: '',
    black: '',
  });
  /** Seat that must confirm before the board unlocks (null = ready). */
  const [handoffSeat, setHandoffSeat] = useState<PlayerColor | null>(null);
  const readySeatRef = useRef<PlayerColor | null>(null);
  const preferredSeatRef = useRef<PlayerColor>(PlayerColor.White);
  const namesRef = useRef<PassPlaySeatNames>({ white: '', black: '' });

  const appendLog = useCallback((line: string) => {
    setLogLines((prev) => [...prev, line]);
  }, []);

  const labelFor = useCallback((seat: PlayerColor): string => {
    const names = namesRef.current;
    return seat === PlayerColor.White
      ? normalizeName(names.white, 'White')
      : normalizeName(names.black, 'Black');
  }, []);

  const openPassAndPlaySetup = useCallback(
    (preferredSeat: PlayerColor = PlayerColor.White) => {
      preferredSeatRef.current = preferredSeat;
      setSetupOpen(true);
      setActive(false);
      setEngine(null);
      setHandoffSeat(null);
      readySeatRef.current = null;
      setLogLines([]);
    },
    [],
  );

  const startPassAndPlayGame = useCallback(
    (
      preferredSeat: PlayerColor = PlayerColor.White,
      names: PassPlaySeatNames = { white: '', black: '' },
    ) => {
      namesRef.current = names;
      setSeatNames(names);
      setSetupOpen(false);
      setEngine(new SubspaceLatticeEngine({ rulesVersion: 'hybrid-fleet' }));
      setActive(true);
      const whiteLabel = normalizeName(names.white, 'White');
      const blackLabel = normalizeName(names.black, 'Black');
      if (preferredSeat === PlayerColor.Black) {
        readySeatRef.current = null;
        setHandoffSeat(PlayerColor.White);
        setLogLines([
          formatSystemLogLine(
            `Pass & play (fleet) — you claimed ${blackLabel}. Pass the device; ${whiteLabel} opens.`,
          ),
        ]);
      } else {
        readySeatRef.current = PlayerColor.White;
        setHandoffSeat(null);
        setLogLines([
          formatSystemLogLine(
            `Pass & play (fleet) — ${whiteLabel} at helm. After each move, pass the device and confirm Ready.`,
          ),
        ]);
      }
    },
    [],
  );

  const confirmPassAndPlaySetup = useCallback(
    (names: PassPlaySeatNames) => {
      startPassAndPlayGame(preferredSeatRef.current, names);
    },
    [startPassAndPlayGame],
  );

  const exitPassAndPlayGame = useCallback(() => {
    setSetupOpen(false);
    setEngine(null);
    setActive(false);
    setLogLines([]);
    setHandoffSeat(null);
    readySeatRef.current = null;
    namesRef.current = { white: '', black: '' };
    setSeatNames({ white: '', black: '' });
  }, []);

  const confirmHandoff = useCallback(() => {
    if (!engine || handoffSeat == null) return;
    const seat = engine.getState().currentPlayer;
    if (handoffSeat !== seat) return;
    readySeatRef.current = seat;
    setHandoffSeat(null);
    appendLog(formatSystemLogLine(`${labelFor(seat)} ready at helm.`));
  }, [engine, handoffSeat, appendLog, labelFor]);

  const refresh = (next: SubspaceLatticeEngine) => {
    setEngine(SubspaceLatticeEngine.fromState(next.getState()));
  };

  const sendMove = useCallback(
    (pieceId: string, to: Coordinate) => {
      if (!engine || handoffSeat != null) return;
      const state = engine.getState();
      if (state.winner) return;
      const mover = state.currentPlayer;
      const target = engine.getPieceAt(to);
      const ok = engine.movePiece(pieceId, to);
      if (!ok) return;

      appendLog(
        formatMoveLogLine({
          player: labelFor(mover),
          pieceId,
          to,
          captured: target?.id,
        }),
      );
      const after = engine.getState();
      if (after.winner) {
        appendLog(
          formatSystemLogLine(
            `Winner: ${labelFor(after.winner)}${
              after.winnerReason ? ` (${after.winnerReason})` : ''
            }`,
          ),
        );
        setHandoffSeat(null);
        readySeatRef.current = null;
      } else {
        appendLog(
          formatSystemLogLine(
            `Pass the device — ${labelFor(after.currentPlayer)} at helm.`,
          ),
        );
        readySeatRef.current = null;
        setHandoffSeat(after.currentPlayer);
      }
      refresh(engine);
    },
    [engine, handoffSeat, appendLog, labelFor],
  );

  const handoffPending = handoffSeat != null;

  return {
    active,
    setupOpen,
    engine,
    logLines,
    seatNames,
    handoffPending,
    handoffSeat,
    labelFor,
    confirmHandoff,
    openPassAndPlaySetup,
    confirmPassAndPlaySetup,
    startPassAndPlayGame,
    exitPassAndPlayGame,
    sendMove,
  };
}
