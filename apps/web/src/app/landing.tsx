import { Link } from 'react-router-dom';
import './landing.scss';
import {
  SubspaceLatticeLogo,
} from '@subspace-lattice/react';

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
          <a href="/docs/subspace-lattice-manual.pdf" target="_blank" rel="noreferrer">
            Introductory manual
          </a>
          <span aria-hidden="true"> · </span>
          <a href="/docs/rules.pdf" target="_blank" rel="noreferrer">
            Official rules
          </a>
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

      <footer className="landing-footer">
        <div className="landing-footer-links">Subspace Lattice · <Link to="https://iwgf.org" className="landing-iwgf-link">Interstellar Warp Gaming Federation</Link> · lattice.iwgf.org</div>
        <div className="landing-footer-copyright">© 2026 Digital Defiance. All rights reserved.</div>
        <div className="landing-footer-iwgf"><Link to="https://iwgf.org" className="landing-iwgf-link"><span className="landing-footer-iwgf-text-logo">IWGF</span></Link></div>
      </footer>
    </div>
  );
}
