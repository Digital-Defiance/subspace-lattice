import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PieceType } from '@subspace-lattice/core';
import { DocLink } from './DocLink';
import { Piece } from './Piece';
import { SensorNetLab } from './SensorNetLab';
import { SetupDiagram } from './SetupDiagram';
import { SubspaceLatticeLogo } from './SubspaceLatticeLogo';
import './VisualRulesAcademy.scss';

/** Shipping default piece pack (`public/pieces/27`). */
const PIECE_STYLE = 27;

type PatternKind =
  | 'king'
  | 'ortho'
  | 'warp'
  | 'rook'
  | 'bishop'
  | 'queen'
  | 'net'
  | 'blast';

interface PatternCell {
  x: number;
  y: number;
  role: 'piece' | 'move' | 'blocked' | 'empty' | 'enemy';
}

function buildPattern(kind: PatternKind): PatternCell[] {
  const n = 7;
  const c = 3;
  const cells: PatternCell[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = Math.abs(x - c);
      const dy = Math.abs(y - c);
      let role: PatternCell['role'] = 'empty';
      if (x === c && y === c) role = 'piece';
      else if (kind === 'king' && dx <= 1 && dy <= 1) role = 'move';
      else if (
        kind === 'ortho' &&
        ((dx === 1 && dy === 0) || (dx === 0 && dy === 1))
      )
        role = 'move';
      else if (
        kind === 'rook' &&
        (dx === 0 || dy === 0) &&
        !(dx === 0 && dy === 0)
      )
        role = 'move';
      else if (kind === 'bishop' && dx === dy && dx > 0) role = 'move';
      else if (
        kind === 'queen' &&
        (dx === 0 || dy === 0 || dx === dy) &&
        !(dx === 0 && dy === 0)
      )
        role = 'move';
      else if (kind === 'warp' && !(dx === 0 && dy === 0)) {
        if (
          (dx === 3 && dy === 0) ||
          (dx === 0 && dy === 3) ||
          (dx === 2 && dy === 2) ||
          (dx === 3 && dy === 2)
        ) {
          role = 'move';
        }
      } else if (kind === 'net' && Math.max(dx, dy) <= 2) role = 'move';
      else if (kind === 'blast' && Math.max(dx, dy) <= 3) role = 'move';
      cells.push({ x, y, role });
    }
  }
  if (kind === 'net') {
    const escort = cells.find((item) => item.x === 3 && item.y === 5);
    if (escort) escort.role = 'piece';
  }
  if (kind === 'blast') {
    const enemy = cells.find((item) => item.x === 3 && item.y === 5);
    if (enemy) enemy.role = 'enemy';
  }
  return cells;
}

function MovePattern({
  kind,
  label,
}: {
  kind: PatternKind;
  label: string;
}) {
  const cells = useMemo(() => buildPattern(kind), [kind]);
  return (
    <div
      className={`vra-pattern vra-pattern--${kind}`}
      role="img"
      aria-label={label}
    >
      {cells.map((cell) => (
        <span
          key={`${cell.x}-${cell.y}`}
          className={`vra-pattern-cell is-${cell.role}`}
        />
      ))}
    </div>
  );
}

