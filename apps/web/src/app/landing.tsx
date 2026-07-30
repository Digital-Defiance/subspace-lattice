import { Link } from 'react-router-dom';
import './landing.scss';
import {
  DocLink,
  SubspaceLatticeLogo,
  isTauriRuntime,
} from '@subspace-lattice/react';

// <li><img className={styles.platformIcon} height="16" src="/google-play-brands-solid-full.svg" alt="Google Play" /> <a className={styles.platformLink} target="_blank" rel="noopener noreferrer" href="https://play.google.com/store/apps/details?id=org.digitaldefiance.app.warp12">Google Play</a></li>
const appsSection = (<section className="appAvailability">
  <h4>Available on multiple platforms</h4>
  <ul>
    <li><img className="platformIcon" height="16" src="/microsoft-brands-solid-full.svg" alt="Microsoft Store" /> <a className="platformLink" target="_blank" rel="noopener noreferrer" href="https://apps.microsoft.com/detail/9PNNSVNCZ2NK">Microsoft Store</a></li>
    <li><img className="platformIcon" height="16" src="/beer-mug-duotone-solid-full.svg" alt="Homebrew" /> <a className="platformLink" target="_blank" rel="noopener noreferrer" href="https://brew.digitaldefiance.org">Mac via Homebrew</a></li>
  </ul>
  <p>More pending app store review!</p>
</section>);

export function Landing() {
  return (
    <div className="landing">
      <main className="landing-hero">
        <SubspaceLatticeLogo className="landing-logo" width={544} ariaLabel="Subspace Lattice — Command the Fleet. Control the Lattice."  />
        <p className="landing-kicker">Fleet tactics · Signal warfare · Sovereign space</p>
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
          <Link to="/play" className="landing-cta" data-testid="enter-game">
            Take Command
          </Link>
          <Link to="/tutorial" className="landing-secondary">
            Learn to Play
          </Link>
          <a
            href="https://iwgf.org/leaderboard/lattice"
            className="landing-secondary"
            data-testid="federation-standings"
          >
            Standings
          </a>
        </div>
        <p className="landing-docs">
          <Link to="/story">Sector 11 briefing</Link>
          <span aria-hidden="true"> · </span>
          <DocLink doc="manual">Introductory manual</DocLink>
          <span aria-hidden="true"> · </span>
          <DocLink doc="rules">Official rules</DocLink>
          <span aria-hidden="true"> · </span>
          <DocLink doc="advanced">Advanced walkthrough</DocLink>
        </p>
      </main>

      <section className="landing-premise" aria-labelledby="landing-premise-title">
        <p className="landing-section-label">The battle for the lattice</p>
        <h2 id="landing-premise-title">You do not conquer space. You make it yours.</h2>
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
        <div className="landing-footer-links">
          Subspace Lattice ·{' '}
          <Link to="https://iwgf.org" className="landing-iwgf-link">
            Interstellar Warp Gaming Federation
          </Link>{' '}
          · lattice.iwgf.org ·{' '}
          <Link to="/privacy" className="landing-iwgf-link">
            Privacy
          </Link>
        </div>
        <div className="landing-footer-copyright">© 2026 Digital Defiance. All rights reserved.</div>
        <div className="landing-footer-iwgf"><Link to="https://iwgf.org" className="landing-iwgf-link"><span className="landing-footer-iwgf-text-logo">IWGF</span></Link></div>
      </footer>
    </div>
  );
}
