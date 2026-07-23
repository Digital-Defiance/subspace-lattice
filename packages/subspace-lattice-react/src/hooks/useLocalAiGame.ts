import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import {
  AiStrengthId,
  AI_STRENGTH_PRESETS,
  buildLatticeDebugPayload,
  Coordinate,
  createAiForStrength,
  createMatchDebugLog,
  formatMoveLogLine,
  formatSystemLogLine,
  GameState,
  getTeiDisplay,
  LatticeDebugExport,
  PlayerColor,
  shouldRecordLocalAiTei,
  SubspaceLatticeEngine,
  TEI_AI_ANCHORS,
} from '@subspace-lattice/core';
import { createSubspaceLatticeApiClient } from '../services/api';

const AI_THINK_MS = 50;

function teiForStrength(strength: AiStrengthId) {
  const anchor =
    strength === 'strong'
      ? TEI_AI_ANCHORS.commander
      : strength === 'normal'
        ? TEI_AI_ANCHORS.lieutenant
        : TEI_AI_ANCHORS.ensign;
  const tei = getTeiDisplay(anchor);
  return { grade: tei.grade, score: tei.score };
}

function seatLabel(color: PlayerColor): 'White' | 'Black' {
  return color === PlayerColor.White ? 'White' : 'Black';
}

/**
 * Offline human vs AI. Human may sit White or Black; AI takes the other seat.
 * Strength maps to MCTS simulation budget.
 * Uses soft-shipped hybrid-fleet rules (Initiative Relay + sector clock).
 */
