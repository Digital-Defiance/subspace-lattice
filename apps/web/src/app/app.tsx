import { Navigate, Route, Routes } from 'react-router-dom';
import {
  FiguresCaptureHarness,
  GameLayout,
  Leaderboard,
  SetupDiagramHarness,
  Tutorial,
} from '@subspace-lattice/react';
import { Landing } from './landing';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/play" element={<GameLayout />} />
      <Route path="/tutorial" element={<Tutorial />} />
      <Route path="/leaderboard" element={<Leaderboard />} />
      <Route path="/game" element={<Navigate to="/play" replace />} />
      <Route path="/game/:roomCode" element={<GameLayout />} />
      <Route path="/setup-diagram" element={<SetupDiagramHarness />} />
      <Route path="/harness/setup" element={<SetupDiagramHarness />} />
      <Route path="/harness/figures" element={<FiguresCaptureHarness />} />
    </Routes>
  );
}
