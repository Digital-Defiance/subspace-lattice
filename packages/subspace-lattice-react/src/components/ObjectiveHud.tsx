import {
  PlayerColor,
  SubspaceLatticeEngine,
} from '@subspace-lattice/core';
import './ObjectiveHud.scss';

export interface ObjectiveHudProps {
  engine: SubspaceLatticeEngine;
  /** Expanded teaching copy for the academy. */
  explain?: boolean;
  /** Show live coverage while preventing the training position from ending. */
  paused?: boolean;
}

function percent(value: number): number {
  return Math.round(value * 100);
}

export function ObjectiveHud({
  engine,
  explain = false,
  paused = false,
}: ObjectiveHudProps) {
  const state = engine.getState();
  const rules = engine.getRules();
  const whiteCoverage = percent(engine.sectorControlRatio(PlayerColor.White));
  const blackCoverage = percent(engine.sectorControlRatio(PlayerColor.Black));
  const target = percent(rules.sectorIntegrationRatio);
  const ply = state.plyCount ?? 0;
  const activation = rules.sectorActivationPly ?? 0;
  const activationRemaining = Math.max(0, activation - ply);
  const armed = activationRemaining === 0;
  const hold = rules.sectorHoldPlies ?? 0;
  const whiteHold = state.sectorHoldProgress?.[PlayerColor.White] ?? 0;
  const blackHold = state.sectorHoldProgress?.[PlayerColor.Black] ?? 0;

  return (
    <section className="objective-hud" aria-label="Battle objectives">
      <div className="objective-hud__header">
        <div>
          <span className="objective-hud__eyebrow">Sector Integration</span>
          <strong>
            {paused
              ? `Training display · ${target}% controls the sector`
              : armed
              ? `Clock active · ${target}% controls the sector`
              : `Clock activates in ${activationRemaining} ${activationRemaining === 1 ? 'move' : 'moves'}`}
          </strong>
        </div>
        <span
          className={`objective-hud__status ${armed && !paused ? 'is-armed' : ''}`}
          data-testid="sector-clock-status"
        >
          {paused ? 'PAUSED' : armed ? 'ACTIVE' : `PLY ${ply}/${activation}`}
        </span>
      </div>

      <div className="objective-hud__sides">
        <Coverage
          color="white"
          label="Your fleet"
          value={whiteCoverage}
          target={target}
          hold={whiteHold}
          holdRequired={hold}
        />
        <Coverage
          color="black"
          label="Opposing fleet"
          value={blackCoverage}
          target={target}
          hold={blackHold}
          holdRequired={hold}
        />
      </div>

      {explain && (
        <p className="objective-hud__explanation">
          Linked ships project your Sensor Net. Reach the marker
          {hold > 0
            ? ` and keep it there for ${hold} consecutive ${hold === 1 ? 'move' : 'moves'}`
            : ''}
          {rules.contestedCellsNeutral
            ? '; space covered by both fleets counts for neither side.'
            : '.'}
        </p>
      )}
    </section>
  );
}

interface CoverageProps {
  color: 'white' | 'black';
  label: string;
  value: number;
  target: number;
  hold: number;
  holdRequired: number;
}

function Coverage({
  color,
  label,
  value,
  target,
  hold,
  holdRequired,
}: CoverageProps) {
  return (
    <div className={`objective-hud__side objective-hud__side--${color}`}>
      <div className="objective-hud__label">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div
        className="objective-hud__track"
        role="progressbar"
        aria-label={`${label} sector coverage`}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span
          className="objective-hud__fill"
          style={{ width: `${Math.min(value, 100)}%` }}
        />
        <span
          className="objective-hud__target"
          style={{ left: `${Math.min(target, 100)}%` }}
          aria-hidden="true"
        />
      </div>
      {holdRequired > 0 && (
        <small>
          Hold {Math.min(hold, holdRequired)}/{holdRequired}
        </small>
      )}
    </div>
  );
}