export function useLocalAiGame() {
  const [engine, setEngine] = useState<SubspaceLatticeEngine | null>(null);
  const [active, setActive] = useState(false);
  const [strength, setStrength] = useState<AiStrengthId>('normal');
  const [localPlayerColor, setLocalPlayerColor] = useState<PlayerColor>(
    PlayerColor.White,
  );
  const [logLines, setLogLines] = useState<string[]>([]);
  const [matchId, setMatchId] = useState<string | null>(null);
  const ratedMatch = useRef<string | null>(null);
  const assistedMatch = useRef(false);
  const debugLog = useRef(createMatchDebugLog());
  const initialStateRef = useRef<GameState | null>(null);
  const ai = useMemo(() => createAiForStrength(strength), [strength]);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const api = useMemo(() => createSubspaceLatticeApiClient(), []);

  const aiColor =
    localPlayerColor === PlayerColor.White
      ? PlayerColor.Black
      : PlayerColor.White;

  const markAssisted = useCallback(() => {
    assistedMatch.current = true;
  }, []);

  const appendLog = useCallback((line: string) => {
    setLogLines((prev) => [...prev, line]);
  }, []);

  const clearAiTimer = () => {
    if (aiTimer.current) {
      clearTimeout(aiTimer.current);
      aiTimer.current = null;
    }
  };

  const reportResult = useCallback(
    async (humanWon: boolean, currentStrength: AiStrengthId, id: string) => {
      if (ratedMatch.current === id) return;
      ratedMatch.current = id;
      const user = getAuth().currentUser;
      if (!user) {
        appendLog(
          formatSystemLogLine(
            'Sign in to record this result on the TEI leaderboard.',
          ),
        );
        return;
      }
      try {
        const result = await api.reportLocalAiMatch({
          eventId: id,
          strength: currentStrength,
          humanWon,
        });
        if (result.tei) {
          appendLog(
            formatSystemLogLine(
              result.duplicate
                ? `TEI already recorded (${result.tei}).`
                : `Rated vs AI — your TEI is now ${result.tei}.`,
            ),
          );
        }
      } catch {
        appendLog(
          formatSystemLogLine(
            'Could not submit rating (offline or not signed in).',
          ),
        );
      }
    },
    [api, appendLog],
  );

  const startLocalAiGame = useCallback(
    (nextStrength?: AiStrengthId, seat: PlayerColor = PlayerColor.White) => {
      clearAiTimer();
      const s = nextStrength ?? strength;
      if (nextStrength) setStrength(s);
      setLocalPlayerColor(seat);
      const next = new SubspaceLatticeEngine({ rulesVersion: 'hybrid-fleet' });
      initialStateRef.current = structuredClone(next.getState());
      debugLog.current.clear();
      setEngine(next);
      setActive(true);
      const id = `local-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setMatchId(id);
      ratedMatch.current = null;
      assistedMatch.current = false;
      const tei = teiForStrength(s);
      setLogLines([
        formatSystemLogLine(
          `Local fleet match (Initiative Relay) — you are ${seatLabel(seat)}; AI strength ${s} (${tei.grade}${String(tei.score).padStart(2, '0')})`,
        ),
      ]);
    },
    [strength],
  );

  const exitLocalAiGame = useCallback(() => {
    clearAiTimer();
    setEngine(null);
    setActive(false);
    setLogLines([]);
    setMatchId(null);
    debugLog.current.clear();
    initialStateRef.current = null;
  }, []);

  const refresh = (next: SubspaceLatticeEngine) => {
    setEngine(SubspaceLatticeEngine.fromState(next.getState()));
  };

  const noteWinner = useCallback(
    (
      winner: PlayerColor,
      reason: string | undefined,
      currentStrength: AiStrengthId,
      id: string | null,
      humanColor: PlayerColor,
    ) => {
      appendLog(
        formatSystemLogLine(
          `Winner: ${winner}${reason ? ` (${reason})` : ''}`,
        ),
      );
      if (id) {
        if (!shouldRecordLocalAiTei(assistedMatch.current)) {
          appendLog(
            formatSystemLogLine(
              'Assisted match (advisor used) — TEI not recorded.',
            ),
          );
          return;
        }
        void reportResult(winner === humanColor, currentStrength, id);
      }
    },
    [appendLog, reportResult],
  );

  const playAiMove = useCallback(
    (current: SubspaceLatticeEngine) => {
      const state = current.getState();
      if (state.winner || state.currentPlayer !== aiColor) return;

      const choice = ai.chooseMove(current);
      if (!choice) return;
      const piece = current.getPiece(choice.pieceId);
      const from = piece ? { ...piece.position } : undefined;
      const target = current.getPieceAt(choice.to);
      const ok = current.movePiece(choice.pieceId, choice.to);
      debugLog.current.append({
        player: aiColor,
        pieceId: choice.pieceId,
        from,
        to: { ...choice.to },
        captured: target?.id,
        source: 'ai',
        ok,
      });
      if (ok) {
        const tei = teiForStrength(strength);
        appendLog(
          formatMoveLogLine({
            player: seatLabel(aiColor),
            pieceId: choice.pieceId,
            to: choice.to,
            tei,
            captured: target?.id,
          }),
        );
        const after = current.getState();
        if (after.winner) {
          noteWinner(
            after.winner,
            after.winnerReason,
            strength,
            matchId,
            localPlayerColor,
          );
        }
        refresh(current);
      }
    },
    [ai, aiColor, appendLog, localPlayerColor, matchId, noteWinner, strength],
  );

  useEffect(() => {
    if (!active || !engine) return;
    const state = engine.getState();
    if (state.winner || state.currentPlayer !== aiColor) return;

    clearAiTimer();
    aiTimer.current = setTimeout(() => {
      playAiMove(engine);
    }, AI_THINK_MS);

    return clearAiTimer;
  }, [active, aiColor, engine, playAiMove]);

  const sendMove = useCallback(
    (pieceId: string, to: Coordinate) => {
      if (!engine) return;
      const state = engine.getState();
      if (state.winner || state.currentPlayer !== localPlayerColor) return;
      const piece = engine.getPiece(pieceId);
      const from = piece ? { ...piece.position } : undefined;
      const target = engine.getPieceAt(to);
      const ok = engine.movePiece(pieceId, to);
      debugLog.current.append({
        player: localPlayerColor,
        pieceId,
        from,
        to: { ...to },
        captured: target?.id,
        source: 'human',
        ok,
      });
      if (ok) {
        appendLog(
          formatMoveLogLine({
            player: seatLabel(localPlayerColor),
            pieceId,
            to,
            captured: target?.id,
          }),
        );
        const after = engine.getState();
        if (after.winner) {
          noteWinner(
            after.winner,
            after.winnerReason,
            strength,
            matchId,
            localPlayerColor,
          );
        }
        refresh(engine);
      }
    },
    [engine, appendLog, localPlayerColor, matchId, noteWinner, strength],
  );

  const buildDebugExport = useCallback((): LatticeDebugExport | null => {
    if (!engine) return null;
    return buildLatticeDebugPayload(
      {
        mode: 'local-ai',
        sectorCode: matchId ?? 'local-ai',
        viewerId: getAuth().currentUser?.uid,
        notes: [
          'Local AI match — full gameState included.',
          assistedMatch.current
            ? 'Advisor was used (assisted / unrated).'
            : 'No advisor assistance recorded.',
        ],
      },
      {
        gameState: structuredClone(engine.getState()),
        initialState: initialStateRef.current
          ? structuredClone(initialStateRef.current)
          : undefined,
        moveLog: debugLog.current.snapshot(),
        displayLog: [...logLines],
        localAi: {
          strength,
          localPlayerColor,
          matchId,
          assisted: assistedMatch.current,
        },
      },
    );
  }, [engine, logLines, localPlayerColor, matchId, strength]);

  const strengthLabel =
    AI_STRENGTH_PRESETS.find((p) => p.id === strength)?.label ?? strength;

  return {
    active,
    engine,
    strength,
    strengthLabel,
    setStrength,
    logLines,
    localPlayerColor,
    startLocalAiGame,
    exitLocalAiGame,
    sendMove,
    markAssisted,
    buildDebugExport,
  };
}
