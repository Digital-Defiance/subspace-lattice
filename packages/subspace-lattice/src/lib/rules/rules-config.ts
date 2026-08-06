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
  /**
   * Command Overload (EMP): Chebyshev radius from the firing Hub. Enemy pieces
   * inside cannot move or capture while the blackout lasts. 0 disables EMP
   * together with empChargeTarget === 0.
   */
  empRadius: number;
  /**
   * Non-Hub plies with a stationary Hub required to arm EMP. Moving the Hub
   * or firing resets charge to 0. 0 disables EMP.
   */
  empChargeTarget: number;
  /**
   * Enemy reply plies the blackout survives (recovery time). 1 = frozen for a
   * single reply. Clamped to `EMP_BLACKOUT_PLIES_MAX`.
   */
  empBlackoutPlies: number;
  /**
   * Terminal Overclock: when a side is reduced to a lone Command Hub, Hub moves
   * charge EMP (+1) instead of resetting, and firing fuses the firer's drives.
   * Off when EMP is disabled. Default true on hybrid-fleet.
   */
  terminalOverclock: boolean;
  /**
   * If true, Terminal only arms when **both** sides are lone Hubs.
   * Prevents a depleted fleet from Overclocking while the opponent still has ships.
   * (Probe dial 1 — KEEP.)
   */
  terminalRequiresBothLone: boolean;
  /**
   * If true, the first ply on which both sides are lone Hubs starts a shared
   * Terminal phase: both EMP charges reset to 0 so an early lone Hub cannot
   * bank charge before the opponent joins Phase 3. (Probe dial 2 — KEEP.)
   */
  terminalSharedPhaseClock: boolean;
  /**
   * When the shared Terminal phase arms, give this much charge to the side
   * that is **not** about to move. Probe dial 3 at 1 over-corrected Heuristic
   * seat bias (W~97%→~2.5%); shipping keeps 0.
   */
  terminalPhaseEntryKomi: number;
  /**
   * Optional EMP charge target while in Terminal Overclock. `undefined` / omit
   * → use `empChargeTarget`. Probe / balance dial (suggested ~10).
   */
  terminalEmpChargeTarget?: number;
  /**
   * Optional base blast radius while firing in Terminal Overclock. `undefined` /
   * omit → use `empRadius`. Growth (below) stacks on this base.
   */
  terminalEmpRadius?: number;
  /**
   * Shared Terminal age: every this many completed plies since the phase armed,
   * Terminal EMP blast radius grows +1 (thermal runaway). 0 disables growth.
   * Shipping fleet default **5** (~15 plies to r=6 kite-break; ~35 to board max).
   */
  terminalEmpRadiusGrowthInterval: number;
  /**
   * Cap on growing Terminal EMP radius (Chebyshev). Board max useful is 10
   * (corner↔corner on 11×11).
   */
  terminalEmpRadiusMax: number;
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

/**
 * Allowed lobby values for Terminal EMP radius growth interval (plies per +1).
 * All integers in 3–10 are valid; denser ladder lets captains tune hunt length.
 */
export const TERMINAL_EMP_RADIUS_GROWTH_INTERVALS = [
  3, 4, 5, 6, 7, 8, 9, 10,
] as const;

export type TerminalEmpRadiusGrowthInterval =
  (typeof TERMINAL_EMP_RADIUS_GROWTH_INTERVALS)[number];

export function isTerminalEmpRadiusGrowthInterval(
  value: unknown,
): value is TerminalEmpRadiusGrowthInterval {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (TERMINAL_EMP_RADIUS_GROWTH_INTERVALS as readonly number[]).includes(value)
  );
}

/** Lobby-tunable Sector Integration coverage (exclusive net / controllable cells). */
export const SECTOR_INTEGRATION_RATIO_MIN = 0.35;
export const SECTOR_INTEGRATION_RATIO_MAX = 0.7;

