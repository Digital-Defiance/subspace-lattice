import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { LATTICE_COLLECTIONS } from '@subspace-lattice/core';
import { getFirebaseDb } from '../firebase/app';
import {
  mapLatticeTeiDocs,
  type LeaderboardRow,
  type TeiTrack,
} from '../lib/leaderboard-rows';
import './Leaderboard.scss';

export type { LeaderboardRow };

async function fetchTeiLeaderboard(
  track: TeiTrack,
  max = 50,
): Promise<LeaderboardRow[]> {
  const db = getFirebaseDb();
  const field = track === 'online' ? 'online.matches' : 'localAi.matches';
  const snap = await getDocs(
    query(
      collection(db, LATTICE_COLLECTIONS.tei),
      orderBy(field, 'desc'),
      limit(max),
    ),
  );
  return mapLatticeTeiDocs(
    snap.docs.map((docSnap) => ({
      id: docSnap.id,
      data: docSnap.data() as Record<string, unknown>,
    })),
    track,
  );
}

export function Leaderboard() {
  const [track, setTrack] = useState<TeiTrack>('localAi');
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void fetchTeiLeaderboard(track)
      .then(setRows)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load standings');
      })
      .finally(() => setLoading(false));
  }, [track]);

  return (
    <main className="lattice-leaderboard" data-testid="leaderboard">
      <header className="lattice-leaderboard-top">
        <Link to="/" className="lattice-leaderboard-home">
          Subspace Lattice
        </Link>
        <span>Federation standings</span>
        <Link to="/play">Play</Link>
      </header>

      <section className="lattice-leaderboard-panel">
        <div className="lattice-leaderboard-tracks" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={track === 'localAi'}
            className={track === 'localAi' ? 'active' : undefined}
            data-testid="tei-track-local"
            onClick={() => setTrack('localAi')}
          >
            Local AI
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={track === 'online'}
            className={track === 'online' ? 'active' : undefined}
            data-testid="tei-track-online"
            onClick={() => setTrack('online')}
          >
            Online
          </button>
        </div>
        <p className="lattice-leaderboard-kicker">
          {track === 'online' ? 'Online rated track' : 'Local AI track'}
        </p>
        <h1>TEI Leaderboard</h1>
        <p className="lattice-leaderboard-blurb">
          OpenSkill ratings in Lattice’s own <code>latticeTei</code> collection
          (not Warp standings). Same TEI alphabet
          {track === 'localAi'
            ? '; Fast P0 · Normal I10 · Strong I52.'
            : '. Rated sectors only — assisted matches stay off the board.'}
        </p>

        {loading && <p data-testid="leaderboard-loading">Loading standings…</p>}
        {error && (
          <p className="lattice-leaderboard-error" data-testid="leaderboard-error">
            {error}
          </p>
        )}
        {!loading && !error && rows.length === 0 && (
          <p data-testid="leaderboard-empty">
            {track === 'online'
              ? 'No rated online games yet. Finish a rated sector to appear here.'
              : 'No rated games yet. Finish a local AI match to appear here.'}
          </p>
        )}

        {rows.length > 0 && (
          <table data-testid="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Commander</th>
                <th>TEI</th>
                <th>W–L</th>
                <th>Games</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.uid}>
                  <td>{index + 1}</td>
                  <td>{row.displayName}</td>
                  <td>
                    <span
                      className={`lattice-tei lattice-tei--${row.displayGrade.charAt(0).toLowerCase()}`}
                    >
                      {row.displayGrade}
                    </span>
                  </td>
                  <td>
                    {row.wins}–{Math.max(0, row.matches - row.wins)}
                  </td>
                  <td>{row.matches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
