import { Link } from 'react-router-dom';
import { DocLink, SubspaceLatticeLogo } from '@subspace-lattice/react';
import './story.scss';

const assets = [
  {
    name: 'Command Hub',
    callSign: 'Flagship · Power anchor',
    description:
      'The brain of the fleet and source of its first signal halo. If it falls, the network collapses and the mission ends.',
  },
  {
    name: 'Escorts',
    callSign: 'Subspace repeaters',
    description:
      'Hardy ships that push into unmapped dark and carry the Lattice outward. Break their chain to the Hub and forward coverage goes dark.',
  },
  {
    name: 'Beams',
    callSign: 'Lattice dreadnoughts',
    description:
      'Long-range particle lances that ride energized channels. Outside their own Sensor Net, they have no lane to fire through.',
  },
  {
    name: 'Infiltrators',
    callSign: 'Phase runners',
    description:
      'Folding-drive strike craft that jump through unclaimed space. Hostile coverage Target Locks their engines and kills the warp.',
  },
];

const objectives = [
  {
    number: '01',
    title: 'Surgical Strike',
    subtitle: 'Decapitation',
    copy: 'Flank the relay line, open a Beam lane, and destroy the opposing Command Hub. Their fleet goes dark. Mission accomplished.',
  },
  {
    number: '02',
    title: 'Sector Integration',
    subtitle: 'Total dominance',
    copy: 'When the sector clock arms, expand Sovereign Space across 45% of the arena and force an emergency fleet shutdown.',
  },
  {
    number: '03',
    title: 'Lockout',
    subtitle: 'Frozen',
    copy: 'Leave the opposing fleet with no legal maneuver. Bodies alone almost never force that against a live Hub — charge Command Overload (EMP) while your Hub stays put, then spend the turn to seize enemy engines in blast radius.',
  },
];

export function Story() {
  return (
    <div className="story-page">
      <nav className="story-nav" aria-label="Story navigation">
        <Link to="/" className="story-home">
          ← Command deck
        </Link>
        <Link to="/play" className="story-play">
          Enter Sector 11
        </Link>
      </nav>

      <header className="story-hero">
        <SubspaceLatticeLogo
          className="story-logo"
          width={440}
          ariaLabel="Subspace Lattice"
        />
        <p className="story-classification">IWGF operational briefing · Sector 11</p>
        <h1>Collapse at Sector 11</h1>
        <blockquote>
          “Space isn’t empty—it’s unclaimed. Out here, you don’t just sail
          through a sector. You weave the Subspace Lattice through it, thread by
          thread, and make it yours.”
        </blockquote>
      </header>

      <main className="story-content">
        <section className="story-lead" aria-labelledby="story-situation">
          <p className="story-section-label">The situation</p>
          <h2 id="story-situation">Nothing beyond your formation is mapped.</h2>
          <div className="story-prose-columns">
            <p>
              Deep inside contested territory lies Sector 11, a strategic
              gateway shattered when a stellar core imploded. Two task forces
              drop into an electromagnetic dead zone neither faction can afford
              to surrender.
            </p>
            <p>
              Heavy particle weapons cannot fire into unmapped space. Your fleet
              survives by weaving a synchronized signal network anchored to its
              flagship and carried forward, relay by relay, into the dark.
            </p>
          </div>
        </section>

        <section className="story-anomaly" aria-labelledby="story-anomaly-title">
          <div className="story-anomaly-mark" aria-hidden="true">
            5,5
          </div>
          <div>
            <p className="story-section-label">Sector anomaly</p>
            <h2 id="story-anomaly-title">The Anomalous Core</h2>
            <p>
              At the exact center hangs a collapsed singularity: an impenetrable
              wound that swallows matter, ordnance, and subspace signals. No ship
              can enter it. No Beam or warp can cross it. The Core splits every
              battle into two dangerous approaches.
            </p>
          </div>
        </section>

        <section aria-labelledby="story-lattice-title">
          <p className="story-section-label">The living network</p>
          <h2 id="story-lattice-title">Make the dark answer to you.</h2>
          <div className="story-network">
            <article>
              <span className="story-signal story-signal-blue" />
              <h3>Sovereign Space</h3>
              <p>
                Your Sensor Net is territory, firing solution, and lifeline at
                once. Linked Escorts extend it; isolated relays go dark.
              </p>
            </article>
            <article>
              <span className="story-signal story-signal-purple" />
              <h3>Contested Space</h3>
              <p>
                Where opposing networks collide, electronic warfare neutralizes
                both. The overlap belongs to neither commander.
              </p>
            </article>
            <article>
              <span className="story-signal story-signal-red" />
              <h3>Target Lock</h3>
              <p>
                Cross into hostile glow and their network has you. Special
                systems fail; escape becomes one crawling step at a time.
              </p>
            </article>
          </div>
        </section>

        <section aria-labelledby="story-assets-title">
          <p className="story-section-label">Fleet assets</p>
          <h2 id="story-assets-title">Every hull serves the signal.</h2>
          <div className="story-assets">
            {assets.map((asset) => (
              <article key={asset.name}>
                <p>{asset.callSign}</p>
                <h3>{asset.name}</h3>
                <span>{asset.description}</span>
              </article>
            ))}
          </div>
          <aside className="story-relay">
            <strong>Initiative Relay · Vanguard node</strong>
            <span>
              The commander who commits first receives one extra forward Escort:
              visible compensation for revealing their hand early.
            </span>
          </aside>
        </section>

        <section aria-labelledby="story-objectives-title">
          <p className="story-section-label">Mission completion</p>
          <h2 id="story-objectives-title">Secure the sector.</h2>
          <div className="story-objectives">
            {objectives.map((objective) => (
              <article key={objective.number}>
                <span>{objective.number}</span>
                <div>
                  <p>{objective.subtitle}</p>
                  <h3>{objective.title}</h3>
                  <div>{objective.copy}</div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="story-cta" aria-label="Continue">
          <p>The briefing is over. The sector is not.</p>
          <div>
            <Link to="/tutorial">Learn to command</Link>
            <Link to="/play">Enter Sector 11</Link>
          </div>
        </section>
      </main>

      <footer className="story-footer">
        Fiction explains the board; the{' '}
        <DocLink doc="rules">official rules</DocLink> govern it. Prefer
        plain text? Read this briefing as{' '}
        <DocLink doc="story">Markdown</DocLink>.
      </footer>
    </div>
  );
}
