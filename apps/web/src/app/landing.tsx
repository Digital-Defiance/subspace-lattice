import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './landing.scss';
import {
  PlayerDocsLinks,
  SubspaceLatticeLogo,
  hasSoundtrackPreferenceSet,
  isTauriRuntime,
  useLatticeSoundtrack,
} from '@subspace-lattice/react';
import { MarketingNav } from './marketing-nav';
import { OriginWelcomeGate } from './origin-welcome-gate';
import {
  ORIGIN_STORY_YOUTUBE_URL,
  hasSeenOriginWelcome,
} from './origin-welcome';
import { SoundtrackWelcomeGate } from './soundtrack-welcome-gate';

// <li><img className={styles.platformIcon} height="16" src="/google-play-brands-solid-full.svg" alt="Google Play" /> <a className={styles.platformLink} target="_blank" rel="noopener noreferrer" href="https://play.google.com/store/apps/details?id=org.digitaldefiance.app.warp12">Google Play</a></li>
const appsSection = (
  <section className="appAvailability">
    <h4>Available on multiple platforms</h4>
    <ul>
      <li>
        <img
          className="platformIcon"
          height="16"
          src="/microsoft-brands-solid-full.svg"
          alt="Microsoft Store"
        />{' '}
        <a
          className="platformLink"
          target="_blank"
          rel="noopener noreferrer"
          href="https://apps.microsoft.com/detail/9PNNSVNCZ2NK"
        >
          Microsoft Store
        </a>
      </li>
      <li>
        <img
          className="platformIcon"
          height="16"
          src="/beer-mug-duotone-solid-full.svg"
          alt="Homebrew"
        />{' '}
        <a
          className="platformLink"
          target="_blank"
          rel="noopener noreferrer"
          href="https://brew.digitaldefiance.org"
        >
          Mac via Homebrew
        </a>
      </li>
    </ul>
    <p>More pending app store review!</p>
  </section>
);

