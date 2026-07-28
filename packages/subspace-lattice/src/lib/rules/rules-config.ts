/**
 * Versioned rules knobs for play, search, and evolution sims.
 * See docs/adr/001-hybrid-sensor-net.md and docs/adr/004-infiltrator-spool.md.
 */
import { PieceType } from '../interfaces/pieceType';
import { RulesVersion } from '../interfaces/rulesVersion';

export type { RulesVersion };

/**
 * Optional heavy-unit Fleet Draft: which pair occupies the two wing slots
 * that default to Beams. Shipping default remains `standard` (2× Beam).
 * Experimental storyline / lobby module — never auto-promoted (ADR 002).
 */
export type HeavyUnitDraft =
  | 'standard'
  | 'refractor-pair'
  | 'refractor-beam'
  | 'carrier-beam'
  | 'refractor-carrier';

export const HEAVY_UNIT_DRAFTS: readonly HeavyUnitDraft[] = [
  'standard',
  'refractor-pair',
  'refractor-beam',
  'carrier-beam',
  'refractor-carrier',
] as const;

/** Resolve left/right heavy-unit types for a draft (left = lower file). */
export function heavyUnitTypesForDraft(
  draft: HeavyUnitDraft,
): [PieceType, PieceType] {
  switch (draft) {
    case 'refractor-pair':
      return [PieceType.Refractor, PieceType.Refractor];
    case 'refractor-beam':
      return [PieceType.Refractor, PieceType.Beam];
    case 'carrier-beam':
      return [PieceType.Carrier, PieceType.Beam];
    case 'refractor-carrier':
      return [PieceType.Refractor, PieceType.Carrier];
    case 'standard':
    default:
      return [PieceType.Beam, PieceType.Beam];
  }
}

export function isHeavyUnitDraft(value: unknown): value is HeavyUnitDraft {
  return (
    value === 'standard' ||
    value === 'refractor-pair' ||
    value === 'refractor-beam' ||
    value === 'carrier-beam' ||
    value === 'refractor-carrier'
  );
}

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
   * Infiltrators may not move until `plyCount >=` this value.
   * 0 = available from the opening (default / lobby “off”).
   */
  infiltratorActivationPly: number;
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
  /**
   * Fleet Draft heavy-unit roster for the two wing slots (default Beams).
   * Experimental add-on module / storyline — not shipping default.
   */
  heavyUnitDraft?: HeavyUnitDraft;
  /**
   * Carrier power-anchor mitigation: full queen-slide only while starting
   * the turn within the Command Hub's natural radiation radius
   * (`hubSensorRadius`). Outside that radius (and when not Target Locked),
   * the Carrier is limited to a single king-step. Experimental.
   */
  carrierRequiresHubAnchor?: boolean;
  /**
   * Files (x) for the two heavy-unit wing slots, low→high. Default `[2, 8]`.
   * Must be distinct integers in `[0, boardSize)`. Black mirrors on the far
   * rank. Used for setup search in the heavy-unit experiment.
   */
  heavyUnitFiles?: [number, number];
}

/**
 * Lobby-tunable subset of RulesConfig. Persisted on GameState.rulesOverrides
 * so online hydrate / submitMove can rebuild the same RulesConfig.
 */
export type HeavyWingPreset = 'standard' | 'refractor-wing' | 'fleet-draft';

export const HEAVY_WING_PRESETS: readonly HeavyWingPreset[] = [
  'standard',
  'refractor-wing',
  'fleet-draft',
] as const;

export function isHeavyWingPreset(value: unknown): value is HeavyWingPreset {
  return (
    value === 'standard' ||
    value === 'refractor-wing' ||
    value === 'fleet-draft'
  );
}

/** Map a lobby Heavy wing preset to RulesConfig knobs (draft / files / anchor). */
export function heavyWingPresetToRulesPartial(
  preset: HeavyWingPreset,
): Pick<
  RulesConfig,
  'heavyUnitDraft' | 'heavyUnitFiles' | 'carrierRequiresHubAnchor'
> {
  switch (preset) {
    case 'refractor-wing':
      return {
        heavyUnitDraft: 'refractor-beam',
        heavyUnitFiles: [3, 7],
        carrierRequiresHubAnchor: false,
      };
    case 'fleet-draft':
      return {
        heavyUnitDraft: 'refractor-carrier',
        heavyUnitFiles: [3, 7],
        carrierRequiresHubAnchor: true,
      };
    case 'standard':
    default:
      return {
        heavyUnitDraft: 'standard',
        heavyUnitFiles: [2, 8],
        carrierRequiresHubAnchor: false,
      };
  }
}

/** Reverse-map RulesConfig wing knobs to a lobby preset (best effort). */
export function heavyWingPresetFromRules(rules: RulesConfig): HeavyWingPreset {
  const draft = rules.heavyUnitDraft ?? 'standard';
  const [lo, hi] = rules.heavyUnitFiles ?? [2, 8];
  const files37 = lo === 3 && hi === 7;
  if (draft === 'refractor-beam' && files37 && !rules.carrierRequiresHubAnchor) {
    return 'refractor-wing';
  }
  if (
    draft === 'refractor-carrier' &&
    files37 &&
    Boolean(rules.carrierRequiresHubAnchor)
  ) {
    return 'fleet-draft';
  }
  return 'standard';
}

export type RulesLobbyOverrides = {
  infiltratorSpoolUp: boolean;
  infiltratorActivationPly: number;
  sectorActivationPly: number;
  /** Optional heavy-wing storyline preset (default Standard Beams). */
  heavyWingPreset: HeavyWingPreset;
};

