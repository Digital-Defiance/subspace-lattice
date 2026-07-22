/**
 * Versioned rules knobs for play, search, and evolution sims.
 * See docs/adr/001-hybrid-sensor-net.md and docs/adr/004-infiltrator-spool.md.
 */
import { RulesVersion } from '../interfaces/rulesVersion';

export type { RulesVersion };

export interface RulesConfig {
  version: RulesVersion;
  boardSize: number;
  /** Fraction of non-well coordinates for Sector Integration win (hybrid). */
  sectorIntegrationRatio: number;
  hubSensorRadius: number;
  escortSensorRadius: number;
  /** Max Chebyshev distance for piece-to-piece Sensor Net linking. */
  linkDistance: number;
  /**
   * Navigational Target Lock: Infiltrator warps take two turns
   * (announce destination, then execute). Hybrid-spool only by default.
   */
  infiltratorSpoolUp: boolean;
  /**
   * Integration Hold: Sector Integration only wins after coverage ≥ ratio has
   * persisted for this many consecutive plies (either side's). 0 = instant
   * win on the mover's ply (legacy behavior). Experimental Track A clock.
   */
  sectorHoldPlies: number;
  /**
   * Contested Space: cells covered by BOTH Sensor Nets count for neither
   * side's Sector Integration coverage. Gives direct counterplay against a
   * territorial clock (project into the enemy net to stall it). Experimental.
   */
  contestedCellsNeutral: boolean;
  /**
   * Late-game activation: Sector Integration cannot win (and Integration
   * Hold streaks do not tick) before this many completed plies. 0 = active
   * from the start (legacy behavior). Experimental Track A clock arming.
   */
  sectorActivationPly: number;
  /**
   * Initiative Relays: the first player begins with this many additional
   * forward Escorts. Experimental, player-visible compensation for first-seat
   * disadvantage. Missing/0 preserves the standard mirrored setup.
   */
  firstPlayerRelayCount?: number;
}

/** Pre-sim classic defaults (chess-like; Sensor Net ignored for movement). */
export const CLASSIC_RULES: RulesConfig = {
  version: 'classic',
  boardSize: 11,
  sectorIntegrationRatio: 0.51,
  hubSensorRadius: 2,
  escortSensorRadius: 1,
  linkDistance: 2,
  infiltratorSpoolUp: false,
  sectorHoldPlies: 0,
  contestedCellsNeutral: false,
  sectorActivationPly: 0,
  firstPlayerRelayCount: 0,
};

/**
 * Hybrid defaults promoted from sim human-gate (hub3 / esc1 / link2 / ρ0.45):
 * Sector Integration acts as an endgame clock (~25–40% of decided games).
 */
export const HYBRID_RULES: RulesConfig = {
  version: 'hybrid',
  boardSize: 11,
  sectorIntegrationRatio: 0.45,
  hubSensorRadius: 3,
  escortSensorRadius: 1,
  linkDistance: 2,
  infiltratorSpoolUp: false,
  sectorHoldPlies: 0,
  contestedCellsNeutral: false,
  sectorActivationPly: 0,
  firstPlayerRelayCount: 0,
};

/** Hybrid + Infiltrator Navigational Target Lock (A/B vs hybrid). */
export const HYBRID_SPOOL_RULES: RulesConfig = {
  ...HYBRID_RULES,
  version: 'hybrid-spool',
  infiltratorSpoolUp: true,
};

/**
 * Track A "v1.0-fleet" candidate — hybrid + Integration Hold 1 + Contested
 * Space + activation ply 100 + one Initiative Relay for White. Passed Track A
 * at production budget on 2026-07-21 (W 45% / B 55%, sector 30%, sep 13.3;
 * ADR 005 / 006). Soft-ship via `rulesVersion: 'hybrid-fleet'`.
 */
export const FLEET_V1_RULES: Partial<Omit<RulesConfig, 'version'>> = {
  sectorHoldPlies: 1,
  contestedCellsNeutral: true,
  sectorActivationPly: 100,
  firstPlayerRelayCount: 1,
};

/** Named rules version for the fleet candidate (persistable on GameState). */
export const HYBRID_FLEET_RULES: RulesConfig = {
  ...HYBRID_RULES,
  ...FLEET_V1_RULES,
  version: 'hybrid-fleet',
};

const BY_VERSION: Record<RulesVersion, RulesConfig> = {
  classic: CLASSIC_RULES,
  hybrid: HYBRID_RULES,
  'hybrid-spool': HYBRID_SPOOL_RULES,
  'hybrid-fleet': HYBRID_FLEET_RULES,
};

export function resolveRulesConfig(
  version: RulesVersion = 'classic',
  overrides: Partial<Omit<RulesConfig, 'version'>> = {},
): RulesConfig {
  const cleaned = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined),
  ) as Partial<Omit<RulesConfig, 'version'>>;
  return { ...BY_VERSION[version], ...cleaned, version };
}

export function isRulesVersion(value: unknown): value is RulesVersion {
  return (
    value === 'classic' ||
    value === 'hybrid' ||
    value === 'hybrid-spool' ||
    value === 'hybrid-fleet'
  );
}

/** Sensor-net movement / sector wins (not classic). */
export function usesSensorNet(version: RulesVersion): boolean {
  return (
    version === 'hybrid' ||
    version === 'hybrid-spool' ||
    version === 'hybrid-fleet'
  );
}
