import React, { useEffect, useState } from 'react';
import { PlayerColor } from '@subspace-lattice/core';
import './Lobby.scss';

type LobbyTab = 'create' | 'join' | 'local';

interface LobbyProps {
  onCreateRoom: (
    name: string,
    password?: string,
    options?: {
      allowObservers?: boolean;
      rated?: boolean;
      preferredColor?: 'WHITE' | 'BLACK';
      displayName?: string;
    },
  ) => void;
  onJoinRoom: (
    roomCode: string,
    password?: string,
    asObserver?: boolean,
    displayName?: string,
  ) => void;
  onPlayLocalAi?: () => void;
  onPlayPassAndPlay?: () => void;
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

  useEffect(() => {
    setCallSign(defaultCallSign);
  }, [defaultCallSign]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const matchName = callSign.trim() || undefined;
    if (tab === 'create') {
      if (roomName.trim()) {
        onCreateRoom(roomName, password, {
          allowObservers,
          rated,
          preferredColor,
          displayName: matchName,
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
          {onPlayLocalAi && (
            <>
              {aiStrengthPicker}
              <button
                type="button"
                className="local-ai-btn"
                onClick={onPlayLocalAi}
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
              onClick={onPlayPassAndPlay}
              data-testid="play-pass-and-play"
            >
              Pass &amp; Play
            </button>
          )}
          <p className="lobby-fleet-hint">
            Soft-ship hybrid-fleet: Initiative Relay + sector clock. Pick your
            seat, then play vs AI (rated TEI when signed in) or pass &amp; play
            (unrated; your seat defaults to Federation Profile call sign).
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
                    checked={rated}
                    onChange={(e) => setRated(e.target.checked)}
                    data-testid="rated-sector"
                  />
                  Rated sector (hides advisor until assisted)
                </label>
              </div>
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