const SHIPS: {
  name: string;
  type: PieceType;
  pattern: PatternKind;
  move: string;
  note: string;
  optional?: boolean;
}[] = [
  {
    name: 'Command Hub',
    type: PieceType.CommandHub,
    pattern: 'king',
    move: 'One square any direction (king-step)',
    note: 'Flagship and power anchor. Capture theirs = Surgical Strike. If Target Locked, ortho only.',
  },
  {
    name: 'Escort',
    type: PieceType.Escort,
    pattern: 'ortho',
    move: 'One square orthogonally',
    note: 'Relays the Sensor Net when linked to the Hub (friendly hop chain, Chebyshev ≤2). Dark Escorts do not expand coverage.',
  },
  {
    name: 'Infiltrator',
    type: PieceType.Infiltrator,
    pattern: 'warp',
    move: 'Warp to any empty or enemy square outside their Sensor Net',
    note: 'Cannot warp into enemy coverage. Target Locked → warp dies; only one ortho step. (Lobby spool: announce one turn, jump the next.)',
  },
  {
    name: 'Beam',
    type: PieceType.Beam,
    pattern: 'rook',
    move: 'Any distance orthogonally through your own net',
    note: 'Every square of the path must be in Sovereign Space. Clear blockers; don’t leave friendlies on the file.',
  },
  {
    name: 'Refractor',
    type: PieceType.Refractor,
    pattern: 'bishop',
    move: 'Any distance diagonally through your own net',
    note: 'Optional wing. Same net law as Beams, diagonal axes. Target Locked → one ortho step.',
    optional: true,
  },
  {
    name: 'Carrier',
    type: PieceType.Carrier,
    pattern: 'queen',
    move: 'Ortho or diagonal through your net while Hub-anchored',
    note: 'Optional capital (Fleet Draft). Full slides need Hub radiation at start of turn; outside that tether, crawl one king-step.',
    optional: true,
  },
];

const WINS = [
  {
    title: 'Surgical Strike',
    copy: 'Land on the enemy Command Hub. Instant win — the primary payoff of fleet tactics.',
  },
  {
    title: 'Sector Integration',
    copy: 'Exclusive Sensor Net ≥45% of non–Gravity-Well cells. Fleet clock arms at ply 100; contested overlap counts for neither side; hold 1 ply.',
  },
  {
    title: 'Lockout',
    copy: 'Opponent has zero legal moves after your turn. Against a live Hub this almost always needs EMP (Command Overload) or Terminal Overclock.',
  },
  {
    title: 'Resign',
    copy: 'Concede — opponent wins immediately. Available in online and local play.',
  },
];

const ARC = [
  {
    title: 'Opening',
    copy: 'Link Escorts, contest mid-board, look for Infiltrator gaps outside their net. Beams are quiet until you grow coverage.',
  },
  {
    title: 'Midgame',
    copy: 'Target Locks punish overextension. Hub hunts and net fights trade. Charge EMP while the Hub sits; refuse hanging your Hub.',
  },
  {
    title: 'Late / clock',
    copy: 'If Hubs still stand, Sector Integration tightens after ply 100. Someone must break the stalemate or accept the clock.',
  },
  {
    title: 'Terminal',
    copy: 'Both fleets reduced to lone Hubs → Terminal Overclock. Hub steps charge EMP; blast grows; kiting only delays Lockout.',
  },
];

const MINUTIAE: { title: string; copy: string }[] = [
  {
    title: 'Initiative Relay',
    copy: 'Going first means committing ships and net before you see Black’s reply — empirically a seat disadvantage. White therefore starts with one extra forward Escort.',
  },
  {
    title: 'Captures',
    copy: 'One ship per square. Move onto an enemy to remove it. Never onto a friendly. Gravity Well is impassable.',
  },
  {
    title: 'Contested space',
    copy: 'Cells in both nets count for neither side toward Sector Integration.',
  },
  {
    title: 'EMP charge (midgame)',
    copy: 'Default target 15 non-Hub plies while Hub stays put. Moving the Hub resets charge. Fire spends your whole turn.',
  },
  {
    title: 'EMP blast',
    copy: 'Chebyshev radius 3 (lobby-tunable). Seizes enemy engines for one of their replies. Your fleet is never in the blast.',
  },
  {
    title: 'Terminal Overclock',
    copy: 'Lone Hub vs lone Hub. Hub moves charge (target 3). Fire fuses your drives (life support intact). Shared blast grows +1 every 5 plies.',
  },
  {
    title: 'Cyan / magenta discs',
    copy: 'Terminal EMP range paints cyan. Magenta = both discs overlap — mutual threat, not “armed” by itself.',
  },
  {
    title: 'Heavy wing modules',
    copy: 'Stock open: two Beams on files 2 & 8. Lobby can unlock Refractor Wing (Beam+Refractor) or Fleet Draft (Refractor+Carrier) — unrated online.',
  },
  {
    title: 'Infiltrator spool',
    copy: 'Optional lobby module: Navigational Target Lock — announce destination one turn, execute the next (failed landing still costs the ply).',
  },
  {
    title: 'TEI ratings',
    copy: 'Local AI and online are separate pools (latticeTei). Advisor / coaching marks a session assisted.',
  },
  {
    title: 'Normative docs',
    copy: 'This tour is teaching breadth. Official PDF and manuals win disputes.',
  },
  {
    title: 'hybrid-fleet default',
    copy: 'Online and local AI ship Sensor Net + sector clock + Initiative Relay + EMP + Terminal. Legacy classic / hybrid exist for sims only.',
  },
];