/** Fleet defaults for the lobby knobs (hybrid-fleet preset). */
export const FLEET_LOBBY_DEFAULTS: RulesLobbyOverrides = {
  infiltratorSpoolUp: false,
  infiltratorActivationPly: 0,
  sectorActivationPly: 100,
  heavyWingPreset: 'standard',
};

const LOBBY_PLY_MAX = 400;

/** Extract lobby knobs from a full RulesConfig. */
export function lobbyOverridesFromRules(
  rules: RulesConfig,
): RulesLobbyOverrides {
  return {
    infiltratorSpoolUp: rules.infiltratorSpoolUp,
    infiltratorActivationPly: rules.infiltratorActivationPly,
    sectorActivationPly: rules.sectorActivationPly,
    heavyWingPreset: heavyWingPresetFromRules(rules),
  };
}

/** True when lobby knobs match shipping hybrid-fleet defaults. */
export function isDefaultFleetLobby(
  overrides: Partial<RulesLobbyOverrides> | undefined | null,
): boolean {
  const o = { ...FLEET_LOBBY_DEFAULTS, ...overrides };
  return (
    o.infiltratorSpoolUp === FLEET_LOBBY_DEFAULTS.infiltratorSpoolUp &&
    o.infiltratorActivationPly ===
      FLEET_LOBBY_DEFAULTS.infiltratorActivationPly &&
    o.sectorActivationPly === FLEET_LOBBY_DEFAULTS.sectorActivationPly &&
    o.heavyWingPreset === FLEET_LOBBY_DEFAULTS.heavyWingPreset
  );
}

/**
 * Sanitize untrusted lobby input (callable / UI). Unknown keys ignored;
 * out-of-range plies clamped. Returns only defined fields.
 */
export function sanitizeRulesLobbyOverrides(
  raw: unknown,
): Partial<RulesLobbyOverrides> {
  if (!raw || typeof raw !== 'object') return {};
  const input = raw as Record<string, unknown>;
  const out: Partial<RulesLobbyOverrides> = {};

  if (typeof input.infiltratorSpoolUp === 'boolean') {
    out.infiltratorSpoolUp = input.infiltratorSpoolUp;
  }

  if (
    typeof input.infiltratorActivationPly === 'number' &&
    Number.isFinite(input.infiltratorActivationPly)
  ) {
    out.infiltratorActivationPly = Math.max(
      0,
      Math.min(LOBBY_PLY_MAX, Math.floor(input.infiltratorActivationPly)),
    );
  }

  if (
    typeof input.sectorActivationPly === 'number' &&
    Number.isFinite(input.sectorActivationPly)
  ) {
    out.sectorActivationPly = Math.max(
      0,
      Math.min(LOBBY_PLY_MAX, Math.floor(input.sectorActivationPly)),
    );
  }

  if (isHeavyWingPreset(input.heavyWingPreset)) {
    out.heavyWingPreset = input.heavyWingPreset;
  }

  return out;
}

/**
 * Expand lobby overrides (including heavyWingPreset) into RulesConfig knobs
 * suitable for resolveRulesConfig. Strips the preset key itself.
 */
export function lobbyOverridesToRulesPartial(
  overrides: Partial<RulesLobbyOverrides> | unknown = {},
): Partial<Omit<RulesConfig, 'version'>> {
  const lobby = {
    ...FLEET_LOBBY_DEFAULTS,
    ...sanitizeRulesLobbyOverrides(overrides),
  };
  return {
    infiltratorSpoolUp: lobby.infiltratorSpoolUp,
    infiltratorActivationPly: lobby.infiltratorActivationPly,
    sectorActivationPly: lobby.sectorActivationPly,
    ...heavyWingPresetToRulesPartial(lobby.heavyWingPreset),
  };
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
  infiltratorActivationPly: 0,
  sectorHoldPlies: 0,
  contestedCellsNeutral: false,
  sectorActivationPly: 0,
  firstPlayerRelayCount: 0,
  heavyUnitDraft: 'standard',
  carrierRequiresHubAnchor: false,
  heavyUnitFiles: [2, 8],
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
  infiltratorActivationPly: 0,
  sectorHoldPlies: 0,
  contestedCellsNeutral: false,
  sectorActivationPly: 0,
  firstPlayerRelayCount: 0,
  heavyUnitDraft: 'standard',
  carrierRequiresHubAnchor: false,
  heavyUnitFiles: [2, 8],
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
 * ADR 005 / 006). Ships as default via `rulesVersion: 'hybrid-fleet'`.
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
  overrides: Partial<Omit<RulesConfig, 'version'>> & {
    heavyWingPreset?: HeavyWingPreset;
  } = {},
): RulesConfig {
  const { heavyWingPreset, ...rest } = overrides;
  const cleaned = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  ) as Partial<Omit<RulesConfig, 'version'>>;
  const wing =
    heavyWingPreset !== undefined
      ? heavyWingPresetToRulesPartial(heavyWingPreset)
      : {};
  // Wing preset first; explicit RulesConfig knobs (sims) still win.
  return { ...BY_VERSION[version], ...wing, ...cleaned, version };
}

/** Shipping hybrid-fleet RulesConfig with optional lobby knobs applied. */
export function resolveFleetLobbyRules(
  overrides: Partial<RulesLobbyOverrides> | unknown = {},
): RulesConfig {
  return resolveRulesConfig('hybrid-fleet', lobbyOverridesToRulesPartial(overrides));
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
