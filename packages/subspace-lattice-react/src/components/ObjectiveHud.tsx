import {
  PlayerColor,
  SubspaceLatticeEngine,
} from '@subspace-lattice/core';
import type { ReactNode } from 'react';
import './ObjectiveHud.scss';

export interface ObjectiveHudProps {
  engine: SubspaceLatticeEngine;
  /** Expanded teaching copy for the academy. */
  explain?: boolean;
  /** Show live coverage while preventing the training position from ending. */
  paused?: boolean;
  /** When set, shows a Fire EMP control if Command Overload is enabled. */
  onFireEmp?: () => void;
  /** Whether the seated player may fire EMP this turn. */
  canFireEmpAction?: boolean;
  /**
   * Match concede control (armed confirm). Renders bottom-right on the EMP
   * action row — quiet opposite of Fire EMP.
   */
  resignControl?: ReactNode;
}

function percent(value: number): number {
  return Math.round(value * 100);
}

export function ObjectiveHud({
  engine,
  explain = false,
  paused = false,
  onFireEmp,
  canFireEmpAction = false,
  resignControl,
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
  const infilUnlock = rules.infiltratorActivationPly ?? 0;
  const infilRemaining = Math.max(0, infilUnlock - ply);
  const infilLocked = infilUnlock > 0 && infilRemaining > 0;
  const empOn =
    (rules.empChargeTarget ?? 0) > 0 && (rules.empRadius ?? 0) > 0;
  const whiteEmpTarget = engine.getEmpChargeTarget(PlayerColor.White);
  const blackEmpTarget = engine.getEmpChargeTarget(PlayerColor.Black);
  const empTarget = engine.getEmpChargeTarget();
  const whiteEmp = state.empCharge?.[PlayerColor.White] ?? 0;
  const blackEmp = state.empCharge?.[PlayerColor.Black] ?? 0;
  const empRadiusNow = engine.getEmpRadius();
  const terminalLive =
    engine.isTerminalOverclock(PlayerColor.White) ||
    engine.isTerminalOverclock(PlayerColor.Black);
  const growthEvery = rules.terminalEmpRadiusGrowthInterval ?? 0;
  const empArmed =
    empOn &&
    ((state.currentPlayer === PlayerColor.White
      ? whiteEmp
      : blackEmp) >= empTarget);

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

      {(empOn || resignControl) && (
        <div className="objective-hud__emp" data-testid="emp-charge-status">
          {empOn && (
            <p className="objective-hud__explanation">
              {terminalLive ? 'Terminal Overclock · ' : ''}
              EMP charge W {Math.min(whiteEmp, whiteEmpTarget)}/{whiteEmpTarget} ·
              B {Math.min(blackEmp, blackEmpTarget)}/{blackEmpTarget}
              {empArmed ? ' · armed' : ''}
              {state.empActive
                ? ` · blackout: ${
                    state.empActive.targetSide === PlayerColor.White
                      ? 'White'
                      : 'Black'
                  } engines seized in r=${state.empActive.radius} (${
                    state.empActive.pliesRemaining
                  } ply left)`
                : ''}
              {` · blast r=${empRadiusNow}`}
              {terminalLive && growthEvery > 0
                ? ` · radiation +1 / ${growthEvery} plies`
                : ''}
            </p>
          )}
          {(onFireEmp && canFireEmpAction && !state.winner) || resignControl ? (
            <div className="objective-hud__actions">
              {onFireEmp && canFireEmpAction && !state.winner ? (
                <button
                  type="button"
                  className="objective-hud__emp-btn"
                  disabled={!engine.canFireEmp()}
                  onClick={onFireEmp}
                  data-testid="fire-emp"
                >
                  Fire EMP ({Math.min(
                    state.currentPlayer === PlayerColor.White
                      ? whiteEmp
                      : blackEmp,
                    empTarget,
                  )}
                  /{empTarget})
                </button>
              ) : (
                <span className="objective-hud__actions-spacer" />
              )}
              {resignControl ? (
                <div className="objective-hud__resign">{resignControl}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {explain && (
        <p className="objective-hud__explanation">
          Linked ships project your Sensor Net. Reach the marker
          {hold > 0
            ? ` and keep it there for ${hold} consecutive ${hold === 1 ? 'move' : 'moves'}`
            : ''}
          {rules.contestedCellsNeutral
            ? '; space covered by both fleets counts for neither side.'
            : '.'}
          {infilLocked
            ? ` Infiltrators unlock in ${infilRemaining} ${infilRemaining === 1 ? 'move' : 'moves'}.`
            : ''}
          {rules.infiltratorSpoolUp
            ? ' Infiltrator warps spool: announce, then execute next turn.'
            : ''}
        </p>
      )}
      {!explain && (infilLocked || rules.infiltratorSpoolUp) && (
        <p className="objective-hud__explanation" data-testid="infil-module-status">
          {infilLocked
            ? `Infiltrators unlock in ${infilRemaining} ${infilRemaining === 1 ? 'move' : 'moves'}.`
            : null}
          {infilLocked && rules.infiltratorSpoolUp ? ' ' : null}
          {rules.infiltratorSpoolUp ? 'Infiltrator spool armed.' : null}
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
