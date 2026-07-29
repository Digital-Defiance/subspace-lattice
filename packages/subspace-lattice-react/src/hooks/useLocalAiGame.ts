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
  formatMoveLogLine,
  formatSystemLogLine,
  GameState,
  getTeiDisplay,
  HeuristicAi,
  applyAgentMove,
  isEmpAgentMove,
  isDefaultFleetLobby,
  LatticeDebugExport,
  PlayerColor,
  heavyWingPresetFromRules,
  resolveFleetLobbyRules,
  shouldRecordLocalAiTei,
  SubspaceLatticeEngine,
  TEI_AI_ANCHORS,
} from '@subspace-lattice/core';
import { createSubspaceLatticeApiClient } from '../services/api';
import type { LobbyRulesOptions } from '../lib/lobby-rules';

const AI_THINK_MS = 50;
/** Above this branching factor, sync MCTS freezes the tab — use heuristic. */
const WIDE_BRANCH_HEURISTIC = 64;

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
  const [matchId, setMatchId] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const ratedMatch = useRef<string | null>(null);
  const assistedMatch = useRef(false);
  const customModulesMatch = useRef(false);
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
      setEngine(next);
      setActive(true);
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
    debugLog.current.clear();
    initialStateRef.current = null;
  }, []);

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
          `Winner: ${winner}${reason ? ` (${reason})` : ''}`,
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
    (current: SubspaceLatticeEngine) => {
      const state = current.getState();
      if (state.winner || state.currentPlayer !== aiColor) {
        setAiThinking(false);
        return;
      }

      let choice: AgentMove | null = null;
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
        // Opening infiltrator warps (and fleet heavies) explode the tree;
        // sync MCTS on the UI thread freezes the tab for tens of seconds.
        if (legalCount > WIDE_BRANCH_HEURISTIC) {
          choice = new HeuristicAi().chooseMove(current);
        } else {
          choice = ai.chooseMove(current);
        }
        if (!choice) {
          choice = new HeuristicAi().chooseMove(current);
        }
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
        const ok = applyAgentMove(current, choice);
        debugLog.current.append({
          player: aiColor,
          pieceId: 'emp',
          from: undefined,
          to: { x: -1, y: -1 },
          source: 'ai',
          ok,
        });
        if (ok) {
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
      const ok = applyAgentMove(current, choice);
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
      } else {
        appendLog(
          formatSystemLogLine(
            `AI chose an illegal move (${choice.pieceId} → ${choice.to.x},${choice.to.y}).`,
          ),
        );
      }
      setAiThinking(false);
    },
    [ai, aiColor, appendLog, localPlayerColor, matchId, noteWinner, strength],
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
      playAiMove(engine);
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
      return ok;
    },
    [engine, appendLog, localPlayerColor, matchId, noteWinner, strength],
  );

  const fireEmp = useCallback((): boolean => {
    if (!engine) return false;
    const state = engine.getState();
    if (state.winner || state.currentPlayer !== localPlayerColor) return false;
    const ok = engine.fireEmp();
    debugLog.current.append({
      player: localPlayerColor,
      pieceId: 'emp',
      from: undefined,
      to: { x: -1, y: -1 },
      source: 'human',
      ok,
    });
    if (ok) {
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
  }, [engine, appendLog, localPlayerColor, matchId, noteWinner, strength]);

  const resign = useCallback((): boolean => {
    if (!engine) return false;
    const state = engine.getState();
    if (state.winner) return false;
    const ok = engine.resign(localPlayerColor);
    if (!ok) return false;
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
