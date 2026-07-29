import React, { useEffect, useState } from 'react';
import { PlayerColor } from '@subspace-lattice/core';
import {
  EMP_BLACKOUT_PLIES_MAX,
  type HeavyWingPreset,
} from '@subspace-lattice/core';
import {
  DEFAULT_LOBBY_RULES,
  lobbyRulesAreDefault,
  type LobbyRulesOptions,
} from '../lib/lobby-rules';
import './Lobby.scss';

type LobbyTab = 'create' | 'join' | 'local';

const HEAVY_WING_HINTS: Record<HeavyWingPreset, string> = {
  standard: 'Twin Lattice Dreadnoughts on files 2 & 8 (Rated default).',
  'refractor-wing': 'Beam + Refractor on files 3 & 7 (Unrated).',
  'fleet-draft':
    'Refractor + Hub-anchored Carrier on files 3 & 7 (Unrated).',
};

export type CreateRoomOptions = {
  allowObservers?: boolean;
  rated?: boolean;
  preferredColor?: 'WHITE' | 'BLACK';
  displayName?: string;
  rulesOverrides?: Partial<LobbyRulesOptions>;
};

interface LobbyProps {
  onCreateRoom: (
    name: string,
    password?: string,
    options?: CreateRoomOptions,
  ) => void;
  onJoinRoom: (
    roomCode: string,
    password?: string,
    asObserver?: boolean,
    displayName?: string,
  ) => void;
  onPlayLocalAi?: (rules?: LobbyRulesOptions) => void;
  onPlayPassAndPlay?: (rules?: LobbyRulesOptions) => void;
  aiStrengthPicker?: React.ReactNode;
  preferredColor?: 'WHITE' | 'BLACK';
  onPreferredColorChange?: (color: 'WHITE' | 'BLACK') => void;
  /** Federation Profile call sign — defaults the match name field. */
  defaultCallSign?: string;
  federationProfileUrl?: string;
  /** Pre-fill the join form and switch to the Join tab automatically. */
  initialRoomCode?: string;
  /** Prefer observer join (e.g. deep link ?watch=1). */
  preferWatch?: boolean;
}

