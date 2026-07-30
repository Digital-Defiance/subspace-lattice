import { Link } from 'react-router-dom';
import { SubspaceLatticeLogo } from '@subspace-lattice/react';
import { LATTICE_PRIVACY_MARKDOWN } from '../content/privacy-source';
import { PrivacyMarkdown } from './privacy-markdown';
import './privacy.scss';

export function PrivacyPage() {
  return (
    <div className="privacy-page">
      <nav className="privacy-nav" aria-label="Privacy navigation">
        <Link to="/" className="privacy-home">
          ← Command deck
        </Link>
        <Link to="/play" className="privacy-play">
          Take Command
        </Link>
      </nav>

      <header className="privacy-header">
        <SubspaceLatticeLogo
          className="privacy-logo"
          width={280}
          ariaLabel="Subspace Lattice"
        />
      </header>

      <main className="privacy-body">
        <PrivacyMarkdown source={LATTICE_PRIVACY_MARKDOWN} />
      </main>
    </div>
  );
}
