import { RulesConfig, resolveRulesConfig } from '../rules/rules-config';
import { createSeededRng } from '../ai/rng';

/** Evolvable knobs (board size fixed at 11 for starting layout). */
export type EvolvableRulesKnob =
  | 'hubSensorRadius'
  | 'escortSensorRadius'
  | 'linkDistance'
  | 'sectorIntegrationRatio'
  | 'sectorHoldPlies'
  | 'contestedCellsNeutral'
  | 'sectorActivationPly'
  | 'firstPlayerRelayCount';

export const RULES_PARAM_SPACE: Record<
  EvolvableRulesKnob,
  readonly number[]
> = {
  hubSensorRadius: [1, 2, 3],
  escortSensorRadius: [1, 2],
  linkDistance: [1, 2, 3],
  sectorIntegrationRatio: [0.45, 0.51, 0.6, 0.7],
  sectorHoldPlies: [0, 4, 8, 12],
  // Boolean toggle sampled as 0/1.
  contestedCellsNeutral: [0, 1],
  sectorActivationPly: [0, 80, 100, 120],
  firstPlayerRelayCount: [0, 1, 2],
};

export interface AiHyperParams {
  simulations: number;
  exploration: number;
  maxRolloutPlies: number;
}

export const AI_PARAM_SPACE = {
  simulations: [20, 50, 100] as const,
  exploration: [0.8, 1.4, 2.0] as const,
  maxRolloutPlies: [20, 40] as const,
};

export function sampleRulesConfig(
  rng: () => number,
  base: RulesConfig = resolveRulesConfig('hybrid'),
): RulesConfig {
  const pick = <T>(arr: readonly T[]): T =>
    arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]!;

  return {
    ...base,
    version: 'hybrid',
    boardSize: 11,
    hubSensorRadius: pick(RULES_PARAM_SPACE.hubSensorRadius),
    escortSensorRadius: pick(RULES_PARAM_SPACE.escortSensorRadius),
    linkDistance: pick(RULES_PARAM_SPACE.linkDistance),
    sectorIntegrationRatio: pick(RULES_PARAM_SPACE.sectorIntegrationRatio),
    sectorHoldPlies: pick(RULES_PARAM_SPACE.sectorHoldPlies),
    contestedCellsNeutral: pick(RULES_PARAM_SPACE.contestedCellsNeutral) === 1,
    sectorActivationPly: pick(RULES_PARAM_SPACE.sectorActivationPly),
    firstPlayerRelayCount: pick(RULES_PARAM_SPACE.firstPlayerRelayCount),
  };
}

export function sampleAiHyperParams(rng: () => number): AiHyperParams {
  const pick = <T>(arr: readonly T[]): T =>
    arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]!;
  return {
    simulations: pick(AI_PARAM_SPACE.simulations),
    exploration: pick(AI_PARAM_SPACE.exploration),
    maxRolloutPlies: pick(AI_PARAM_SPACE.maxRolloutPlies),
  };
}

export function rulesConfigId(rules: RulesConfig): string {
  const parts = [
    rules.version,
    `hub${rules.hubSensorRadius}`,
    `esc${rules.escortSensorRadius}`,
    `link${rules.linkDistance}`,
    `sec${rules.sectorIntegrationRatio}`,
  ];
  if (rules.sectorHoldPlies > 0) {
    parts.push(`hold${rules.sectorHoldPlies}`);
  }
  if (rules.contestedCellsNeutral) {
    parts.push('neutral');
  }
  if (rules.sectorActivationPly > 0) {
    parts.push(`act${rules.sectorActivationPly}`);
  }
  if ((rules.firstPlayerRelayCount ?? 0) > 0) {
    parts.push(`relay${rules.firstPlayerRelayCount}`);
  }
  return parts.join('_');
}

/**
 * Parse a fixed-cell knobs string into a RulesConfig.
 *
 * Accepted forms (version optional, defaults to hybrid):
 * - `hub3,esc1,link2,0.51`
 * - `hybrid:hub3,esc1,link2,0.51,hold8`
 * - `hub=3,esc=1,link=2,sec=0.51,hold=8`
 * - `hub3,esc1,link2,0.45,hold4,neutral`
 * - `hub3,esc1,link2,0.45,hold1,neutral,activation100`
 *
 * `hold` (sectorHoldPlies) is optional and defaults to 0 (instant sector win).
 * `neutral` (or `neutral=1`) enables contestedCellsNeutral; default off.
 * `activation`/`act` (sectorActivationPly) arms the sector clock at that ply;
 * default 0 (armed from the start).
 * `relay1`/`relay2` (or `relay=1`/`relay=2`) give the first player that many
 * Initiative Relay Escorts.
 */
