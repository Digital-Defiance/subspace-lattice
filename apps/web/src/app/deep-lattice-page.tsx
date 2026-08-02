import { useId } from 'react';
import { Link } from 'react-router-dom';
import { MarketingNav } from './marketing-nav';
import './story.scss';
import './deep-lattice-page.scss';

const HANDBOOK_DEEP = 'https://docs.lattice.iwgf.org/deep-lattice';
const HANDBOOK_LAB = 'https://docs.lattice.iwgf.org/deep-lattice-lab';
const TEI_STANDINGS = 'https://iwgf.org/leaderboard/lattice';

const PRIORITIES = [
  {
    number: '01',
    title: 'Evidence before ship',
    copy: 'Strength bars, terminal goldens, and a human gate. A stronger leaf does not become the default Deep until it earns the ladder — same discipline as evolve winners.',
  },
  {
    number: '02',
    title: 'One brain',
    copy: 'Local play, the in-game advisor, and LPGN annotate share one agent path. No mute strong engine with a chatty weak tipper bolted on.',
  },
  {
    number: '03',
    title: 'Rules stay human',
    copy: 'hybrid-fleet is designed by people. Neural work learns to see Sector 11 — Sensor Net, Target Lock, Lockout, Terminal Overclock. It does not rewrite the game.',
  },
  {
    number: '04',
    title: 'Fix the hole before the leaf',
    copy: 'When search walks into a freeze or undervalues a reply, we fix the tactics first. A smarter network cannot paper over “I handed them Lockout.”',
  },
  {
    number: '05',
    title: 'Honest in public',
    copy: 'PASS and FAIL both land in the research log. Lab weights stay opt-in until the gate clears. Status is evidence, not marketing.',
  },
];

export function DeepLatticePage() {
  const researchId = useId();
  const whatId = useId();
  const shipsId = useId();

  return (
    <div className="story-page deep-lattice-page">
      <MarketingNav
        active="deep-lattice"
        cta={{
          to: '/play?local=1&ai=deep',
          label: 'Challenge Deep Lattice',
          testId: 'deep-lattice-challenge',
        }}
      />

      <header className="story-hero dl-hero">
        <p className="dl-console">
          DIGITAL DEFIANCE : FLAGSHIP AI : RESEARCH CHARTER
        </p>
        <h1 className="dl-mark">
          <img
            className="dl-mark__img"
            src="/deep-lattice-x.svg"
            width={1024}
            height={512}
            alt="Deep Lattice"
            decoding="async"
          />
        </h1>
        <p className="dl-tagline">Calculate the Fleet. Solve the Lattice.</p>
        <blockquote>
          The mind that plays Sector 11 with you — rival and coach as one brain —
          and the way we prioritize getting it stronger in public.
        </blockquote>
      </header>

      <main className="story-content">
        <section className="story-lead" aria-labelledby={researchId}>
          <p className="story-section-label">How we research</p>
          <h2 id={researchId}>Priorities before parameters.</h2>
          <div className="story-prose-columns">
            <p>
              Deep Lattice is Digital Defiance&apos;s claim on machine play for
              Subspace Lattice — the way Deep Blue was IBM&apos;s for chess. The
              difference is the charter: we ship what we can prove, keep one
              agent for move and explanation, and publish the autopsy when a
              gate fails.
            </p>
            <p>
              Training recipes and encoder knobs live in the lab notebook. This
              page is the method: what we optimize for, what we refuse to fake,
              and how a neural leaf earns the right to become shipping Deep.
            </p>
          </div>
          <ol className="dl-priorities" aria-label="Research priorities">
            {PRIORITIES.map((item) => (
              <li key={item.number}>
                <span aria-hidden="true">{item.number}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby={whatId}>
          <p className="story-section-label">What it is</p>
          <h2 id={whatId}>Rival. Coach. Same mind.</h2>
          <div className="dl-roles">
            <article>
              <h3>Rival</h3>
              <p>
                A local opponent that does not fold to shallow threats or forget
                the sector clock. Climb TEI against it on the federation
                standings.
              </p>
            </article>
            <article>
              <h3>Coach</h3>
              <p>
                The same search that moves can tip and grade an LPGN replay.
                Explainer quality rises with the player — not a second, softer
                model.
              </p>
            </article>
            <article>
              <h3>Corpus</h3>
              <p>
                Export the games that feel wrong or brilliant. That record is
                how the next brain learns what Sector 11 actually rewards.
              </p>
            </article>
          </div>
        </section>

        <section aria-labelledby={shipsId}>
          <p className="story-section-label">What ships today</p>
          <h2 id={shipsId}>Serious search. Neural behind the gate.</h2>
          <div className="story-prose-columns">
            <p>
              On the local AI ladder, Deep Lattice is UCT search with a
              heuristic leaf and guided rollouts — roughly eight hundred
              simulations, with think-time caps so the board stays responsive.
              That is the product opponent you challenge now.
            </p>
            <p>
              A position encoder and value net exist in the lab. They are
              opt-in. Product Deep keeps the heuristic leaf until a human-gated
              strength bar says otherwise. Dated results live in the research
              log — including fails.
            </p>
          </div>
        </section>

        <section className="story-cta" aria-label="Continue">
          <p>Pull into the sector.</p>
          <div>
            <Link to="/annotate">Annotate LPGN</Link>
            <Link to="/play?local=1&ai=deep">Challenge Deep Lattice</Link>
          </div>
        </section>
      </main>

      <footer className="story-footer">
        Research log:{' '}
        <a href={HANDBOOK_DEEP} target="_blank" rel="noopener noreferrer">
          status &amp; field reports
        </a>
        {' · '}
        <a href={HANDBOOK_LAB} target="_blank" rel="noopener noreferrer">
          lab notebook
        </a>
        {' · '}
        <a href={TEI_STANDINGS} target="_blank" rel="noopener noreferrer">
          Lattice TEI
        </a>
        {' · '}
        <Link to="/soundtrack">Soundtrack</Link>
        {' · '}
        <Link to="/soundboard">Soundboard</Link>. Fiction sets mood on the{' '}
        <Link to="/story">Sector 11 briefing</Link>; Deep Lattice is the living
        opponent. Prefer the command deck? <Link to="/">Return home</Link>.
      </footer>
    </div>
  );
}