export type RulesLobbyOverrides = {
  infiltratorSpoolUp: boolean;
  infiltratorActivationPly: number;
  sectorActivationPly: number;
  /**
   * Exclusive Sensor Net fraction required for Sector Integration.
   * Fleet default 0.45 (Track A evolve). Higher makes territorial wins rarer.
   */
  sectorIntegrationRatio: number;
  /** Optional heavy-wing storyline preset (default Standard Beams). */
  heavyWingPreset: HeavyWingPreset;
  /** EMP blast radius (Chebyshev). 0 = off. Max 5. */
  empRadius: number;
  /** Plies to arm EMP with a stationary Hub. 0 = off. */
  empChargeTarget: number;
  /** Enemy reply plies the blackout lasts. Min 1, max 3. */
  empBlackoutPlies: number;
  /**
   * Terminal Overclock thermal runaway: plies per +1 blast radius (3–10).
   * Fleet default 5.
   */
  terminalEmpRadiusGrowthInterval: TerminalEmpRadiusGrowthInterval;
};

/** Fleet defaults for the lobby knobs (hybrid-fleet preset). */
export const FLEET_LOBBY_DEFAULTS: RulesLobbyOverrides = {
  infiltratorSpoolUp: false,
  infiltratorActivationPly: 0,
  sectorActivationPly: 100,
  /** Track A evolve ρ0.45 — ≥0.51 nearly removes Sector Integration wins. */
  sectorIntegrationRatio: 0.45,
  heavyWingPreset: 'standard',
  // EMP balance probe 2026-07-29 (enemy-only blast): r=3 keeps Lockout ~1.7% of
  // HvR games with Strike at ~98%; r=4 floods. Blackout length is flavour, not
  // balance. See docs/lockout-impossibility.md §9.
  // Terminal Overclock (lone Hub): see docs/terminal-overclock.md — probe shows
  // strong first-mover / lone-Hub bias under Heuristic; keep knobs tunable.
  empRadius: 3,
  empChargeTarget: 15,
  empBlackoutPlies: 1,
  terminalEmpRadiusGrowthInterval: 5,
};

const EMP_RADIUS_MAX = 5;

export const EMP_BLACKOUT_PLIES_MAX = 3;

const LOBBY_PLY_MAX = 400;

