import React from 'react';
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
          <h3>Overview</h3>
          <p>
            Subspace Lattice is a hybrid of territory control and piece agency
            on an 11×11 sector grid. Online and local AI soft-ship{' '}
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
              <strong>No moves:</strong> Opponent has no legal moves after your
              turn.
            </li>
          </ul>

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
          </ul>

          <h3>Full documents</h3>
          <ul className="rules-doc-links">
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
