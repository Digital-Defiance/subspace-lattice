import { Navigate, Route, Routes } from 'react-router-dom';
import {
  FiguresCaptureHarness,
  GameLayout,
  SetupDiagramHarness,
  Tutorial,
} from '@subspace-lattice/react';
import { Landing } from './landing';

/** Old /leaderboard bookmarks → federation standings hub. */
function FederationStandingsRedirect() {
  if (typeof window !== 'undefined') {
    window.location.replace('https://iwgf.org/leaderboard');
  }
  return (
    <p style={{ padding: '2rem', textAlign: 'center' }}>
      Redirecting to Federation Standings…
    </p>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/play" element={<GameLayout />} />
      <Route path="/tutorial" element={<Tutorial />} />
      <Route path="/leaderboard" element={<FederationStandingsRedirect />} />
      <Route path="/game" element={<Navigate to="/play" replace />} />
      <Route path="/game/:roomCode" element={<GameLayout />} />
      <Route path="/setup-diagram" element={<SetupDiagramHarness />} />
      <Route path="/harness/setup" element={<SetupDiagramHarness />} />
      <Route path="/harness/figures" element={<FiguresCaptureHarness />} />
    </Routes>
  );
}