/** Extract lobby knobs from a full RulesConfig. */
export function lobbyOverridesFromRules(
  rules: RulesConfig,
): RulesLobbyOverrides {
  return {
    infiltratorSpoolUp: rules.infiltratorSpoolUp,
    infiltratorActivationPly: rules.infiltratorActivationPly,
    sectorActivationPly: rules.sectorActivationPly,
    sectorIntegrationRatio: rules.sectorIntegrationRatio,
    heavyWingPreset: heavyWingPresetFromRules(rules),
    empRadius: rules.empRadius,
    empChargeTarget: rules.empChargeTarget,
    empBlackoutPlies: rules.empBlackoutPlies,
    terminalEmpRadiusGrowthInterval: isTerminalEmpRadiusGrowthInterval(
      rules.terminalEmpRadiusGrowthInterval,
    )
      ? rules.terminalEmpRadiusGrowthInterval
      : FLEET_LOBBY_DEFAULTS.terminalEmpRadiusGrowthInterval,
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
    o.sectorIntegrationRatio === FLEET_LOBBY_DEFAULTS.sectorIntegrationRatio &&
    o.heavyWingPreset === FLEET_LOBBY_DEFAULTS.heavyWingPreset &&
    o.empRadius === FLEET_LOBBY_DEFAULTS.empRadius &&
    o.empChargeTarget === FLEET_LOBBY_DEFAULTS.empChargeTarget &&
    o.empBlackoutPlies === FLEET_LOBBY_DEFAULTS.empBlackoutPlies &&
    o.terminalEmpRadiusGrowthInterval ===
      FLEET_LOBBY_DEFAULTS.terminalEmpRadiusGrowthInterval
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

  if (
    typeof input.sectorIntegrationRatio === 'number' &&
    Number.isFinite(input.sectorIntegrationRatio)
  ) {
    // Accept either a ratio (0.45) or a whole-number percent (45).
    let ratio = input.sectorIntegrationRatio;
    if (ratio > 1) ratio = ratio / 100;
    out.sectorIntegrationRatio =
      Math.round(
        Math.max(
          SECTOR_INTEGRATION_RATIO_MIN,
          Math.min(SECTOR_INTEGRATION_RATIO_MAX, ratio),
        ) * 100,
      ) / 100;
  }

  if (isHeavyWingPreset(input.heavyWingPreset)) {
    out.heavyWingPreset = input.heavyWingPreset;
  }

  if (
    typeof input.empRadius === 'number' &&
    Number.isFinite(input.empRadius)
  ) {
    out.empRadius = Math.max(
      0,
      Math.min(EMP_RADIUS_MAX, Math.floor(input.empRadius)),
    );
  }

  if (
    typeof input.empChargeTarget === 'number' &&
    Number.isFinite(input.empChargeTarget)
  ) {
    out.empChargeTarget = Math.max(
      0,
      Math.min(LOBBY_PLY_MAX, Math.floor(input.empChargeTarget)),
    );
  }

  if (
    typeof input.empBlackoutPlies === 'number' &&
    Number.isFinite(input.empBlackoutPlies)
  ) {
    out.empBlackoutPlies = Math.max(
      1,
      Math.min(EMP_BLACKOUT_PLIES_MAX, Math.floor(input.empBlackoutPlies)),
    );
  }

  if (typeof input.terminalEmpRadiusGrowthInterval === 'number') {
    const n = Math.floor(input.terminalEmpRadiusGrowthInterval);
    if (isTerminalEmpRadiusGrowthInterval(n)) {
      out.terminalEmpRadiusGrowthInterval = n;
    }
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
    sectorIntegrationRatio: lobby.sectorIntegrationRatio,
    empRadius: lobby.empRadius,
    empChargeTarget: lobby.empChargeTarget,
    empBlackoutPlies: lobby.empBlackoutPlies,
    terminalEmpRadiusGrowthInterval: lobby.terminalEmpRadiusGrowthInterval,
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
  empRadius: 0,
  empChargeTarget: 0,
  empBlackoutPlies: 1,
  terminalOverclock: false,
  terminalRequiresBothLone: false,
  terminalSharedPhaseClock: false,
  terminalPhaseEntryKomi: 0,
  terminalEmpRadiusGrowthInterval: 0,
  terminalEmpRadiusMax: 10,
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
  empRadius: 0,
  empChargeTarget: 0,
  empBlackoutPlies: 1,
  terminalOverclock: false,
  terminalRequiresBothLone: false,
  terminalSharedPhaseClock: false,
  terminalPhaseEntryKomi: 0,
  terminalEmpRadiusGrowthInterval: 0,
  terminalEmpRadiusMax: 10,
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
  empRadius: FLEET_LOBBY_DEFAULTS.empRadius,
  empChargeTarget: FLEET_LOBBY_DEFAULTS.empChargeTarget,
  empBlackoutPlies: FLEET_LOBBY_DEFAULTS.empBlackoutPlies,
  /** Lone-Hub Phase 3: Hub moves charge; Terminal fire fuses own drives. */
  terminalOverclock: true,
  /** Both fleets must be lone Hubs — no Overclock while opponent still has ships. */
  terminalRequiresBothLone: true,
  /** Entering both-lone resets both charges (no banked head start). */
  terminalSharedPhaseClock: true,
  /**
   * Entry komi over-corrected Heuristic hubs-only (W~97% → ~2.5% at komi=1).
   * Keep 0 until a fairer tempo rule is found; see terminal-overclock probe.
   */
  terminalPhaseEntryKomi: 0,
  /** Shorter arming than multi-ship EMP so the hunt finishes inside ply budgets. */
  terminalEmpChargeTarget: 10,
  /**
   * Thermal runaway: +1 blast radius every 5 Terminal plies (shared age),
   * capped at 10 so kiting cannot soft-draw the sector.
   */
  terminalEmpRadiusGrowthInterval: 5,
  terminalEmpRadiusMax: 10,
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
