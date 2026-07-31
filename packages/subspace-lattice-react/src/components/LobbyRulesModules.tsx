import { useState } from 'react';
import {
  EMP_BLACKOUT_PLIES_MAX,
  TERMINAL_EMP_RADIUS_GROWTH_INTERVALS,
  type HeavyWingPreset,
  type TerminalEmpRadiusGrowthInterval,
} from '@subspace-lattice/core';
import {
  DEFAULT_LOBBY_RULES,
  lobbyRulesAreDefault,
  type LobbyRulesOptions,
} from '../lib/lobby-rules';

const HEAVY_WING_HINTS: Record<HeavyWingPreset, string> = {
  standard: 'Twin Lattice Dreadnoughts on files 2 & 8 (Rated default).',
  'refractor-wing': 'Beam + Refractor on files 3 & 7 (Unrated).',
  'fleet-draft':
    'Refractor + Hub-anchored Carrier on files 3 & 7 (Unrated).',
};

export interface LobbyRulesModulesProps {
  value: LobbyRulesOptions;
  onChange: (next: LobbyRulesOptions) => void;
  /** Extra class on the fieldset (e.g. pass-setup modules). */
  className?: string;
  /** Show the casual/unrated warning when modules differ from stock. Default true. */
  showUnratedWarn?: boolean;
  idPrefix?: string;
}