export const Lobby: React.FC<LobbyProps> = ({
  onCreateRoom,
  onJoinRoom,
  onPlayLocalAi,
  onPlayPassAndPlay,
  aiStrengthPicker,
  preferredColor = 'WHITE',
  onPreferredColorChange,
  defaultCallSign = '',
  federationProfileUrl,
  initialRoomCode,
  preferWatch = false,
}) => {
  const hasLocal = Boolean(onPlayLocalAi || onPlayPassAndPlay);
  const [tab, setTab] = useState<LobbyTab>(() => {
    if (preferWatch || initialRoomCode) return 'join';
    return 'create';
  });
  const [roomName, setRoomName] = useState('');
  const [roomCode, setRoomCode] = useState(initialRoomCode ?? '');
  const [password, setPassword] = useState('');
  const [asObserver, setAsObserver] = useState(preferWatch);
  const [allowObservers, setAllowObservers] = useState(true);
  const [rated, setRated] = useState(false);
  const [callSign, setCallSign] = useState(defaultCallSign);
  const [infiltratorSpoolUp, setInfiltratorSpoolUp] = useState(
    DEFAULT_LOBBY_RULES.infiltratorSpoolUp,
  );
  const [infiltratorActivationPly, setInfiltratorActivationPly] = useState(
    DEFAULT_LOBBY_RULES.infiltratorActivationPly,
  );
  const [sectorActivationPly, setSectorActivationPly] = useState(
    DEFAULT_LOBBY_RULES.sectorActivationPly,
  );
  const [heavyWingPreset, setHeavyWingPreset] = useState<HeavyWingPreset>(
    DEFAULT_LOBBY_RULES.heavyWingPreset,
  );
  const [empRadius, setEmpRadius] = useState(DEFAULT_LOBBY_RULES.empRadius);
  const [empChargeTarget, setEmpChargeTarget] = useState(
    DEFAULT_LOBBY_RULES.empChargeTarget,
  );
  const [empBlackoutPlies, setEmpBlackoutPlies] = useState(
    DEFAULT_LOBBY_RULES.empBlackoutPlies,
  );

  useEffect(() => {
    setCallSign(defaultCallSign);
  }, [defaultCallSign]);

  const lobbyRules: LobbyRulesOptions = {
    infiltratorSpoolUp,
    infiltratorActivationPly,
    sectorActivationPly,
    heavyWingPreset,
    empRadius,
    empChargeTarget,
    empBlackoutPlies,
  };
  const customModules = !lobbyRulesAreDefault(lobbyRules);

  const setSeat = (color: 'WHITE' | 'BLACK') => {
    onPreferredColorChange?.(color);
  };

  const seatField = (
    <div className="form-group">
      <label htmlFor="lobby-seat">Your seat</label>
      <select
        id="lobby-seat"
        value={preferredColor}
        onChange={(e) => setSeat(e.target.value as 'WHITE' | 'BLACK')}
        data-testid="preferred-seat"
      >
        <option value={PlayerColor.White}>White (moves first)</option>
        <option value={PlayerColor.Black}>Black</option>
      </select>
    </div>
  );

  const callSignField = !asObserver ? (
    <div className="form-group">
      <label htmlFor="lobby-call-sign">Call sign (this match)</label>
      <input
        id="lobby-call-sign"
        type="text"
        value={callSign}
        onChange={(e) => setCallSign(e.target.value)}
        maxLength={40}
        placeholder={defaultCallSign || 'Commander'}
        autoComplete="nickname"
        data-testid="lobby-call-sign"
      />
      <p className="lobby-call-sign-hint">
        Defaults from your{' '}
        {federationProfileUrl ? (
          <a href={federationProfileUrl} target="_blank" rel="noreferrer">
            Federation Profile
          </a>
        ) : (
          'Federation Profile'
        )}
        . Override for this sector only — ladders still use your profile call
        sign.
      </p>
    </div>
  ) : null;

  const rulesModulesField = (
    <fieldset className="lobby-modules" data-testid="lobby-rules-modules">
      <legend>Advanced modules</legend>
      <div className="form-group checkbox">
        <label>
          <input
            type="checkbox"
            checked={infiltratorSpoolUp}
            onChange={(e) => setInfiltratorSpoolUp(e.target.checked)}
            data-testid="lobby-infiltrator-spool"
          />
          Infiltrator spool (announce warp, execute next turn)
        </label>
      </div>
      <div className="form-group">
        <label htmlFor="lobby-infil-unlock">
          Infiltrators unlock after (plies)
        </label>
        <input
          id="lobby-infil-unlock"
          type="number"
          min={0}
          max={400}
          step={1}
          value={infiltratorActivationPly}
          onChange={(e) => {
            const n = Number(e.target.value);
            setInfiltratorActivationPly(
              Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0,
            );
          }}
          data-testid="lobby-infiltrator-activation"
        />
        <p className="lobby-module-hint">0 = available from the opening.</p>
      </div>
      <div className="form-group">
        <label htmlFor="lobby-clock-arm">Sector clock arms at ply</label>
        <input
          id="lobby-clock-arm"
          type="number"
          min={0}
          max={400}
          step={1}
          value={sectorActivationPly}
          onChange={(e) => {
            const n = Number(e.target.value);
            setSectorActivationPly(
              Number.isFinite(n)
                ? Math.max(0, Math.floor(n))
                : DEFAULT_LOBBY_RULES.sectorActivationPly,
            );
          }}
          data-testid="lobby-sector-activation"
        />
        <p className="lobby-module-hint">
          Fleet default is {DEFAULT_LOBBY_RULES.sectorActivationPly}. 0 = armed
          from the start.
        </p>
      </div>
      <div className="form-group">
        <label htmlFor="lobby-heavy-wing">Heavy wing</label>
        <select
          id="lobby-heavy-wing"
          value={heavyWingPreset}
          onChange={(e) =>
            setHeavyWingPreset(e.target.value as HeavyWingPreset)
          }
          data-testid="lobby-heavy-wing"
        >
          <option value="standard">Standard Beams</option>
          <option value="refractor-wing">Refractor Wing</option>
          <option value="fleet-draft">Fleet Draft</option>
        </select>
        <p className="lobby-module-hint">{HEAVY_WING_HINTS[heavyWingPreset]}</p>
      </div>
      <div className="form-group">
        <label htmlFor="lobby-emp-radius">EMP radius (Chebyshev)</label>
        <input
          id="lobby-emp-radius"
          type="number"
          min={0}
          max={5}
          step={1}
          value={empRadius}
          onChange={(e) => {
            const n = Number(e.target.value);
            setEmpRadius(
              Number.isFinite(n)
                ? Math.max(0, Math.min(5, Math.floor(n)))
                : DEFAULT_LOBBY_RULES.empRadius,
            );
          }}
          data-testid="lobby-emp-radius"
        />
        <p className="lobby-module-hint">
          Fleet default {DEFAULT_LOBBY_RULES.empRadius}. 0 disables EMP (with
          charge target 0).
        </p>
      </div>
      <div className="form-group">
        <label htmlFor="lobby-emp-charge">EMP charge target (plies)</label>
        <input
          id="lobby-emp-charge"
          type="number"
          min={0}
          max={400}
          step={1}
          value={empChargeTarget}
          onChange={(e) => {
            const n = Number(e.target.value);
            setEmpChargeTarget(
              Number.isFinite(n)
                ? Math.max(0, Math.floor(n))
                : DEFAULT_LOBBY_RULES.empChargeTarget,
            );
          }}
          data-testid="lobby-emp-charge"
        />
        <p className="lobby-module-hint">
          Non-Hub plies with a stationary Hub to arm Command Overload. Fleet
          default {DEFAULT_LOBBY_RULES.empChargeTarget}.
        </p>
      </div>
      <div className="form-group">
        <label htmlFor="lobby-emp-blackout">EMP blackout (reply plies)</label>
        <input
          id="lobby-emp-blackout"
          type="number"
          min={1}
          max={EMP_BLACKOUT_PLIES_MAX}
          step={1}
          value={empBlackoutPlies}
          onChange={(e) => {
            const n = Number(e.target.value);
            setEmpBlackoutPlies(
              Number.isFinite(n)
                ? Math.max(1, Math.min(EMP_BLACKOUT_PLIES_MAX, Math.floor(n)))
                : DEFAULT_LOBBY_RULES.empBlackoutPlies,
            );
          }}
          data-testid="lobby-emp-blackout"
        />
        <p className="lobby-module-hint">
          How many of the enemy&apos;s own turns stay frozen before engines
          restart. Fleet default {DEFAULT_LOBBY_RULES.empBlackoutPlies}.
        </p>
      </div>
      {customModules && (
        <p className="lobby-module-warn" data-testid="lobby-modules-unrated">
          Custom modules play casual — rated TEI stays on stock fleet rules.
        </p>
      )}
    </fieldset>
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const matchName = callSign.trim() || undefined;
    if (tab === 'create') {
      if (roomName.trim()) {
        onCreateRoom(roomName, password, {
          allowObservers,
          rated: rated && !customModules,
          preferredColor,
          displayName: matchName,
          rulesOverrides: lobbyRules,
        });
      }
    } else if (tab === 'join') {
      if (roomCode.trim()) {
        onJoinRoom(roomCode, password, asObserver, matchName);
      }
    }
  };

  return (
    <div className="subspace-lobby">
      <div className="lobby-tabs">
        <button
          className={`tab-btn ${tab === 'create' ? 'active' : ''}`}
          onClick={() => setTab('create')}
          type="button"
        >
          Create
        </button>
        <button
          className={`tab-btn ${tab === 'join' ? 'active' : ''}`}
          onClick={() => setTab('join')}
          type="button"
        >
          Join
        </button>
        {hasLocal && (
          <button
            className={`tab-btn ${tab === 'local' ? 'active' : ''}`}
            onClick={() => setTab('local')}
            type="button"
            data-testid="lobby-tab-local"
          >
            Local
          </button>
        )}
      </div>

      {tab === 'local' ? (
        <div className="lobby-local-panel">
          {seatField}
          {rulesModulesField}
          {onPlayLocalAi && (
            <>
              {aiStrengthPicker}
              <button
                type="button"
                className="local-ai-btn"
                onClick={() => onPlayLocalAi(lobbyRules)}
                data-testid="play-vs-ai"
              >
                Play vs AI (fleet)
              </button>
            </>
          )}
          {onPlayPassAndPlay && (
            <button
              type="button"
              className="local-ai-btn local-pass-btn"
              onClick={() => onPlayPassAndPlay(lobbyRules)}
              data-testid="play-pass-and-play"
            >
              Pass &amp; Play
            </button>
          )}
          <p className="lobby-fleet-hint">
            Hybrid-fleet base with optional modules above. Pick your seat, then
            play vs AI (rated TEI on stock rules when signed in) or pass &amp;
            play (unrated; your seat defaults to Federation Profile call sign).
          </p>
        </div>
      ) : (
        <form className="lobby-form" onSubmit={handleSubmit}>
          {tab === 'create' ? (
            <>
              <div className="form-group">
                <label>Room Name</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  required
                  placeholder="e.g. Ten-Forward"
                />
              </div>
              {seatField}
              {callSignField}
              <div className="form-group checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={allowObservers}
                    onChange={(e) => setAllowObservers(e.target.checked)}
                    data-testid="allow-observers"
                  />
                  Allow spectators
                </label>
              </div>
              <div className="form-group checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={rated && !customModules}
                    disabled={customModules}
                    onChange={(e) => setRated(e.target.checked)}
                    data-testid="rated-sector"
                  />
                  Rated sector (hides advisor until assisted)
                </label>
              </div>
              {rulesModulesField}
            </>
          ) : (
            <>
              <div className="form-group">
                <label>Room Code (5 chars)</label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={5}
                  required
                  placeholder="ABC12"
                />
              </div>
              <div className="form-group checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={asObserver}
                    onChange={(e) => setAsObserver(e.target.checked)}
                    data-testid="join-as-spectator"
                  />
                  Join as spectator
                </label>
              </div>
              {callSignField}
            </>
          )}

          <div className="form-group">
            <label>Password (Optional)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank for public"
            />
          </div>

          <button type="submit" className="submit-btn">
            {tab === 'create'
              ? 'Initialize Lattice'
              : asObserver
                ? 'Spectate'
                : 'Engage'}
          </button>
        </form>
      )}
    </div>
  );
};
