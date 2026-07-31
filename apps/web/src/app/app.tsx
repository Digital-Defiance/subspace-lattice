import { Navigate, Route, Routes } from 'react-router-dom';
import {
  FiguresCaptureHarness,
  GameLayout,
  MissionFiguresHarness,
  SetupDiagramHarness,
  Soundboard,
  Tutorial,
} from '@subspace-lattice/react';
import { Landing } from './landing';
import { PrivacyPage } from './privacy';
import { SoundtrackPage } from './soundtrack-page';
import { Story } from './story';

/** Old /leaderboard bookmarks → Lattice TEI on the federation standings site. */
function FederationStandingsRedirect() {
  if (typeof window !== 'undefined') {
    window.location.replace('https://iwgf.org/leaderboard/lattice');
  }
  return (
    <p style={{ padding: '2rem', textAlign: 'center' }}>
      Redirecting to Lattice TEI standings…
    </p>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/story" element={<Story />} />
      <Route path="/soundtrack" element={<SoundtrackPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/play" element={<GameLayout />} />
      <Route path="/tutorial" element={<Tutorial />} />
      <Route path="/soundboard" element={<Soundboard />} />
      <Route path="/leaderboard" element={<FederationStandingsRedirect />} />
      <Route path="/game" element={<Navigate to="/play" replace />} />
      <Route path="/game/:roomCode" element={<GameLayout />} />
      <Route path="/setup-diagram" element={<SetupDiagramHarness />} />
      <Route path="/harness/setup" element={<SetupDiagramHarness />} />
      <Route path="/harness/figures" element={<FiguresCaptureHarness />} />
      <Route
        path="/harness/mission-figures"
        element={<MissionFiguresHarness />}
      />
    </Routes>
  );
}
