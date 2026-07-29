import React from 'react';
import { Link } from 'react-router-dom';
import { DocLink } from './DocLink';
import './RulesDialog.scss';

interface RulesDialogProps {
  onClose: () => void;
}

export const RulesDialog: React.FC<RulesDialogProps> = ({ onClose }) => {
  return (
    <div className="rules-overlay" onClick={onClose}>
      <div className="rules-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>
          &times;
        </button>
        <h2>Subspace Lattice Rules</h2>

        <div className="rules-content">
          <aside className="rules-story-briefing">
            <p className="rules-story-eyebrow">Sector 11 · Story briefing</p>
            <strong>Nothing beyond your formation is mapped.</strong>
            <p>
              Your Hub anchors a living signal network. Escorts carry it into
              the dark; Beams fire through it; hostile glow Target Locks
              everything it catches.
            </p>
            <Link to="/story" onClick={onClose}>
              Read the story behind the board →
            </Link>
          </aside>

          <h3>Overview</h3>
          <p>
            Subspace Lattice is a hybrid of territory control and piece agency
            on an 11×11 sector grid. Online and local AI use{' '}
            <strong>hybrid-fleet</strong> (Sensor Net + sector clock + Initiative
            Relay). Legacy <strong>hybrid</strong> / <strong>classic</strong>{' '}
            remain for sims.
          </p>

          <h3>Victory Conditions</h3>
          <ul>
            <li>
              <strong>Surgical Strike:</strong> Capture the enemy Command Hub
              (♚/♔).
            </li>
            <li>
              <strong>Sector Integration:</strong> Cover ≥45% of non–gravity-well
              cells with your Sensor Net. Under fleet rules the clock arms at ply
              100, contested overlap counts for neither side, and coverage must
              hold for 1 ply.
            </li>
            <li>
              <strong>Lockout:</strong> Opponent has no legal moves after your
              turn. Bodies alone almost never freeze a live Hub — use Command
              Overload (EMP) below.
            </li>
            <li>
              <strong>Resign:</strong> Concede; the opponent wins immediately.
            </li>
          </ul>

          <h3>Command Overload (EMP)</h3>
          <p>
            Fleet default: charge on non-Hub plies while your Hub stays put
            (target 15). Moving the Hub resets charge. Firing spends your whole
            turn and seizes <em>enemy</em> engines within Chebyshev radius 3 of
            your Hub for one of their replies (lobby-tunable). Your own fleet is
            never in the blast. If they then have zero legal moves, you win by
            Lockout.
          </p>

          <h3>Hub safety (“refuse the hang”)</h3>
          <p>
            Your Command Hub is <strong>hanging</strong> when the opponent can
            capture it on their next turn. The rules allow you to leave it
            exposed — but if they take it, you lose immediately by Surgical
            Strike. <strong>Refuse the hang</strong> means: never leave the Hub
            capturable, and if it already is, capture or block the threat before
            you chase material, nets, or your own prepared shot.
          </p>

          <h3>The Board</h3>
          <p>
            The central <strong>Gravity Well</strong> cannot be occupied or
            traversed (blocker only). White begins with one forward{' '}
            <strong>Initiative Relay</strong> Escort as seat compensation.
          </p>

          <h3>Sensor Net</h3>
          <p>
            Your Command Hub radiates a net (radius 3). Escorts that are{' '}
            <em>linked</em> to the hub (through friendly pieces within 2 spaces)
            radiate radius 1. Linked coverage is your Sovereign Space. An Escort
            more than two spaces from the connected chain is dark — it does not
            expand the net until the relay reconnects.
          </p>
          <p>
            Enemy pieces standing in your net are{' '}
            <strong>Target Locked</strong> — their special systems are
            suppressed and they may only step 1 square orthogonally.
          </p>

          <h3>The Pieces & Movement</h3>
          <ul>
            <li>
              <strong>Command Hub (♚/♔):</strong> Moves 1 space any direction
              (orthogonal only if Target Locked).
            </li>
            <li>
              <strong>Escorts (♟/♙):</strong> Move 1 space orthogonally; relay
              the Sensor Net when linked.
            </li>
            <li>
              <strong>Infiltrators (♞/♘):</strong> Warp to any square that is
              empty or enemy-occupied and <em>not</em> inside the enemy Sensor
              Net. Experimental <strong>hybrid-spool</strong> requires a
              Navigational Target Lock (announce one turn, jump the next).
            </li>
            <li>
              <strong>Beams (♜/♖):</strong> Rook-like orthogonal slides, but
              only through your own Sensor Net.
            </li>
            <li>
              <strong>Refractor (♝/♗):</strong> Executes diagonal slides, but
              its entire path must remain inside your active Sensor Net.
              Optional — see Heavy wings below.
            </li>
            <li>
              <strong>Carrier (♛/♕):</strong> Combines Beam and Refractor
              movement under the same net law. Under Fleet Draft, full slides
              require starting the turn inside your Hub’s radiation radius;
              outside that tether, it moves one step in any direction.
              Optional.
            </li>
          </ul>

          <h3>Optional heavy wings</h3>
          <p>
            The standard hybrid-fleet opens with two Beams on files 2 and 8.
            Advanced lobby modules can authorize alternative heavy deployments
            (unrated online):
          </p>
          <ul>
            <li>
              <strong>Refractor Wing:</strong> Deploys one Beam and one
              Refractor on files 3 and 7. Retain your orthogonal artillery
              while adding a diagonal threat perfectly positioned within the
              opening net.
            </li>
            <li>
              <strong>Fleet Draft:</strong> Deploys a Refractor and a Carrier
              on files 3 and 7. The Carrier is Hub-anchored: it must begin its
              turn inside the Hub's radiation to execute a full slide,
              otherwise it crawls one step.
            </li>
          </ul>
          <p>
            <em>
              Note: Target Lock still reduces both the Refractor and Carrier
              to a single orthogonal step.
            </em>
          </p>

          <h3>Full documents</h3>
          <ul className="rules-doc-links">
            <li>
              <Link to="/story" onClick={onClose}>
                Sector 11 briefing
              </Link>{' '}
              — illustrated story page; also available as{' '}
              <DocLink doc="story">plain Markdown</DocLink>.
            </li>
            <li>
              <DocLink doc="manual">Introductory manual</DocLink>{' '}
              — shorter walkthrough for new commanders.
            </li>
            <li>
              <DocLink doc="rules">Official rules (PDF)</DocLink>{' '}
              — normative reference for serious play.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
