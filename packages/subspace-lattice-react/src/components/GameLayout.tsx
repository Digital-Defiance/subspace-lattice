import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  AI_STRENGTH_PRESETS,
  AiStrengthId,
  advisorRequiresUnrateConsent,
  isAdvisorAvailable,
  isRoomRated,
  PlayerColor,
  shouldRecordOnlineTei,
} from '@subspace-lattice/core';
import { useAuth } from '../firebase/useAuth';
import { useFederationProfile } from '../firebase/useFederationProfile';
import {
  coachIndicatorForSeat,
  signalCoachRequest,
  subscribeCoachPresence,
  type CoachPresence,
} from '../firebase/coach-presence';
import { useAdvisor } from '../hooks/useAdvisor';
import { useGameSync } from '../hooks/useGameSync';
import { useLocalAiGame } from '../hooks/useLocalAiGame';
import { usePassAndPlayGame } from '../hooks/usePassAndPlayGame';
import { AdvisorPanel } from './AdvisorPanel';
import { Board } from './Board';
import { Chat } from './Chat';
import { FloatingCoachChip } from './FloatingCoachChip';
import { GameLog } from './GameLog';
import { Lobby } from './Lobby';
import { ObjectiveHud } from './ObjectiveHud';
import { PassAndPlaySetup } from './PassAndPlaySetup';
import { RulesDialog } from './RulesDialog';
import './GameLayout.scss';
import { SubspaceLatticeLogo } from './SubspaceLatticeLogo';

export interface GameLayoutProps {
  /** URL prefix for room deep links (default `/game`). */
  basePath?: string;
}

