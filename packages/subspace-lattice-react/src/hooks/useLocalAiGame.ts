import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import {
  AgentMove,
  AiStrengthId,
  AI_STRENGTH_PRESETS,
  buildLatticeDebugPayload,
  Coordinate,
  createAiForStrength,
  createMatchDebugLog,
  describeWinnerReason,
  formatMoveLogLine,
  formatSystemLogLine,
  GameState,
  getTeiDisplay,
  HeuristicAi,
  applyAgentMove,
  isEmpAgentMove,
  isHeavyAiStrength,
  isDefaultFleetLobby,
  LatticeDebugExport,
  matchDebugEntryFromMoveInfo,
  MatchDebugMoveEntry,
  MctsAi,
  PieceType,
  PlayerColor,
  heavyWingPresetFromRules,
  resolveFleetLobbyRules,
  shouldRecordLocalAiTei,
  SubspaceLatticeEngine,
  TEI_AI_ANCHORS,
} from '@subspace-lattice/core';
import { createSubspaceLatticeApiClient } from '../services/api';
import type { LobbyRulesOptions } from '../lib/lobby-rules';
import { playGameSound, playLatticeSoundsAfterPly } from '../lib/game-sounds';
import { useAiResignOnForcedLoss } from './useAiResignOnForcedLoss';

const AI_THINK_MS = 50;