export function Landing() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSoundtrack, setShowSoundtrack] = useState(false);

  // Command deck OST — leave running on navigate so /play can crossfade to lobby.
  useLatticeSoundtrack(null, {
    scene: 'command-deck',
    stopOnUnmount: false,
  });

  useEffect(() => {
    if (!hasSeenOriginWelcome()) {
      setShowWelcome(true);
      return;
    }
    if (!hasSoundtrackPreferenceSet()) setShowSoundtrack(true);
  }, []);

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false);
    if (!hasSoundtrackPreferenceSet()) setShowSoundtrack(true);
  }, []);

  const dismissSoundtrack = useCallback(() => {
    setShowSoundtrack(false);
  }, []);

  return (
    <div className="landing">
      {showWelcome ? <OriginWelcomeGate onDismiss={dismissWelcome} /> : null}
      {!showWelcome && showSoundtrack ? (
        <SoundtrackWelcomeGate onDismiss={dismissSoundtrack} />
      ) : null}

      <MarketingNav active="home" />

      <main className="landing-hero">
        <SubspaceLatticeLogo
          className="landing-logo"
          width={544}
          ariaLabel="Subspace Lattice — Command the Fleet. Control the Lattice."
        />
        <p className="landing-kicker">
          Fleet tactics · Signal warfare · Sovereign space
        </p>
        <h1 className="landing-headline">
          Every ship is a weapon.
          <span>Every signal redraws the battlefield.</span>
        </h1>
        <p className="landing-copy">
          Two rival fleets enter the lattice. Your Command Hub anchors a living
          Sensor Net; your Escorts extend it, your Beams fire through it, and
          your Infiltrators hunt the gaps beyond it. Protect your signal. Break
          theirs. Find the enemy Hub before the sector closes around you.
        </p>
        <div className="landing-actions">
          <Link to="/drills" className="landing-cta" data-testid="before-game-1">
            Before Game 1
          </Link>
        </div>
        <ol className="landing-path" aria-label="Recommended first command">
          <li>
            <span className="landing-path-n">1</span>
            <Link target="_blank" to={ORIGIN_STORY_YOUTUBE_URL}>
              Watch the origin story
            </Link>
          </li>
          <li>
            <span className="landing-path-n">2</span>
            <button
              type="button"
              className="landing-path-btn"
              onClick={() => setShowSoundtrack(true)}
            >
              Turn on the soundtrack
            </button>
          </li>
          <li>
            <span className="landing-path-n">3</span>
            <Link to="/rules">Rules</Link>
          </li>
          <li>
            <span className="landing-path-n">4</span>
            <Link to="/drills">Before Game 1</Link>
            <span className="landing-path-note"> — short highlighted drills</span>
          </li>
          <li>
            <span className="landing-path-n">5</span>
            <Link to="/play?local=1&ai=fast" data-testid="enter-game">
              First local game · Fast AI
            </Link>
          </li>
        </ol>
        <PlayerDocsLinks
          layout="inline"
          className="landing-docs"
          omit={['rulesTour', 'deepLattice']}
        />
      </main>

      <section className="landing-atelier" aria-labelledby="landing-atelier-title">
        <p className="landing-section-label">Fleet atelier</p>
        <h2 id="landing-atelier-title">Built for the board — and beyond it.</h2>
        <p className="landing-atelier-copy">
          Flagship AI research, an adaptive score, and the cue library that makes
          Sector 11 feel alive. Same craft as the rules engine — shown off on
          purpose.
        </p>
        <Link
          to="/deep-lattice"
          className="landing-atelier-deep"
          data-testid="landing-deep-lattice"
        >
          <img
            src="/deep-lattice-x.svg"
            width={1024}
            height={512}
            alt="Deep Lattice — research charter"
            decoding="async"
          />
        </Link>
        <p className="landing-atelier-links">
          <Link to="/soundtrack">Soundtrack</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/soundboard">Soundboard</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/story">Sector 11 briefing</Link>
        </p>
      </section>

      <section className="landing-premise" aria-labelledby="landing-premise-title">
        <p className="landing-section-label">The battle for the lattice</p>
        <h2 id="landing-premise-title">
          You do not conquer space. You make it yours.
        </h2>
        <p>
          Your fleet is small, and every move changes what it can see, where it
          can strike, and which systems still work. Push too far and your relay
          breaks. Hold back and the opposing net claims the sector. Victory
          belongs to the commander who turns position into pressure—and
          pressure into one decisive opening.
        </p>
      </section>

      <section className="landing-features">
        <div className="landing-feature">
          <span className="landing-feature-number">01</span>
          <h3>Establish the signal</h3>
          <p>
            Keep your Escorts linked and project Sovereign Space from the
            Command Hub. Your formation is your reach—and your lifeline.
          </p>
        </div>
        <div className="landing-feature">
          <span className="landing-feature-number">02</span>
          <h3>Turn space into a weapon</h3>
          <p>
            Catch enemy ships inside your net to Target Lock their systems.
            Shape firing lanes for Beams and leave gaps only you can exploit.
          </p>
        </div>
        <div className="landing-feature">
          <span className="landing-feature-number">03</span>
          <h3>Force the final move</h3>
          <p>
            Strike the enemy Hub—or integrate the sector until hiding is no
            longer possible. The lattice makes every stalemate temporary.
          </p>
        </div>
      </section>
      {!isTauriRuntime() && appsSection}

      <footer className="landing-footer">
        <nav className="landing-sitemap" aria-label="Site map">
          <Link to="/play">Play</Link>
          <Link to="/rules">Rules</Link>
          <Link to="/deep-lattice">Deep Lattice</Link>
          <Link to="/soundtrack">Soundtrack</Link>
          <Link to="/soundboard">Soundboard</Link>
          <Link to="/story">Briefing</Link>
          <Link to="/annotate">Annotate</Link>
          <a href="https://iwgf.org/leaderboard/lattice">Standings</a>
          <Link to="/privacy">Privacy</Link>
        </nav>
        <div className="landing-footer-links">
          Subspace Lattice ·{' '}
          <Link to="https://iwgf.org" className="landing-iwgf-link">
            Interstellar Warp Gaming Federation
          </Link>{' '}
          · lattice.iwgf.org
        </div>
        <div className="landing-footer-copyright">
          © 2026 Digital Defiance. All rights reserved.
        </div>
        <div className="landing-footer-iwgf">
          <Link to="https://iwgf.org" className="landing-iwgf-link">
            <span className="landing-footer-iwgf-text-logo">IWGF</span>
          </Link>
        </div>
      </footer>
    </div>
  );
}
