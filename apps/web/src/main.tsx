import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { initFirebase } from '@subspace-lattice/react';
import { App } from './app/app';
import { readFirebaseWebConfig } from './firebase-config';
import './styles.scss';

initFirebase(readFirebaseWebConfig());

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

// Tauri production builds are happier with hash routing; browser uses history API.
const Router = import.meta.env.TAURI_ENV_PLATFORM ? HashRouter : BrowserRouter;

createRoot(root).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
