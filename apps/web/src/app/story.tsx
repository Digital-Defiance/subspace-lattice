import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PieceType } from '@subspace-lattice/core';
import {
  DocLink,
  getStyleCount,
  getStyleLabel,
  getStyleRimFlags,
  Piece,
  SubspaceLatticeLogo,
} from '@subspace-lattice/react';
import { MarketingNav } from './marketing-nav';
import './story.scss';

/** Shipping default piece pack (`Subspace Lattice` / public/pieces/27). */
const DEFAULT_BRIEFING_PIECE_STYLE = 27;

const assets: {
  name: string;
  callSign: string;
  description: string;
  pieceType: PieceType;
}[] = [
  {
    name: 'Command Hub',
    callSign: 'Flagship · Power anchor',
    pieceType: PieceType.CommandHub,
    description:
      'The Command Hub is the beating heart and sovereign brain of the fleet. Deep within the unmapped dark, it acts as the primary power anchor, projecting the vital 3-square halo of Sovereign Space that keeps the armada alive. Every strategic calculation, firing solution, and subspace telemetry feed flows through its heavily armored hull. It is the ultimate prize and the single point of failure—if the flagship’s hull is breached, the surrounding network instantly collapses into the void, and the mission is lost.',
  },
  {
    name: 'Escorts',
    callSign: 'Subspace repeaters',
    pieceType: PieceType.Escort,
    description:
      'Hardy ships that push into unmapped dark and carry the Lattice outward. Break their chain to the Hub and forward coverage goes dark.',
  },
  {
    name: 'Beams',
    callSign: 'Lattice dreadnoughts',
    pieceType: PieceType.Beam,
    description:
      'Long-range particle lances that ride energized channels. Outside their own Sensor Net, they have no lane to fire through.',
  },
  {
    name: 'Infiltrators',
    callSign: 'Phase runners',
    pieceType: PieceType.Infiltrator,
    description:
      'Folding-drive strike craft that jump through unclaimed space. Hostile coverage Target Locks their engines and kills the warp.',
  },
  {
    name: 'Carriers',
    callSign: 'Aegis vanguard',
    pieceType: PieceType.Carrier,
    description:
      "Optional capital hull that combines orthogonal and diagonal routing into absolute omni-directional grid control. However, this massive dreadnought is bound to a strict Hub-anchor. To execute a full subspace slide, it must draw power directly from the Command Hub's natural radiation halo at the start of its maneuver. Drift beyond that tether, and its capacitors starve, reducing it to a crawl until it re-enters the flagship's power grid.",
  },
  {
    name: 'Refractor',
    callSign: 'Slipstream cutter',
    pieceType: PieceType.Refractor,
    description:
      "Optional wing dreadnought. Where a Beam relies on the orthogonal channels of your network, the Refractor exploits the diagonal subspace seams of Sovereign Space. It can slice past the Anomaly's blocked axes, opening firing vectors a Beam could never reach. Like all heavy artillery, it requires an active telemetry link; strand it outside your glow, and its engines go dead.",
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
    copy: 'Leave an opponent with no legal move anywhere on the grid and their fleet freezes solid — a loss for them, not a stalemate. Bodies alone almost never finish this against a live Hub. Commanders who anchor the flagship and keep charging Command Overload can dump an EMP into the enemy formation, seize their engines for a reply, and force Lockout when every remaining ship sits in the blast. When only two Hubs remain, Terminal Overclock seals the vents: Hub moves charge the weapon, the blast grows over time, and there is nowhere left to hide.',
  },
];

function clampPieceStyle(value: number): number {
  const max = Math.max(getStyleCount() - 1, 0);
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

export function Story() {
  const [pieceStyle, setPieceStyle] = useState(() =>
    clampPieceStyle(DEFAULT_BRIEFING_PIECE_STYLE),
  );
  const styleOptions = useMemo(
    () =>
      Array.from({ length: getStyleCount() }, (_, index) => ({
        index,
        label: getStyleLabel(index),
      })),
    [],
  );
  // Match board Outline: CSS white trace only when the pack lacks a baked rim.
  const outlineWhite = !getStyleRimFlags(pieceStyle).lightRimOnWhite;

  return (
    <div className="story-page">
      <MarketingNav
        active="story"
        cta={{ to: '/play', label: 'Enter Sector 11' }}
      />

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
          <div className="story-asset-preview">
            <div className="story-asset-preview__copy">
              <p>Hull silhouettes</p>
              <h3>Preview piece art</h3>
              <span>
                Compare shapes while learning.
              </span>
            </div>
            <label className="story-asset-preview__control">
              <span className="story-asset-preview__control-label">Art set</span>
              <select
                value={pieceStyle}
                onChange={(event) =>
                  setPieceStyle(clampPieceStyle(parseInt(event.target.value, 10)))
                }
                aria-label="Preview piece art set for this briefing"
                data-testid="story-piece-style"
              >
                {styleOptions.map((style) => (
                  <option key={style.index} value={style.index}>
                    {style.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="story-assets">
            {assets.map((asset) => (
              <article key={asset.name}>
                <div className="story-asset-copy">
                  <p>{asset.callSign}</p>
                  <h3>{asset.name}</h3>
                  <span>{asset.description}</span>
                </div>
                <div
                  className={`story-asset-glyph${
                    outlineWhite ? ' story-asset-glyph--outline' : ''
                  }`}
                  aria-hidden="true"
                >
                  <Piece
                    color="white"
                    pieceType={asset.pieceType}
                    styleIndex={pieceStyle}
                    size={72}
                  />
                </div>
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
        <DocLink doc="rules">official rules</DocLink> govern it. Hear the fight
        as the <Link to="/soundtrack">fleet soundtrack</Link>. Prefer plain
        text? Read this briefing as <DocLink doc="story">Markdown</DocLink>.
      </footer>
    </div>
  );
}