export const GameLayout: React.FC<GameLayoutProps> = ({
  basePath = '/game',
}) => {
  const { user, loading, uid, signInAnonymous, signInWithGoogle, signInWithApple, logOut, authError, authBusy, clearAuthError, appleSignInAvailable } =
    useAuth();
  const { callSign, profileUrl, profileUrlFallback } = useFederationProfile();
  const federationProfileHref = profileUrl || profileUrlFallback;
  const localPlayerId = uid || '';
  const [showRules, setShowRules] = useState(false);
  const [aiStrength, setAiStrength] = useState<AiStrengthId>('normal');
  const [preferredSeat, setPreferredSeat] = useState<PlayerColor>(
    PlayerColor.White,
  );
  const { roomCode: routeRoomCode } = useParams<{ roomCode?: string }>();
  const [searchParams] = useSearchParams();
  const preferWatch = searchParams.get('watch') === '1';
  const navigate = useNavigate();
  const normalizedBase = basePath.replace(/\/$/, '');

  const {
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
  } = useGameSync(localPlayerId);

  const {
    active: localAiActive,
    engine: localEngine,
    localPlayerColor: localAiColor,
    strengthLabel,
    logLines,
    startLocalAiGame,
    exitLocalAiGame,
    sendMove: sendLocalMove,
    markAssisted: markLocalAiAssisted,
  } = useLocalAiGame();

  const localAdvisor = useAdvisor(aiStrength);
  const onlineAdvisor = useAdvisor('normal');
  const [coachPresence, setCoachPresence] = useState<
    Record<string, CoachPresence>
  >({});
  const [pendingOnlineTeaching, setPendingOnlineTeaching] = useState(false);
  const reportedOnlineTeiRef = useRef<string | null>(null);
  const leavingOnlineRef = useRef(false);

  const {
    active: passPlayActive,
    setupOpen: passPlaySetupOpen,
    engine: passPlayEngine,
    logLines: passPlayLog,
    handoffPending,
    handoffSeat,
    labelFor: passPlayLabel,
    confirmHandoff,
    openPassAndPlaySetup,
    confirmPassAndPlaySetup,
    exitPassAndPlayGame,
    sendMove: sendPassPlayMove,
  } = usePassAndPlayGame();

  const offlineActive = localAiActive || passPlayActive || passPlaySetupOpen;

  useEffect(() => {
    if (leavingOnlineRef.current) {
      if (!routeRoomCode) {
        leavingOnlineRef.current = false;
      }
      return;
    }
    if (
      !offlineActive &&
      routeRoomCode &&
      activeRoom?.roomCode !== routeRoomCode &&
      localPlayerId
    ) {
      void hydrateFromRoomCode(routeRoomCode);
    }
  }, [
    routeRoomCode,
    activeRoom?.roomCode,
    hydrateFromRoomCode,
    localPlayerId,
    offlineActive,
  ]);

  // Deep link /game/CODE?watch=1 → join gallery once signed in
  const watchJoinAttempted = useRef<string | null>(null);
  useEffect(() => {
    if (
      offlineActive ||
      !preferWatch ||
      !routeRoomCode ||
      !localPlayerId ||
      !user
    ) {
      return;
    }
    const already =
      activeRoom?.observerIds?.includes(localPlayerId) ||
      activeRoom?.whitePlayerId === localPlayerId ||
      activeRoom?.blackPlayerId === localPlayerId;
    if (already && engine) return;
    if (watchJoinAttempted.current === routeRoomCode) return;
    watchJoinAttempted.current = routeRoomCode;
    void joinRoom(routeRoomCode, undefined, true);
  }, [
    preferWatch,
    routeRoomCode,
    localPlayerId,
    user,
    offlineActive,
    activeRoom?.observerIds,
    activeRoom?.whitePlayerId,
    activeRoom?.blackPlayerId,
    engine,
    joinRoom,
  ]);

  useEffect(() => {
    if (offlineActive) return;
    if (activeRoom?.roomCode && activeRoom.roomCode !== routeRoomCode) {
      navigate(`${normalizedBase}/${activeRoom.roomCode}`, { replace: false });
    }
  }, [
    activeRoom?.roomCode,
    routeRoomCode,
    navigate,
    normalizedBase,
    offlineActive,
  ]);

  useEffect(() => {
    if (!localAiActive || !localEngine) return;
    localAdvisor.refreshIfTeaching(localEngine);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh on turn/state only
  }, [localAiActive, localEngine]);

  useEffect(() => {
    if (!engine || offlineActive) return;
    onlineAdvisor.refreshIfTeaching(engine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, offlineActive]);

  useEffect(() => {
    if (offlineActive || !activeRoom?.id || !localPlayerId) {
      setCoachPresence({});
      return;
    }
    return subscribeCoachPresence(activeRoom.id, setCoachPresence);
  }, [activeRoom?.id, localPlayerId, offlineActive]);

  useEffect(() => {
    if (activeRoom?.assisted) {
      onlineAdvisor.setAssisted(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync room flag only
  }, [activeRoom?.assisted]);

  useEffect(() => {
    if (!activeRoom || !isRoomRated(activeRoom)) return;
    onlineAdvisor.clearSuggestion();
    if (onlineAdvisor.teachingMode) {
      onlineAdvisor.disableTeaching();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoom?.rated, activeRoom?.assisted]);

  // Rated online finish → report TEI once (either seated player may call).
  useEffect(() => {
    if (offlineActive || !activeRoom?.id || !engine || !localPlayerId) return;
    const winner = engine.getState().winner;
    if (!winner) return;
    if (!shouldRecordOnlineTei(activeRoom)) return;
    const seated =
      activeRoom.whitePlayerId === localPlayerId ||
      activeRoom.blackPlayerId === localPlayerId;
    if (!seated) return;
    if (reportedOnlineTeiRef.current === activeRoom.id) return;
    const roomId = activeRoom.id;
    reportedOnlineTeiRef.current = roomId;
    void reportOnlineMatch(roomId).then((result) => {
      if (!result) {
        // Allow a later retry if the callable failed hard.
        if (reportedOnlineTeiRef.current === roomId) {
          reportedOnlineTeiRef.current = null;
        }
      }
    });
  }, [activeRoom, engine, localPlayerId, offlineActive, reportOnlineMatch]);

  const opponentCoachFlash = useMemo(() => {
    if (!activeRoom) return [];
    const now = Date.now();
    const seats = [
      activeRoom.whitePlayerId,
      activeRoom.blackPlayerId,
    ].filter(Boolean) as string[];
    return seats
      .filter((id) => id !== localPlayerId)
      .map((id) => {
        const ind = coachIndicatorForSeat(coachPresence[id], now);
        if (!ind.flash && !ind.usedThisMatch) return null;
        const seat =
          id === activeRoom.whitePlayerId
            ? PlayerColor.White
            : PlayerColor.Black;
        return { id, seat, ...ind };
      })
      .filter(Boolean) as Array<{
      id: string;
      seat: PlayerColor;
      flash: boolean;
      usedThisMatch: boolean;
    }>;
  }, [activeRoom, coachPresence, localPlayerId]);

  const galleryOpen = activeRoom == null || activeRoom.allowObservers !== false;

  const handleCreateRoom = async (
    name: string,
    password?: string,
    options?: {
      allowObservers?: boolean;
      rated?: boolean;
      preferredColor?: 'WHITE' | 'BLACK';
      displayName?: string;
    },
  ) => {
    const displayName =
      options?.displayName?.trim() || callSign.trim() || undefined;
    await createAndJoinRoom(name, password, { ...options, displayName });
  };

  const handleJoinRoom = async (
    roomCode: string,
    password?: string,
    asObserver?: boolean,
    displayName?: string,
  ) => {
    const name = displayName?.trim() || callSign.trim() || undefined;
    await joinRoom(roomCode, password, asObserver, name);
  };

  const beginLocalAi = () => {
    exitPassAndPlayGame();
    localAdvisor.clearSuggestion();
    startLocalAiGame(aiStrength, preferredSeat);
  };

  const beginPassAndPlay = () => {
    exitLocalAiGame();
    openPassAndPlaySetup(preferredSeat);
  };

  const confirmLeaveOnlineMatch = async () => {
    const seated =
      !!activeRoom &&
      (activeRoom.whitePlayerId === localPlayerId ||
        activeRoom.blackPlayerId === localPlayerId);
    const hasOpponent =
      !!activeRoom?.whitePlayerId && !!activeRoom?.blackPlayerId;
    const inProgress = !!engine && !engine.getState().winner;
    const shouldResign = seated && hasOpponent && inProgress;

    const message = shouldResign
      ? 'Resign and leave? Your opponent wins this match.'
      : seated
        ? 'Leave this match and return to the lobby?'
        : 'Leave the spectator gallery and return to the lobby?';
    if (!window.confirm(message)) return;

    const roomId = activeRoom?.id;
    if (shouldResign && roomId) {
      try {
        await resignMatch(roomId);
        if (activeRoom && isRoomRated(activeRoom)) {
          void reportOnlineMatch(roomId);
        }
      } catch {
        alert('Could not resign this match. Try again.');
        return;
      }
    }

    leavingOnlineRef.current = true;
    onlineAdvisor.clearSuggestion();
    setCoachPresence({});
    leaveRoom();
    navigate('/play');
  };

  const askLocalAdvisor = () => {
    if (localAdvisor.assisted) {
      localAdvisor.askAdvisor(localEngine);
      markLocalAiAssisted();
      return;
    }
    localAdvisor.askAdvisor(localEngine, { requireConsent: true });
  };

  const confirmLocalAdvisorConsent = () => {
    localAdvisor.confirmConsent(localEngine);
    markLocalAiAssisted();
  };

  const signalOnlineCoach = async () => {
    if (!activeRoom?.id || !localPlayerId) return;
    try {
      await signalCoachRequest(
        activeRoom.id,
        localPlayerId,
        engine?.getState().plyCount,
      );
    } catch (err) {
      console.error('Coach presence signal failed:', err);
    }
  };

  const markOnlineAssisted = async () => {
    if (!activeRoom?.id) return;
    onlineAdvisor.setAssisted(true);
    await markRoomAssisted(activeRoom.id);
  };

  const askOnlineAdvisor = () => {
    if (!engine || !activeRoom) return;
    if (!isAdvisorAvailable(activeRoom) && !onlineAdvisor.assisted) {
      return;
    }
    const needsConsent = advisorRequiresUnrateConsent(
      activeRoom,
      onlineAdvisor.assisted,
    );
    if (needsConsent) {
      onlineAdvisor.askAdvisor(engine, { requireConsent: true });
      return;
    }
    onlineAdvisor.askAdvisor(engine);
    void signalOnlineCoach();
    if (activeRoom.rated && !activeRoom.assisted) {
      void markOnlineAssisted();
    }
  };

  const confirmOnlineAdvisorConsent = () => {
    const wantTeaching = pendingOnlineTeaching;
    setPendingOnlineTeaching(false);
    onlineAdvisor.confirmConsent(engine);
    void markOnlineAssisted();
    void signalOnlineCoach();
    if (wantTeaching && engine) {
      onlineAdvisor.enableTeaching(engine);
    }
  };

  const toggleOnlineTeaching = () => {
    if (!engine || !activeRoom) return;
    if (onlineAdvisor.teachingMode) {
      onlineAdvisor.disableTeaching();
      return;
    }
    if (!isAdvisorAvailable(activeRoom) && !onlineAdvisor.assisted) {
      return;
    }
    const needsConsent = advisorRequiresUnrateConsent(
      activeRoom,
      onlineAdvisor.assisted,
    );
    if (needsConsent) {
      setPendingOnlineTeaching(true);
      onlineAdvisor.askAdvisor(engine, { requireConsent: true });
      return;
    }
    onlineAdvisor.enableTeaching(engine);
    void signalOnlineCoach();
    if (activeRoom.rated && !activeRoom.assisted) {
      void markOnlineAssisted();
    }
  };

  const strengthPicker = (
    <label className="ai-strength-picker">
      AI strength{' '}
      <select
        value={aiStrength}
        onChange={(e) => setAiStrength(e.target.value as AiStrengthId)}
        data-testid="ai-strength"
      >
        {AI_STRENGTH_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
            {p.simulations > 0 ? ` (MCTS ${p.simulations})` : ' (heuristic)'}
          </option>
        ))}
      </select>
    </label>
  );

  const seatPicker = (
    <label className="seat-picker">
      Your seat{' '}
      <select
        value={preferredSeat}
        onChange={(e) => setPreferredSeat(e.target.value as PlayerColor)}
        data-testid="preferred-seat"
      >
        <option value={PlayerColor.White}>White (moves first)</option>
        <option value={PlayerColor.Black}>Black</option>
      </select>
    </label>
  );

  const brandLogo = (
    <Link to="/" className="game-header-logo">
      <img
        src="/SubspaceLattice-text-title-pretty.svg"
        alt="Subspace Lattice"
      />
    </Link>
  );

  // --- Pass & play name setup ---
  if (passPlaySetupOpen) {
    return (
      <div className="pregame-shell" data-testid="pass-and-play-setup">
        <Link to="/">
          <SubspaceLatticeLogo
            className="pregame-logo"
            width={320}
            ariaLabel="Subspace Lattice — Command the Fleet. Control the Lattice."
          />
        </Link>
        <PassAndPlaySetup
          onConfirm={confirmPassAndPlaySetup}
          onCancel={exitPassAndPlayGame}
          preferredSeat={preferredSeat}
          defaultCallSign={callSign}
          federationProfileUrl={federationProfileHref}
        />
      </div>
    );
  }

  // --- Pass & play (no Firebase required) ---
  if (passPlayActive && passPlayEngine) {
    const state = passPlayEngine.getState();
    const seat =
      state.winner || handoffPending ? 'OBSERVER' : state.currentPlayer;
    const whiteLabel = passPlayLabel(PlayerColor.White);
    const blackLabel = passPlayLabel(PlayerColor.Black);
    const turnLabel = passPlayLabel(state.currentPlayer);
    const handoffLabel = handoffSeat ? passPlayLabel(handoffSeat) : '';
    return (
      <div className="game-layout" data-testid="pass-and-play-game">
        {brandLogo}
        {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
        {handoffPending && handoffSeat && (
          <div
            className="pass-handoff-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lattice-handoff-title"
            data-testid="pass-handoff-overlay"
          >
            <div className="pass-handoff-card">
              <p className="pass-handoff-eyebrow">Pass the lattice</p>
              <h3 id="lattice-handoff-title" className="pass-handoff-title">
                {handoffLabel} at helm
              </h3>
              <p className="pass-handoff-body">
                Hand the device to {handoffLabel}. The board stays covered until
                they confirm ready.
              </p>
              <button
                type="button"
                className="pass-handoff-ready"
                onClick={confirmHandoff}
                data-testid="pass-handoff-ready"
              >
                Ready at helm
              </button>
            </div>
          </div>
        )}
        <div className="game-info">
          <div className="game-header">
            <div className="game-header-brand">
              <div className="game-header-titles">
                <h2>Pass &amp; Play</h2>
              </div>
            </div>
            <div className="header-actions">
              <button className="rules-btn" onClick={() => setShowRules(true)}>
                View Rules
              </button>
              <button
                className="rules-btn"
                type="button"
                onClick={exitPassAndPlayGame}
                data-testid="exit-pass-and-play"
              >
                Exit
              </button>
            </div>
          </div>
          {!state.winner && !handoffPending && (
            <p className="pass-hand-off" data-testid="pass-hand-off">
              <strong>{turnLabel}</strong> at helm
            </p>
          )}
          <p className="game-meta">
            <span>
              Rules: <strong>{state.rulesVersion ?? 'classic'}</strong>
            </span>
            <span>
              Turn: <strong>{turnLabel}</strong>
            </span>
          </p>
          <ObjectiveHud engine={passPlayEngine} />
          {state.winner && (
            <p className="winner-announcement">
              <strong>
                WINNER: {passPlayLabel(state.winner)}
                {state.winnerReason ? ` (${state.winnerReason})` : ''}!
              </strong>
            </p>
          )}
        </div>
        <div className="game-main-panel">
          <Board
            gameState={state}
            onMovePiece={(pieceId, to) => sendPassPlayMove(pieceId, to)}
            onPlacePiece={() => undefined}
            localPlayer={seat}
          />
        </div>
        <div className="game-side-panel">
          <GameLog
            lines={passPlayLog}
            nameColors={[
              { name: whiteLabel, color: '#e2e8f0' },
              { name: blackLabel, color: '#94a3b8' },
            ]}
          />
          <p className="local-ai-hint">
            Fleet rules (Initiative Relay). Same device — no rating. After each
            move, pass the device and tap Ready at helm (Warp-style handoff).
          </p>
        </div>
      </div>
    );
  }

  // --- Local AI game (no Firebase required) ---
  if (localAiActive && localEngine) {
    const state = localEngine.getState();
    return (
      <div className="game-layout" data-testid="local-ai-game">
        {brandLogo}
        {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
        <div className="game-info">
          <div className="game-header">
            <div className="game-header-brand">
              <div className="game-header-titles">
                <h2>Local vs AI</h2>
              </div>
            </div>
            <div className="header-actions">
              <button className="rules-btn" onClick={() => setShowRules(true)}>
                View Rules
              </button>
              <button
                className="rules-btn"
                type="button"
                onClick={exitLocalAiGame}
                data-testid="exit-local-ai"
              >
                Exit
              </button>
            </div>
          </div>
          <p className="game-meta">
            <span>
              Role: <strong>{localAiColor}</strong> (AI{' '}
              {localAiColor === PlayerColor.White ? 'Black' : 'White'} —{' '}
              {strengthLabel})
            </span>
            <span>
              Rules: <strong>{state.rulesVersion ?? 'classic'}</strong>
            </span>
            <span>
              Turn: <strong>{state.currentPlayer}</strong>
            </span>
          </p>
          <ObjectiveHud engine={localEngine} />
          {state.winner && (
            <p className="winner-announcement">
              <strong>
                WINNER: {state.winner}
                {state.winnerReason ? ` (${state.winnerReason})` : ''}!
              </strong>
            </p>
          )}
        </div>
        <div className="game-main-panel">
          <Board
            gameState={state}
            onMovePiece={(pieceId, to) => {
              localAdvisor.clearSuggestion();
              sendLocalMove(pieceId, to);
            }}
            onPlacePiece={() => undefined}
            localPlayer={state.winner ? 'OBSERVER' : localAiColor}
            guidance={localAdvisor.guidance}
          />
          {localAdvisor.suggestion && (
            <FloatingCoachChip
              suggestion={localAdvisor.suggestion}
              teachingMode={localAdvisor.teachingMode}
              onDismiss={localAdvisor.clearSuggestion}
            />
          )}
        </div>
        <div className="game-side-panel">
          <GameLog
            lines={logLines}
            nameColors={[
              { name: 'White', color: '#e2e8f0' },
              { name: 'Black', color: '#94a3b8' },
            ]}
          />
          <AdvisorPanel
            suggestion={localAdvisor.suggestion}
            teachingMode={localAdvisor.teachingMode}
            assisted={localAdvisor.assisted}
            canAsk={
              !state.winner && state.currentPlayer === localAiColor
            }
            onAsk={askLocalAdvisor}
            onClear={localAdvisor.clearSuggestion}
            onToggleTeaching={() => {
              if (localAdvisor.teachingMode) {
                localAdvisor.disableTeaching();
              } else {
                markLocalAiAssisted();
                localAdvisor.enableTeaching(localEngine);
              }
            }}
            consentOpen={localAdvisor.consentOpen}
            onConfirmConsent={confirmLocalAdvisorConsent}
            onDeclineConsent={localAdvisor.declineConsent}
          />
          <p className="local-ai-hint">
            Fleet rules (Initiative Relay). MCTS budget = strength. Signed-in
            results update your TEI on the Federation standings (Fast P0 · Normal
            I10 · Strong I52) — unless the advisor is used (assisted / unrated).
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="pregame-shell">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="pregame-shell auth-gate">
        <SubspaceLatticeLogo
          width={400}
          ariaLabel="Subspace Lattice — Command the Fleet. Control the Lattice."
        />
        <p className="auth-gate-lead">
          Sign in to create or join a game — or practice offline.
        </p>
        <div className="auth-gate-panel">
          <div className="auth-gate-section">
            <p className="auth-gate-section-label">Practice</p>
            {seatPicker}
            {strengthPicker}
            <button
              type="button"
              className="auth-gate-btn auth-gate-btn-ghost"
              onClick={beginLocalAi}
              data-testid="play-vs-ai"
            >
              Play vs AI (local)
            </button>
            <button
              type="button"
              className="auth-gate-btn auth-gate-btn-ghost"
              onClick={beginPassAndPlay}
              data-testid="play-pass-and-play"
            >
              Pass &amp; Play
            </button>
          </div>
          <div className="auth-gate-divider" role="presentation" />
          <div className="auth-gate-section">
            <p className="auth-gate-section-label">Online</p>
            {authError ? (
              <div className="auth-gate-error" role="alert">
                <p>{authError}</p>
                <button
                  type="button"
                  className="auth-gate-btn auth-gate-btn-ghost"
                  onClick={clearAuthError}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="auth-gate-btn"
              disabled={authBusy}
              onClick={() => void signInAnonymous()}
            >
              Play anonymously
            </button>
            <button
              type="button"
              className="auth-gate-btn"
              disabled={authBusy}
              onClick={() => void signInWithGoogle()}
            >
              Sign in with Google
            </button>
            {appleSignInAvailable ? (
              <button
                type="button"
                className="auth-gate-btn"
                disabled={authBusy}
                onClick={() => void signInWithApple()}
              >
                Sign in with Apple
              </button>
            ) : (
              <p className="auth-gate-note">
                Sign in with Apple is available on macOS and iOS. On Windows,
                use Google or play anonymously.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!activeRoom || !engine) {
    const pendingRoomCode = activeRoom?.roomCode ?? routeRoomCode;
    return (
      <div className="pregame-shell">
        <Link to="/">
          <SubspaceLatticeLogo
            className="pregame-logo"
            width={400}
            ariaLabel="Subspace Lattice — Command the Fleet. Control the Lattice."
          />
        </Link>
        <div className="auth-bar">
          <span>
            {user.isAnonymous
              ? 'Anonymous'
              : callSign || user.email || user.uid}
          </span>
          {!user.isAnonymous && (
            <a
              href={federationProfileHref}
              target="_blank"
              rel="noreferrer"
              className="federation-profile-link"
            >
              Federation Profile
            </a>
          )}
          <button type="button" onClick={() => void logOut()}>
            Sign out
          </button>
        </div>
        <Lobby
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onPlayLocalAi={beginLocalAi}
          onPlayPassAndPlay={beginPassAndPlay}
          aiStrengthPicker={strengthPicker}
          preferredColor={preferredSeat}
          onPreferredColorChange={(color) =>
            setPreferredSeat(color as PlayerColor)
          }
          defaultCallSign={callSign}
          federationProfileUrl={federationProfileHref}
          initialRoomCode={pendingRoomCode}
          preferWatch={preferWatch}
        />
      </div>
    );
  }

  const isCreator =
    !!activeRoom.creatorId && activeRoom.creatorId === localPlayerId;
  const isSpectator =
    (activeRoom.observerIds ?? []).includes(localPlayerId) &&
    activeRoom.whitePlayerId !== localPlayerId &&
    activeRoom.blackPlayerId !== localPlayerId;
  const localPlayerColor = isSpectator
    ? 'OBSERVER'
    : activeRoom.whitePlayerId === localPlayerId
      ? PlayerColor.White
      : activeRoom.blackPlayerId === localPlayerId
        ? PlayerColor.Black
        : 'OBSERVER';
  const spectatorCount = activeRoom.observerIds.length;
  const myTurn =
    localPlayerColor !== 'OBSERVER' &&
    engine.getState().currentPlayer === localPlayerColor &&
    !engine.getState().winner;
  const watchUrl = `${window.location.origin}${normalizedBase}/${activeRoom.roomCode}?watch=1`;
  const advisorSuppressed =
    isRoomRated(activeRoom) && !onlineAdvisor.assisted;
  const sectorRatingLabel = activeRoom.assisted
    ? 'Assisted'
    : activeRoom.rated
      ? 'Rated'
      : 'Casual';

  return (
    <div
      className="game-layout"
      data-testid={isSpectator ? 'spectating-game' : 'online-game'}
    >
      {brandLogo}
      {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
      <div className="game-info">
        <div className="game-header">
          <div className="game-header-brand">
            <div className="game-header-titles">
              <h2>{activeRoom.name}</h2>
              <div className="room-code-share">
                <span>
                  Room Code: <strong>{activeRoom.roomCode}</strong>
                </span>
                <button
                  className="copy-code-btn"
                  title="Copy player join link"
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      `${window.location.origin}${normalizedBase}/${activeRoom.roomCode}`,
                    )
                  }
                >
                  Copy Link
                </button>
                {galleryOpen && (
                  <button
                    className="copy-code-btn"
                    title="Copy spectator watch link"
                    data-testid="copy-spectator-link"
                    onClick={() => void navigator.clipboard.writeText(watchUrl)}
                  >
                    Copy spectator link
                  </button>
                )}
                {isCreator && galleryOpen && (
                  <button
                    type="button"
                    className="copy-code-btn"
                    data-testid="toggle-spectators"
                    onClick={() => void setAllowObservers(activeRoom.id, false)}
                  >
                    Close spectator gallery
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="header-actions">
            <button className="rules-btn" onClick={() => setShowRules(true)}>
              View Rules
            </button>
            <button
              type="button"
              className="rules-btn"
              data-testid="exit-online-match"
              onClick={() => void confirmLeaveOnlineMatch()}
            >
              Exit
            </button>
          </div>
        </div>
        <p className="game-meta">
          <span>
            Role:{' '}
            <strong data-testid="player-role">
              {isSpectator ? 'Spectator' : localPlayerColor}
            </strong>
            {spectatorCount > 0 && (
              <span className="spectator-badge" data-testid="spectator-count">
                {' '}
                · {spectatorCount} watching
              </span>
            )}
          </span>
          <span>
            Sector:{' '}
            <strong data-testid="sector-rating">{sectorRatingLabel}</strong>
          </span>
          <span>
            Rules:{' '}
            <strong>
              {engine.getState().rulesVersion ??
                activeRoom.rulesVersion ??
                'classic'}
            </strong>
          </span>
          <span>
            White:{' '}
            <strong>
              {activeRoom.whiteDisplayName?.trim() || 'White'}
            </strong>
          </span>
          <span>
            Black:{' '}
            <strong>
              {activeRoom.blackDisplayName?.trim() || 'Black'}
            </strong>
          </span>
          <span>
            Turn: <strong>{engine.getState().currentPlayer}</strong>
          </span>
        </p>
        {opponentCoachFlash.length > 0 && (
          <p
            className="coach-presence-banner"
            data-testid="coach-presence-banner"
            role="status"
          >
            {opponentCoachFlash.map((c) =>
              c.flash
                ? `${c.seat} engaged the tactical advisor`
                : `${c.seat} used advisor this match`,
            ).join(' · ')}
          </p>
        )}
        <ObjectiveHud engine={engine} />
        {engine.getState().winner && (
          <p className="winner-announcement">
            <strong>
              WINNER: {engine.getState().winner}
              {engine.getState().winnerReason
                ? ` (${engine.getState().winnerReason})`
                : ''}
              !
            </strong>
          </p>
        )}
      </div>
      <div className="game-main-panel">
        <Board
          gameState={engine.getState()}
          onMovePiece={(pieceId, to) => {
            onlineAdvisor.clearSuggestion();
            sendMove(activeRoom.id, pieceId, to);
          }}
          onPlacePiece={(type, to) => sendPlacement(activeRoom.id, type, to)}
          localPlayer={localPlayerColor}
          guidance={
            localPlayerColor !== 'OBSERVER' && !advisorSuppressed
              ? onlineAdvisor.guidance
              : undefined
          }
        />
        {localPlayerColor !== 'OBSERVER' &&
          onlineAdvisor.suggestion &&
          !advisorSuppressed && (
            <FloatingCoachChip
              suggestion={onlineAdvisor.suggestion}
              teachingMode={onlineAdvisor.teachingMode}
              onDismiss={onlineAdvisor.clearSuggestion}
            />
          )}
      </div>
      <div className="game-side-panel">
        <Chat
          messages={activeRoom.chatMessages}
          onSendMessage={(text) => sendChatMessage(activeRoom.id, text)}
          readOnly={isSpectator}
        />
        {localPlayerColor !== 'OBSERVER' && (
          <AdvisorPanel
            suggestion={onlineAdvisor.suggestion}
            teachingMode={onlineAdvisor.teachingMode}
            assisted={onlineAdvisor.assisted || activeRoom.assisted === true}
            canAsk={myTurn && !advisorSuppressed}
            suppressed={advisorSuppressed}
            onAsk={askOnlineAdvisor}
            onClear={onlineAdvisor.clearSuggestion}
            onToggleTeaching={toggleOnlineTeaching}
            onMakeCasual={() => void markOnlineAssisted()}
            consentOpen={onlineAdvisor.consentOpen}
            onConfirmConsent={confirmOnlineAdvisorConsent}
            onDeclineConsent={() => {
              setPendingOnlineTeaching(false);
              onlineAdvisor.declineConsent();
            }}
          />
        )}
      </div>
    </div>
  );
};