export function parseFixedRulesSpec(spec: string): RulesConfig {
  const trimmed = spec.trim();
  if (!trimmed) {
    throw new Error('Empty --fixed spec');
  }
  let version: RulesConfig['version'] = 'hybrid';
  let body = trimmed;
  const colon = trimmed.indexOf(':');
  if (colon > 0) {
    const maybeVersion = trimmed.slice(0, colon);
    if (
      maybeVersion === 'classic' ||
      maybeVersion === 'hybrid' ||
      maybeVersion === 'hybrid-spool'
    ) {
      version = maybeVersion;
      body = trimmed.slice(colon + 1);
    }
  }

  const parts = body.split(',').map((p) => p.trim()).filter(Boolean);
  let hub: number | undefined;
  let esc: number | undefined;
  let link: number | undefined;
  let sec: number | undefined;
  let hold: number | undefined;
  let neutral: boolean | undefined;
  let activation: number | undefined;
  let relayCount: number | undefined;

  for (const part of parts) {
    if (/^neutral$/i.test(part)) {
      neutral = true;
      continue;
    }
    if (/^relay$/i.test(part)) {
      relayCount = 1;
      continue;
    }
    const relayEq = part.match(/^relay=([012])$/i);
    if (relayEq) {
      relayCount = Number(relayEq[1]);
      continue;
    }
    const relayTagged = part.match(/^relay([12])$/i);
    if (relayTagged) {
      relayCount = Number(relayTagged[1]);
      continue;
    }
    const neutralEq = part.match(/^neutral=([01])$/i);
    if (neutralEq) {
      neutral = neutralEq[1] === '1';
      continue;
    }
    const eq = part.match(/^(hub|esc|link|sec|hold|activation|act)=([0-9.]+)$/i);
    if (eq) {
      const key = eq[1]!.toLowerCase();
      const value = Number(eq[2]);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number in --fixed part: ${part}`);
      }
      if (key === 'hub') hub = value;
      else if (key === 'esc') esc = value;
      else if (key === 'link') link = value;
      else if (key === 'hold') hold = value;
      else if (key === 'activation' || key === 'act') activation = value;
      else sec = value;
      continue;
    }
    const tagged = part.match(/^(hub|esc|link|hold|activation|act)(\d+)$/i);
    if (tagged) {
      const key = tagged[1]!.toLowerCase();
      const value = Number(tagged[2]);
      if (key === 'hub') hub = value;
      else if (key === 'esc') esc = value;
      else if (key === 'hold') hold = value;
      else if (key === 'activation' || key === 'act') activation = value;
      else link = value;
      continue;
    }
    if (/^[0-9]*\.?[0-9]+$/.test(part)) {
      sec = Number(part);
      continue;
    }
    throw new Error(
      `Unrecognized --fixed part "${part}" (expected hub3,esc1,link2,0.51)`,
    );
  }

  if (
    hub === undefined ||
    esc === undefined ||
    link === undefined ||
    sec === undefined
  ) {
    throw new Error(
      `Incomplete --fixed spec "${spec}" (need hub, esc, link, and sector ratio)`,
    );
  }

  return resolveRulesConfig(version, {
    hubSensorRadius: hub,
    escortSensorRadius: esc,
    linkDistance: link,
    sectorIntegrationRatio: sec,
    sectorHoldPlies: hold,
    contestedCellsNeutral: neutral,
    sectorActivationPly: activation,
    firstPlayerRelayCount: relayCount,
    infiltratorSpoolUp: version === 'hybrid-spool',
  });
}

/** Deduplicate fixed specs while preserving order. */
export function resolveFixedRulesConfigs(specs: string[]): RulesConfig[] {
  const out: RulesConfig[] = [];
  const seen = new Set<string>();
  for (const spec of specs) {
    const rules = parseFixedRulesSpec(spec);
    const id = rulesConfigId(rules);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(rules);
  }
  return out;
}

export function generateRulesCandidates(
  count: number,
  seed: number,
  includeDefault = true,
): RulesConfig[] {
  const rng = createSeededRng(seed);
  const out: RulesConfig[] = [];
  const seen = new Set<string>();

  if (includeDefault) {
    const d = resolveRulesConfig('hybrid');
    seen.add(rulesConfigId(d));
    out.push(d);
  }

  let guard = 0;
  while (out.length < count && guard < count * 20) {
    guard += 1;
    const c = sampleRulesConfig(rng);
    const id = rulesConfigId(c);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(c);
  }
  return out;
}
