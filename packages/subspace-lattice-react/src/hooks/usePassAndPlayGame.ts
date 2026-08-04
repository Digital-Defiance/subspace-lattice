import { useCallback, useRef, useState } from 'react';
import {
  buildLatticeDebugPayload,
  Coordinate,
  createMatchDebugLog,
  describeWinnerReason,
  formatMoveLogLine,
  formatSystemLogLine,
  GameState,
  LatticeDebugExport,
  matchDebugEntryFromMoveInfo,
  MatchDebugMoveEntry,
  PieceType,
  PlayerColor,
  heavyWingPresetFromRules,
  resolveFleetLobbyRules,
  SubspaceLatticeEngine,
} from '@subspace-lattice/core';
import type { LobbyRulesOptions } from '../lib/lobby-rules';
import { playGameSound, playLatticeSoundsAfterPly } from '../lib/game-sounds';

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
 * Shipping hybrid-fleet rules (Initiative Relay + sector clock).
 */
export function usePassAndPlayGame() {
  const [engine, setEngine] = useState<SubspaceLatticeEngine | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [active, setActive] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [moveLog, setMoveLog] = useState<readonly MatchDebugMoveEntry[]>([]);
  const [seatNames, setSeatNames] = useState<PassPlaySeatNames>({
    white: '',
    black: '',
  });
  /** Seat that must confirm before the board unlocks (null = ready). */
  const [handoffSeat, setHandoffSeat] = useState<PlayerColor | null>(null);
  const readySeatRef = useRef<PlayerColor | null>(null);
  const preferredSeatRef = useRef<PlayerColor>(PlayerColor.White);
  const rulesOverridesRef = useRef<LobbyRulesOptions | undefined>(undefined);
  const [setupInitialRules, setSetupInitialRules] = useState<
    LobbyRulesOptions | undefined
  >(undefined);
  const namesRef = useRef<PassPlaySeatNames>({ white: '', black: '' });
  const debugLog = useRef(createMatchDebugLog());
  const initialStateRef = useRef<GameState | null>(null);

  const appendLog = useCallback((line: string) => {
    setLogLines((prev) => [...prev, line]);
  }, []);

  const recordMove = useCallback(
    (entry: Parameters<ReturnType<typeof createMatchDebugLog>['append']>[0]) => {
      debugLog.current.append(entry);
      setMoveLog(debugLog.current.snapshot());
    },
    [],
  );

  const clearMoveLog = useCallback(() => {
    debugLog.current.clear();
    setMoveLog([]);
  }, []);

  const labelFor = useCallback((seat: PlayerColor): string => {
    const names = namesRef.current;
    return seat === PlayerColor.White
      ? normalizeName(names.white, 'White')
      : normalizeName(names.black, 'Black');
  }, []);

  const openPassAndPlaySetup = useCallback(
    (
      preferredSeat: PlayerColor = PlayerColor.White,
      rulesOverrides?: LobbyRulesOptions,
    ) => {
      preferredSeatRef.current = preferredSeat;
      rulesOverridesRef.current = rulesOverrides;
      setSetupInitialRules(rulesOverrides);
      setSetupOpen(true);
      setActive(false);
      setEngine(null);
      setHandoffSeat(null);
      readySeatRef.current = null;
      setLogLines([]);
      clearMoveLog();
      initialStateRef.current = null;
    },
    [clearMoveLog],
  );

  const startPassAndPlayGame = useCallback(
    (
      preferredSeat: PlayerColor = PlayerColor.White,
      names: PassPlaySeatNames = { white: '', black: '' },
      rulesOverrides?: LobbyRulesOptions,
    ) => {
      namesRef.current = names;
      setSeatNames(names);
      setSetupOpen(false);
      const rules = resolveFleetLobbyRules(
        rulesOverrides ?? rulesOverridesRef.current,
      );
      const next = new SubspaceLatticeEngine({ rules });
      initialStateRef.current = structuredClone(next.getState());
      clearMoveLog();
      setEngine(next);
      setActive(true);
      playGameSound('game-start');
      const whiteLabel = normalizeName(names.white, 'White');
      const blackLabel = normalizeName(names.black, 'Black');
      const moduleBits: string[] = [];
      if (rules.infiltratorSpoolUp) moduleBits.push('spool');
      if (rules.infiltratorActivationPly > 0) {
        moduleBits.push(`infil@${rules.infiltratorActivationPly}`);
      }
      if (rules.sectorActivationPly !== 100) {
        moduleBits.push(`clock@${rules.sectorActivationPly}`);
      }
      const wing = heavyWingPresetFromRules(rules);
      if (wing === 'refractor-wing') moduleBits.push('wing=refractor');
      if (wing === 'fleet-draft') moduleBits.push('wing=fleet-draft');
      const modulesNote = moduleBits.length
        ? ` · ${moduleBits.join(' ')}`
        : '';
      if (preferredSeat === PlayerColor.Black) {
        readySeatRef.current = null;
        setHandoffSeat(PlayerColor.White);
        setLogLines([
          formatSystemLogLine(
            `Pass & play (fleet${modulesNote}) — you claimed ${blackLabel}. Pass the device; ${whiteLabel} opens.`,
          ),
        ]);
      } else {
        readySeatRef.current = PlayerColor.White;
        setHandoffSeat(null);
        setLogLines([
          formatSystemLogLine(
            `Pass & play (fleet${modulesNote}) — ${whiteLabel} at helm. After each move, pass the device and confirm Ready.`,
          ),
        ]);
      }
    },
    [clearMoveLog],
  );

  const confirmPassAndPlaySetup = useCallback(
    (
      names: PassPlaySeatNames,
      rules?: LobbyRulesOptions,
      preferredSeat?: PlayerColor,
    ) => {
      if (preferredSeat) preferredSeatRef.current = preferredSeat;
      startPassAndPlayGame(
        preferredSeatRef.current,
        names,
        rules ?? rulesOverridesRef.current,
      );
    },
    [startPassAndPlayGame],
  );

  const exitPassAndPlayGame = useCallback(() => {
    setSetupOpen(false);
    setSetupInitialRules(undefined);
    setEngine(null);
    setActive(false);
    setLogLines([]);
    setHandoffSeat(null);
    readySeatRef.current = null;
    namesRef.current = { white: '', black: '' };
    setSeatNames({ white: '', black: '' });
    clearMoveLog();
    initialStateRef.current = null;
  }, [clearMoveLog]);

  const confirmHandoff = useCallback(() => {
    if (!engine || handoffSeat == null) return;
    const seat = engine.getState().currentPlayer;
    if (handoffSeat !== seat) return;
    readySeatRef.current = seat;
    setHandoffSeat(null);
    appendLog(formatSystemLogLine(`${labelFor(seat)} ready at helm.`));
  }, [engine, handoffSeat, appendLog, labelFor]);

  const refresh = (next: SubspaceLatticeEngine) => {
    setEngine(SubspaceLatticeEngine.fromState(next.getState(), next.getRules()));
  };

  const sendMove = useCallback(
    (pieceId: string, to: Coordinate): boolean => {
      if (!engine || handoffSeat != null) return false;
      const state = engine.getState();
      if (state.winner) return false;
      const mover = state.currentPlayer;
      const piece = engine.getPiece(pieceId);
      const from = piece ? { ...piece.position } : undefined;
      const target = engine.getPieceAt(to);
      const before = structuredClone(engine.getState());
      const ok = engine.movePiece(pieceId, to);
      const info = engine.getLastMoveInfo();
      recordMove(
        matchDebugEntryFromMoveInfo({
          player: mover,
          pieceId,
          from,
          to: { ...to },
          capturedId: target?.id,
          capturedType: target?.type,
          source: 'human',
          ok,
          info,
        }),
      );
      if (!ok) return false;

      playLatticeSoundsAfterPly(before, engine);
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
              after.winnerReason
                ? ` — ${describeWinnerReason(after.winnerReason)}`
                : ''
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
      return true;
    },
    [engine, handoffSeat, appendLog, labelFor, recordMove],
  );

  const fireEmp = useCallback((): boolean => {
    if (!engine || handoffSeat != null) return false;
    const state = engine.getState();
    if (state.winner) return false;
    const mover = state.currentPlayer;
    const hub = Object.values(state.pieces).find(
      (p) => p.type === PieceType.CommandHub && p.owner === mover,
    );
    const before = structuredClone(engine.getState());
    const ok = engine.fireEmp();
    recordMove(
      matchDebugEntryFromMoveInfo({
        player: mover,
        pieceId: 'emp',
        to: hub?.position ?? { x: -1, y: -1 },
        source: 'human',
        ok,
        info: engine.getLastMoveInfo(),
        empOrigin: hub?.position,
      }),
    );
    if (!ok) return false;
    playLatticeSoundsAfterPly(before, engine);
    appendLog(
      formatSystemLogLine(`${labelFor(mover)} fires Command Overload (EMP).`),
    );
    const after = engine.getState();
    if (after.winner) {
      appendLog(
        formatSystemLogLine(
          `Winner: ${labelFor(after.winner)}${
            after.winnerReason
              ? ` — ${describeWinnerReason(after.winnerReason)}`
              : ''
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
    return true;
  }, [engine, handoffSeat, appendLog, labelFor, recordMove]);

  const resign = useCallback((): boolean => {
    if (!engine || handoffSeat != null) return false;
    const state = engine.getState();
    if (state.winner) return false;
    const mover = state.currentPlayer;
    const before = structuredClone(engine.getState());
    const ok = engine.resign(mover);
    if (!ok) return false;
    playLatticeSoundsAfterPly(before, engine);
    appendLog(formatSystemLogLine(`${labelFor(mover)} resigns.`));
    const after = engine.getState();
    if (after.winner) {
      appendLog(
        formatSystemLogLine(
          `Winner: ${labelFor(after.winner)}${
            after.winnerReason
              ? ` — ${describeWinnerReason(after.winnerReason)}`
              : ''
          }`,
        ),
      );
    }
    setHandoffSeat(null);
    readySeatRef.current = null;
    refresh(engine);
    return true;
  }, [engine, handoffSeat, appendLog, labelFor]);

  const buildDebugExport = useCallback((): LatticeDebugExport | null => {
    if (!engine) return null;
    const names = namesRef.current;
    return buildLatticeDebugPayload(
      {
        mode: 'pass-and-play',
        sectorCode: 'pass-and-play',
        notes: ['Pass-and-play hotseat — full gameState included.'],
      },
      {
        gameState: structuredClone(engine.getState()),
        initialState: initialStateRef.current
          ? structuredClone(initialStateRef.current)
          : undefined,
        moveLog: debugLog.current.snapshot(),
        displayLog: [...logLines],
        passAndPlay: {
          whiteName: normalizeName(names.white, 'White'),
          blackName: normalizeName(names.black, 'Black'),
        },
      },
    );
  }, [engine, logLines]);

  const handoffPending = handoffSeat != null;

  return {
    active,
    setupOpen,
    setupInitialRules,
    engine,
    logLines,
    moveLog,
    seatNames,
    handoffPending,
    handoffSeat,
    labelFor,
    appendLog,
    confirmHandoff,
    openPassAndPlaySetup,
    confirmPassAndPlaySetup,
    startPassAndPlayGame,
    exitPassAndPlayGame,
    sendMove,
    fireEmp,
    resign,
    buildDebugExport,
  };
}