export function LobbyRulesModules({
  value,
  onChange,
  className = 'lobby-modules',
  showUnratedWarn = true,
  idPrefix = 'lobby',
}: LobbyRulesModulesProps) {
  const [showMore, setShowMore] = useState(false);
  const patch = (partial: Partial<LobbyRulesOptions>) => {
    onChange({ ...value, ...partial });
  };
  const customModules = !lobbyRulesAreDefault(value);
  const moreId = `${idPrefix}-modules-more`;

  return (
    <fieldset
      className={className}
      data-testid="lobby-rules-modules"
    >
      <legend>Advanced modules</legend>
      <div className="form-group checkbox">
        <label>
          <input
            type="checkbox"
            checked={value.infiltratorSpoolUp}
            onChange={(e) => patch({ infiltratorSpoolUp: e.target.checked })}
            data-testid="lobby-infiltrator-spool"
          />
          Infiltrator spool (announce warp, execute next turn)
        </label>
      </div>
      <div className="form-group">
        <label htmlFor={`${idPrefix}-heavy-wing`}>Heavy wing</label>
        <select
          id={`${idPrefix}-heavy-wing`}
          value={value.heavyWingPreset}
          onChange={(e) =>
            patch({ heavyWingPreset: e.target.value as HeavyWingPreset })
          }
          data-testid="lobby-heavy-wing"
        >
          <option value="standard">Standard Beams</option>
          <option value="refractor-wing">Refractor Wing</option>
          <option value="fleet-draft">Fleet Draft</option>
        </select>
        <p className="lobby-module-hint">
          {HEAVY_WING_HINTS[value.heavyWingPreset]}
        </p>
      </div>

      <button
        type="button"
        className="lobby-modules-more-toggle"
        aria-expanded={showMore}
        aria-controls={moreId}
        data-testid="lobby-modules-more-toggle"
        onClick={() => setShowMore((open) => !open)}
      >
        {showMore ? 'Hide clock & EMP options' : 'Show clock & EMP options'}
      </button>

      {showMore && (
        <div
          id={moreId}
          className="lobby-modules-more"
          data-testid="lobby-modules-more"
        >
          <div className="form-group">
            <label htmlFor={`${idPrefix}-infil-unlock`}>
              Infiltrators unlock after (plies)
            </label>
            <input
              id={`${idPrefix}-infil-unlock`}
              type="number"
              min={0}
              max={400}
              step={1}
              value={value.infiltratorActivationPly}
              onChange={(e) => {
                const n = Number(e.target.value);
                patch({
                  infiltratorActivationPly: Number.isFinite(n)
                    ? Math.max(0, Math.floor(n))
                    : 0,
                });
              }}
              data-testid="lobby-infiltrator-activation"
            />
            <p className="lobby-module-hint">0 = available from the opening.</p>
          </div>
          <div className="form-group">
            <label htmlFor={`${idPrefix}-clock-arm`}>
              Sector clock arms at ply
            </label>
            <input
              id={`${idPrefix}-clock-arm`}
              type="number"
              min={0}
              max={400}
              step={1}
              value={value.sectorActivationPly}
              onChange={(e) => {
                const n = Number(e.target.value);
                patch({
                  sectorActivationPly: Number.isFinite(n)
                    ? Math.max(0, Math.floor(n))
                    : DEFAULT_LOBBY_RULES.sectorActivationPly,
                });
              }}
              data-testid="lobby-sector-activation"
            />
            <p className="lobby-module-hint">
              Fleet default is {DEFAULT_LOBBY_RULES.sectorActivationPly}. 0 =
              armed from the start.
            </p>
          </div>
          <div className="form-group">
            <label htmlFor={`${idPrefix}-emp-radius`}>
              EMP radius (Chebyshev)
            </label>
            <input
              id={`${idPrefix}-emp-radius`}
              type="number"
              min={0}
              max={5}
              step={1}
              value={value.empRadius}
              onChange={(e) => {
                const n = Number(e.target.value);
                patch({
                  empRadius: Number.isFinite(n)
                    ? Math.max(0, Math.min(5, Math.floor(n)))
                    : DEFAULT_LOBBY_RULES.empRadius,
                });
              }}
              data-testid="lobby-emp-radius"
            />
            <p className="lobby-module-hint">
              Fleet default {DEFAULT_LOBBY_RULES.empRadius}. 0 disables EMP (with
              charge target 0).
            </p>
          </div>
          <div className="form-group">
            <label htmlFor={`${idPrefix}-emp-charge`}>
              EMP charge target (plies)
            </label>
            <input
              id={`${idPrefix}-emp-charge`}
              type="number"
              min={0}
              max={400}
              step={1}
              value={value.empChargeTarget}
              onChange={(e) => {
                const n = Number(e.target.value);
                patch({
                  empChargeTarget: Number.isFinite(n)
                    ? Math.max(0, Math.floor(n))
                    : DEFAULT_LOBBY_RULES.empChargeTarget,
                });
              }}
              data-testid="lobby-emp-charge"
            />
            <p className="lobby-module-hint">
              Non-Hub plies with a stationary Hub to arm Command Overload. Fleet
              default {DEFAULT_LOBBY_RULES.empChargeTarget}.
            </p>
          </div>
          <div className="form-group">
            <label htmlFor={`${idPrefix}-emp-blackout`}>
              EMP blackout (reply plies)
            </label>
            <input
              id={`${idPrefix}-emp-blackout`}
              type="number"
              min={1}
              max={EMP_BLACKOUT_PLIES_MAX}
              step={1}
              value={value.empBlackoutPlies}
              onChange={(e) => {
                const n = Number(e.target.value);
                patch({
                  empBlackoutPlies: Number.isFinite(n)
                    ? Math.max(
                        1,
                        Math.min(EMP_BLACKOUT_PLIES_MAX, Math.floor(n)),
                      )
                    : DEFAULT_LOBBY_RULES.empBlackoutPlies,
                });
              }}
              data-testid="lobby-emp-blackout"
            />
            <p className="lobby-module-hint">
              How many of the enemy&apos;s own turns stay frozen before engines
              restart. Fleet default {DEFAULT_LOBBY_RULES.empBlackoutPlies}.
            </p>
          </div>
          <div className="form-group">
            <label htmlFor={`${idPrefix}-terminal-growth`}>
              Terminal Overclock radiation (plies per +1 blast)
            </label>
            <select
              id={`${idPrefix}-terminal-growth`}
              value={value.terminalEmpRadiusGrowthInterval}
              onChange={(e) =>
                patch({
                  terminalEmpRadiusGrowthInterval: Number(
                    e.target.value,
                  ) as TerminalEmpRadiusGrowthInterval,
                })
              }
              data-testid="lobby-terminal-growth"
            >
              {TERMINAL_EMP_RADIUS_GROWTH_INTERVALS.map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === DEFAULT_LOBBY_RULES.terminalEmpRadiusGrowthInterval
                    ? ' (fleet default)'
                    : ''}
                </option>
              ))}
            </select>
            <p className="lobby-module-hint">
              When both Hubs are alone, EMP blast grows +1 every N plies (cap
              10). Lower = faster thermal runaway; higher = longer hunt.
            </p>
          </div>
        </div>
      )}

      {showUnratedWarn && customModules && (
        <p className="lobby-module-warn" data-testid="lobby-modules-unrated">
          Custom modules play casual — rated TEI stays on stock fleet rules.
        </p>
      )}
    </fieldset>
  );
}