const PANELS = [
  'board',
  'wins',
  'ships',
  'net',
  'emp',
  'terminal',
  'safety',
  'arc',
  'minutiae',
  'ready',
] as const;

type PanelId = (typeof PANELS)[number];

const PANEL_LABEL: Record<PanelId, string> = {
  board: 'Board',
  wins: 'Wins',
  ships: 'Fleet',
  net: 'Net lab',
  emp: 'EMP',
  terminal: 'Terminal',
  safety: 'Hub safety',
  arc: 'Game arc',
  minutiae: 'Minutiae',
  ready: 'Ready',
};

export function VisualRulesAcademy() {
  const [panelIndex, setPanelIndex] = useState(0);
  const titleId = useId();
  const panel = PANELS[panelIndex] ?? PANELS[0];
  const progress = ((panelIndex + 1) / PANELS.length) * 100;

  return (
    <main className="vra">
      <header className="vra-topbar">
        <Link to="/" className="vra-home">
          <SubspaceLatticeLogo width={220} ariaLabel="Subspace Lattice" />
        </Link>
        <span>
          Rules · {PANEL_LABEL[panel]} ({panelIndex + 1}/{PANELS.length})
        </span>
        <Link to="/drills">Skip to drills</Link>
      </header>

      <div className="vra-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="vra-stage">
        {panel === 'board' && (
          <section className="vra-panel" aria-labelledby={titleId}>
            <p className="vra-kicker">11×11 · hybrid-fleet</p>
            <h1 id={titleId}>The sector</h1>
            <p className="vra-lead">
              Chess piece tactics on a living Sensor Net. White at the bottom,
              Black at the top. The center <strong>Gravity Well</strong> blocks
              occupation and paths. White moves first, which here is often a{' '}
              <em>disadvantage</em> (you reveal formation and net first). White
              therefore starts with one forward <strong>Initiative Relay</strong>{' '}
              Escort as visible compensation.
            </p>
            <div className="vra-diagram">
              <SetupDiagram
                rulesVersion="hybrid-fleet"
                title="Opening deployment · hybrid-fleet"
              />
            </div>
            <ul className="vra-bullets">
              <li>
                One ship per square — move onto an enemy to capture and remove
                it.
              </li>
              <li>
                Stock opening: Hub, Escorts, Infiltrators, two Beams (files 2
                &amp; 8). Optional heavies live in lobby modules.
              </li>
            </ul>
          </section>
        )}

        {panel === 'wins' && (
          <section className="vra-panel" aria-labelledby={titleId}>
            <p className="vra-kicker">How matches end</p>
            <h1 id={titleId}>Win conditions</h1>
            <p className="vra-lead">
              Surgical Strike is the usual story. Sector Integration is the late
              clock. Lockout is the freeze — usually EMP or Terminal.
            </p>
            <div className="vra-wins vra-wins--four">
              {WINS.map((win, i) => (
                <article key={win.title} className="vra-win">
                  <span className="vra-win-n">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h2>{win.title}</h2>
                  <p>{win.copy}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {panel === 'ships' && (
          <section className="vra-panel" aria-labelledby={titleId}>
            <p className="vra-kicker">Movement at a glance</p>
            <h1 id={titleId}>Your fleet</h1>
            <p className="vra-lead">
              Cyan marks sample reach from the center. Beams / Refractors /
              Carriers also need your Sensor Net under the entire path.
            </p>
            <div className="vra-ships">
              {SHIPS.map((ship) => (
                <article key={ship.name} className="vra-ship">
                  <div className="vra-ship-art">
                    <Piece
                      pieceType={ship.type}
                      color="white"
                      styleIndex={PIECE_STYLE}
                      size={72}
                    />
                  </div>
                  <div className="vra-ship-copy">
                    <h2>
                      {ship.name}
                      {ship.optional ? (
                        <span className="vra-optional"> optional</span>
                      ) : null}
                    </h2>
                    <p className="vra-ship-move">{ship.move}</p>
                    <p>{ship.note}</p>
                  </div>
                  <MovePattern
                    kind={ship.pattern}
                    label={`${ship.name} moves`}
                  />
                </article>
              ))}
            </div>
          </section>
        )}

        {panel === 'net' && (
          <section className="vra-panel" aria-labelledby={titleId}>
            <p className="vra-kicker">Sovereign Space · live board</p>
            <h1 id={titleId}>Sensor Net lab</h1>
            <p className="vra-lead">
              Blue and red are living coverage — not abstract terms. Amber dashed
              lines are Power Relay (same overlay as Options → Power relay): the hop
              chain from a selected ship back to its Hub. Step through how
              linking, dark Escorts, overlap, Target Lock, and Initiative Relay
              actually look.
            </p>
            <SensorNetLab />
          </section>
        )}

        {panel === 'emp' && (
          <section className="vra-panel" aria-labelledby={titleId}>
            <p className="vra-kicker">Command Overload</p>
            <h1 id={titleId}>EMP (midgame)</h1>
            <p className="vra-lead">
              Charge while your Hub stays put. Fire spends the whole turn and
              freezes enemy engines inside the blast — your fleet is never hit.
            </p>
            <div className="vra-net-row">
              <MovePattern
                kind="blast"
                label="EMP blast radius around the Hub"
              />
              <ul className="vra-net-points">
                <li>
                  <strong>Charge:</strong> non-Hub plies (default target 15).
                  Moving the Hub resets the meter.
                </li>
                <li>
                  <strong>Fire:</strong> full turn. Chebyshev radius 3
                  (lobby-tunable). Enemy engines seized for one of their
                  replies.
                </li>
                <li>
                  <strong>Lockout:</strong> if they then have zero legal moves,
                  you win. Bodies alone almost never freeze a live Hub — EMP is
                  the tool.
                </li>
                <li>
                  Lobby can change charge target, radius, and blackout length —
                  stock fleet defaults are what drills teach.
                </li>
              </ul>
            </div>
          </section>
        )}

        {panel === 'terminal' && (
          <section className="vra-panel" aria-labelledby={titleId}>
            <p className="vra-kicker">Lone Hub endgame</p>
            <h1 id={titleId}>Terminal Overclock</h1>
            <p className="vra-lead">
              When both fleets are reduced to lone Hubs, Escort vents seal. Hub
              moves charge EMP; firing fuses your own drives; the shared blast
              grows until kiting fails.
            </p>
            <ul className="vra-bullets">
              <li>
                <strong>Arm:</strong> shared Terminal phase when both sides are
                lone Hubs (charges reset; optional entry komi for the waiting
                seat).
              </li>
              <li>
                <strong>Charge:</strong> Hub steps (default target 3), not
                midgame non-Hub plies.
              </li>
              <li>
                <strong>Fire:</strong> Lockout if they sit in your disc — you
                also fuse. Miss-firing out of range is suicide geometry.
              </li>
              <li>
                <strong>Thermal runaway:</strong> blast radius +1 every 5 plies
                (cap = sector). Cyan disc = your range; magenta = overlapping
                discs.
              </li>
            </ul>
          </section>
        )}

        {panel === 'safety' && (
          <section className="vra-panel" aria-labelledby={titleId}>
            <p className="vra-kicker">Discipline</p>
            <h1 id={titleId}>Refuse the hang</h1>
            <p className="vra-lead">
              Your Hub is <strong>hanging</strong> when they can capture it next
              turn. The rules allow the blunder — Surgical Strike ends the game
              instantly if they take it.
            </p>
            <ul className="vra-bullets">
              <li>
                Never leave the Hub capturable while chasing material, net %, or
                a prepared Beam.
              </li>
              <li>
                If it already hangs: capture or block the threat before anything
                else.
              </li>
              <li>
                Same idea in Terminal: don’t fire EMP when they’re outside the
                cyan disc — you fuse yourself for nothing.
              </li>
            </ul>
          </section>
        )}

        {panel === 'arc' && (
          <section className="vra-panel" aria-labelledby={titleId}>
            <p className="vra-kicker">How a game feels</p>
            <h1 id={titleId}>The full arc</h1>
            <p className="vra-lead">
              Not a pure Go race and not pure chess — fleet tactics on a shifting
              net, with a late clock and a Terminal endgame.
            </p>
            <div className="vra-wins">
              {ARC.map((phase, i) => (
                <article key={phase.title} className="vra-win">
                  <span className="vra-win-n">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h2>{phase.title}</h2>
                  <p>{phase.copy}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {panel === 'minutiae' && (
          <section className="vra-panel" aria-labelledby={titleId}>
            <p className="vra-kicker">Named so you recognize them</p>
            <h1 id={titleId}>Minutiae & modules</h1>
            <p className="vra-lead">
              You don’t need every lobby dial memorized for game one — but you
              should know these words exist. Normative detail lives in the PDF.
            </p>
            <div className="vra-minutiae">
              {MINUTIAE.map((item) => (
                <article key={item.title}>
                  <h2>{item.title}</h2>
                  <p>{item.copy}</p>
                </article>
              ))}
            </div>
            <ul className="vra-doc-links">
              <li>
                <DocLink doc="manual">Introductory manual</DocLink>
              </li>
              <li>
                <DocLink doc="rules">Official rules (PDF)</DocLink>
              </li>
              <li>
                <DocLink doc="advanced">Advanced walkthrough</DocLink>
              </li>
              <li>
                <Link to="/story">Sector 11 briefing</Link>
              </li>
            </ul>
          </section>
        )}

        {panel === 'ready' && (
          <section
            className="vra-panel vra-panel--ready"
            aria-labelledby={titleId}
          >
            <p className="vra-kicker">First command</p>
            <h1 id={titleId}>Feel it on the board.</h1>
            <p className="vra-lead">
              You’ve seen the breadth. Next: highlighted drills (Before Game 1),
              then a local Fast AI match. Full Academy and puzzles can wait.
            </p>
            <div className="vra-ready-actions">
              <Link className="vra-primary" to="/drills">
                Before Game 1
              </Link>
              <Link className="vra-secondary" to="/play?local=1&ai=fast">
                First game · local Fast AI
              </Link>
              <Link className="vra-secondary" to="/tutorial">
                Full Fleet Academy
              </Link>
            </div>
          </section>
        )}
      </div>

      <nav className="vra-nav" aria-label="Rules panels">
        <button
          type="button"
          disabled={panelIndex === 0}
          onClick={() => setPanelIndex((i) => Math.max(0, i - 1))}
        >
          Back
        </button>
        <div className="vra-dots">
          {PANELS.map((id, index) => (
            <button
              key={id}
              type="button"
              className={index === panelIndex ? 'is-current' : ''}
              aria-label={PANEL_LABEL[id]}
              title={PANEL_LABEL[id]}
              aria-current={index === panelIndex ? 'step' : undefined}
              onClick={() => setPanelIndex(index)}
            />
          ))}
        </div>
        {panelIndex < PANELS.length - 1 ? (
          <button
            type="button"
            className="vra-primary"
            onClick={() =>
              setPanelIndex((i) => Math.min(PANELS.length - 1, i + 1))
            }
          >
            Next
          </button>
        ) : (
          <Link className="vra-primary" to="/drills">
            Before Game 1
          </Link>
        )}
      </nav>
    </main>
  );
}