function teiForStrength(strength: AiStrengthId) {
  const anchor =
    strength === 'deep'
      ? TEI_AI_ANCHORS.admiral
      : strength === 'strong'
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
 * Uses shipping hybrid-fleet rules (Initiative Relay + sector clock).
 */
export function useLocalAiGame() {
  const [engine, setEngine] = useState<SubspaceLatticeEngine | null>(null);
  const [active, setActive] = useState(false);
  const [strength, setStrength] = useState<AiStrengthId>('normal');
  const [localPlayerColor, setLocalPlayerColor] = useState<PlayerColor>(
    PlayerColor.White,
  );
  const [logLines, setLogLines] = useState<string[]>([]);
  const [moveLog, setMoveLog] = useState<readonly MatchDebugMoveEntry[]>([]);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiResignOnForcedLoss] = useAiResignOnForcedLoss();
  const ratedMatch = useRef<string | null>(null);
  const assistedMatch = useRef(false);
  const customModulesMatch = useRef(false);
  const debugLog = useRef(createMatchDebugLog());
  const initialStateRef = useRef<GameState | null>(null);
  const ai = useMemo(
    () =>
      createAiForStrength(strength, Math.random, {
        // Interactive Deep Lattice: cap wall-clock so the board stays responsive.
        timeBudgetMs: strength === 'deep' ? 4_000 : undefined,
      }),
    [strength],
  );
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
    (
      nextStrength?: AiStrengthId,
      seat: PlayerColor = PlayerColor.White,
      rulesOverrides?: LobbyRulesOptions,
    ) => {
      clearAiTimer();
      const s = nextStrength ?? strength;
      if (nextStrength) setStrength(s);
      setLocalPlayerColor(seat);
      const rules = resolveFleetLobbyRules(rulesOverrides);
      const customModules = !isDefaultFleetLobby(rulesOverrides);
      customModulesMatch.current = customModules;
      const next = new SubspaceLatticeEngine({ rules });
      initialStateRef.current = structuredClone(next.getState());
      debugLog.current.clear();
      setMoveLog([]);
      setEngine(next);
      setActive(true);
      playGameSound('game-start');
      setAiThinking(false);
      const id = `local-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setMatchId(id);
      ratedMatch.current = null;
      assistedMatch.current = false;
      const tei = teiForStrength(s);
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
        ? `; modules ${moduleBits.join(' ')}`
        : '';
      setLogLines([
        formatSystemLogLine(
          `Local fleet match (Initiative Relay${modulesNote}) — you are ${seatLabel(seat)}; AI strength ${s} (${tei.grade}${String(tei.score).padStart(2, '0')})${
            customModules ? ' — casual (custom modules)' : ''
          }`,
        ),
      ]);
    },
    [strength],
  );

  const exitLocalAiGame = useCallback(() => {
    clearAiTimer();
    setEngine(null);
    setActive(false);
    setAiThinking(false);
    setLogLines([]);
    setMatchId(null);
    clearMoveLog();
    initialStateRef.current = null;
  }, [clearMoveLog]);

  const refresh = (next: SubspaceLatticeEngine) => {
    setEngine(SubspaceLatticeEngine.fromState(next.getState(), next.getRules()));
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
          `Winner: ${winner}${reason ? ` — ${describeWinnerReason(reason)}` : ''}`,
        ),
      );
      if (id) {
        if (customModulesMatch.current) {
          appendLog(
            formatSystemLogLine(
              'Custom modules match — TEI not recorded (stock fleet only).',
            ),
          );
          return;
        }
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
    async (current: SubspaceLatticeEngine) => {
      const state = current.getState();
      if (state.winner || state.currentPlayer !== aiColor) {
        setAiThinking(false);
        return;
      }

      let choice: AgentMove | null;
      try {
        const legalCount = current.listLegalMoves().length;
        if (legalCount === 0 && !current.canFireEmp()) {
          appendLog(
            formatSystemLogLine('AI has no legal moves — checking result.'),
          );
          setAiThinking(false);
          refresh(current);
          return;
        }
        // Heavy tiers yield during search so "AI thinking" stays painted.
        const searched =
          isHeavyAiStrength(strength) && ai instanceof MctsAi
            ? await ai.chooseMoveAsync(current)
            : ai.chooseMove(current);

        // Grandmaster resignation: confident forced loss → concede to human.
        if (
          aiResignOnForcedLoss &&
          ai instanceof MctsAi &&
          ai.isForcedLossResignation()
        ) {
          const before = structuredClone(current.getState());
          const ok = current.resign(aiColor, 'ai-resigned');
          if (ok) {
            playLatticeSoundsAfterPly(before, current);
            appendLog(
              formatSystemLogLine(
                `${seatLabel(aiColor)} resigns (forced loss).`,
              ),
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
            setAiThinking(false);
            return;
          }
        }

        choice = searched ?? new HeuristicAi().chooseMove(current);
      } catch (err) {
        appendLog(
          formatSystemLogLine(
            `AI search failed (${err instanceof Error ? err.message : 'error'}); trying fast reply.`,
          ),
        );
        try {
          choice = new HeuristicAi().chooseMove(current);
        } catch {
          choice = null;
        }
      }

      if (!choice) {
        appendLog(formatSystemLogLine('AI could not choose a move.'));
        setAiThinking(false);
        return;
      }

      if (isEmpAgentMove(choice)) {
        const hub = Object.values(current.getState().pieces).find(
          (p) => p.type === PieceType.CommandHub && p.owner === aiColor,
        );
        const before = structuredClone(current.getState());
        const ok = applyAgentMove(current, choice);
        recordMove(
          matchDebugEntryFromMoveInfo({
            player: aiColor,
            pieceId: 'emp',
            to: hub?.position ?? { x: -1, y: -1 },
            source: 'ai',
            ok,
            info: current.getLastMoveInfo(),
            empOrigin: hub?.position,
          }),
        );
        if (ok) {
          playLatticeSoundsAfterPly(before, current);
          appendLog(
            formatSystemLogLine(
              `${seatLabel(aiColor)} fires Command Overload (EMP).`,
            ),
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
        } else {
          appendLog(formatSystemLogLine('AI attempted an illegal EMP.'));
        }
        setAiThinking(false);
        return;
      }

      const piece = current.getPiece(choice.pieceId);
      const from = piece ? { ...piece.position } : undefined;
      const target = current.getPieceAt(choice.to);
      const before = structuredClone(current.getState());
      const ok = applyAgentMove(current, choice);
      recordMove(
        matchDebugEntryFromMoveInfo({
          player: aiColor,
          pieceId: choice.pieceId,
          from,
          to: { ...choice.to },
          capturedId: target?.id,
          capturedType: target?.type,
          source: 'ai',
          ok,
          info: current.getLastMoveInfo(),
        }),
      );
      if (ok) {
        playLatticeSoundsAfterPly(before, current);
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
      } else {
        appendLog(
          formatSystemLogLine(
            `AI chose an illegal move (${choice.pieceId} → ${choice.to.x},${choice.to.y}).`,
          ),
        );
      }
      setAiThinking(false);
    },
    [ai, aiColor, aiResignOnForcedLoss, appendLog, localPlayerColor, matchId, noteWinner, recordMove, strength],
  );

  useEffect(() => {
    if (!active || !engine) return;
    const state = engine.getState();
    if (state.winner || state.currentPlayer !== aiColor) {
      setAiThinking(false);
      return;
    }

    clearAiTimer();
    setAiThinking(true);
    // Yield so React can paint "AI thinking" before the (sync) search runs.
    aiTimer.current = setTimeout(() => {
      void playAiMove(engine);
    }, AI_THINK_MS);

    return clearAiTimer;
  }, [active, aiColor, engine, playAiMove]);

  const sendMove = useCallback(
    (pieceId: string, to: Coordinate): boolean => {
      if (!engine) return false;
      const state = engine.getState();
      if (state.winner || state.currentPlayer !== localPlayerColor) return false;
      const piece = engine.getPiece(pieceId);
      const from = piece ? { ...piece.position } : undefined;
      const target = engine.getPieceAt(to);
      const before = structuredClone(engine.getState());
      const ok = engine.movePiece(pieceId, to);
      recordMove(
        matchDebugEntryFromMoveInfo({
          player: localPlayerColor,
          pieceId,
          from,
          to: { ...to },
          capturedId: target?.id,
          capturedType: target?.type,
          source: 'human',
          ok,
          info: engine.getLastMoveInfo(),
        }),
      );
      if (ok) {
        playLatticeSoundsAfterPly(before, engine);
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
      return ok;
    },
    [engine, appendLog, localPlayerColor, matchId, noteWinner, recordMove, strength],
  );

  const fireEmp = useCallback((): boolean => {
    if (!engine) return false;
    const state = engine.getState();
    if (state.winner || state.currentPlayer !== localPlayerColor) return false;
    const hub = Object.values(state.pieces).find(
      (p) => p.type === PieceType.CommandHub && p.owner === localPlayerColor,
    );
    const before = structuredClone(engine.getState());
    const ok = engine.fireEmp();
    recordMove(
      matchDebugEntryFromMoveInfo({
        player: localPlayerColor,
        pieceId: 'emp',
        to: hub?.position ?? { x: -1, y: -1 },
        source: 'human',
        ok,
        info: engine.getLastMoveInfo(),
        empOrigin: hub?.position,
      }),
    );
    if (ok) {
      playLatticeSoundsAfterPly(before, engine);
      appendLog(
        formatSystemLogLine(
          `${seatLabel(localPlayerColor)} fires Command Overload (EMP).`,
        ),
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
    return ok;
  }, [engine, appendLog, localPlayerColor, matchId, noteWinner, recordMove, strength]);

  const resign = useCallback((): boolean => {
    if (!engine) return false;
    const state = engine.getState();
    if (state.winner) return false;
    const before = structuredClone(engine.getState());
    const ok = engine.resign(localPlayerColor);
    if (!ok) return false;
    playLatticeSoundsAfterPly(before, engine);
    appendLog(
      formatSystemLogLine(`${seatLabel(localPlayerColor)} resigns.`),
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
    return true;
  }, [engine, appendLog, localPlayerColor, matchId, noteWinner, strength]);

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
    moveLog,
    localPlayerColor,
    aiThinking,
    startLocalAiGame,
    exitLocalAiGame,
    sendMove,
    fireEmp,
    resign,
    appendLog,
    markAssisted,
    buildDebugExport,
  };
}
