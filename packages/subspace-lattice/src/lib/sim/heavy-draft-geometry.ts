/**
 * Opening-geometry screen for heavy-unit Fleet Draft experiments.
 * Measures ply-0 mobility, net membership, and Gravity Well corner bypass
 * reachability before burning fairness/skill match budget.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType, PlayerColor } from '../interfaces';
import {
  HEAVY_UNIT_DRAFTS,
  type HeavyUnitDraft,
  resolveRulesConfig,
  type RulesConfig,
} from '../rules/rules-config';
import { rulesConfigId } from './param-space';

/** Symmetric wing-file pairs around the hub file (x=5). */
export const CANDIDATE_FILE_PAIRS: readonly [number, number][] = [
  [0, 10],
  [1, 9],
  [2, 8],
  [3, 7],
  [4, 6],
];

export interface OpeningGeometryRow {
  configId: string;
  draft: HeavyUnitDraft;
  files: [number, number];
  anchor: boolean;
  whiteHeavyMobility: number;
  blackHeavyMobility: number;
  whiteTotalMobility: number;
  heaviesInOwnNet: number;
  heaviesTotal: number;
  /** Destinations of White heavy slides that change both x and y (diagonal). */
  whiteDiagonalDestinations: number;
  /** White heavy destinations with |Δx|≥1 and |Δy|≥1 that pass “near” well. */
  whiteCornerBypassDestinations: number;
  /** Carrier starts outside hub radiation (anchor-relevant). */
  carriersOutsideHub: number;
}

function fleetOverlay(
  draft: HeavyUnitDraft,
  files: [number, number],
  anchor: boolean,
): RulesConfig {
  return resolveRulesConfig('hybrid-fleet', {
    heavyUnitDraft: draft,
    heavyUnitFiles: files,
    carrierRequiresHubAnchor: anchor,
  });
}

function isHeavy(type: PieceType): boolean {
  return (
    type === PieceType.Beam ||
    type === PieceType.Refractor ||
    type === PieceType.Carrier
  );
}

export function measureOpeningGeometry(rules: RulesConfig): OpeningGeometryRow {
  const engine = new SubspaceLatticeEngine({ rules });
  const state = engine.getState();
  const whiteMoves = engine.listLegalMoves(PlayerColor.White);
  const blackMoves = engine.listLegalMoves(PlayerColor.Black);

  const whiteHeavies = Object.values(state.pieces).filter(
    (p) => p.owner === PlayerColor.White && isHeavy(p.type),
  );
  const blackHeavies = Object.values(state.pieces).filter(
    (p) => p.owner === PlayerColor.Black && isHeavy(p.type),
  );

  const whiteHeavyIds = new Set(whiteHeavies.map((p) => p.id));
  const blackHeavyIds = new Set(blackHeavies.map((p) => p.id));

  const whiteHeavyMoves = whiteMoves.filter((m) => whiteHeavyIds.has(m.pieceId));
  const blackHeavyMoves = blackMoves.filter((m) => blackHeavyIds.has(m.pieceId));

  let whiteDiagonalDestinations = 0;
  let whiteCornerBypassDestinations = 0;
  for (const m of whiteHeavyMoves) {
    const piece = state.pieces[m.pieceId]!;
    const dx = Math.abs(m.to.x - piece.position.x);
    const dy = Math.abs(m.to.y - piece.position.y);
    if (dx > 0 && dy > 0) {
      whiteDiagonalDestinations += 1;
      // Corner-ish: destination is on a diagonal that could skirt (5,5).
      const nearWell =
        Math.max(Math.abs(m.to.x - 5), Math.abs(m.to.y - 5)) <= 2 &&
        !(m.to.x === 5 && m.to.y === 5);
      if (nearWell) whiteCornerBypassDestinations += 1;
    }
  }

  const allHeavies = [...whiteHeavies, ...blackHeavies];
  let heaviesInOwnNet = 0;
  for (const p of allHeavies) {
    const net = engine.getSensorNetSet(p.owner);
    if (net.has(`${p.position.x},${p.position.y}`)) heaviesInOwnNet += 1;
  }

  const hub = Object.values(state.pieces).find(
    (p) => p.owner === PlayerColor.White && p.type === PieceType.CommandHub,
  )!;
  let carriersOutsideHub = 0;
  for (const p of whiteHeavies) {
    if (p.type !== PieceType.Carrier) continue;
    const d = Math.max(
      Math.abs(p.position.x - hub.position.x),
      Math.abs(p.position.y - hub.position.y),
    );
    if (d > rules.hubSensorRadius) carriersOutsideHub += 1;
  }

  return {
    configId: rulesConfigId(rules),
    draft: rules.heavyUnitDraft ?? 'standard',
    files: (rules.heavyUnitFiles ?? [2, 8]) as [number, number],
    anchor: Boolean(rules.carrierRequiresHubAnchor),
    whiteHeavyMobility: whiteHeavyMoves.length,
    blackHeavyMobility: blackHeavyMoves.length,
    whiteTotalMobility: whiteMoves.length,
    heaviesInOwnNet,
    heaviesTotal: allHeavies.length,
    whiteDiagonalDestinations,
    whiteCornerBypassDestinations,
    carriersOutsideHub,
  };
}

/** Build the experiment matrix (draft × files × anchor where relevant). */
export function buildHeavyDraftMatrix(): RulesConfig[] {
  const out: RulesConfig[] = [];
  const seen = new Set<string>();

  for (const draft of HEAVY_UNIT_DRAFTS) {
    const needsAnchorToggle =
      draft === 'carrier-beam' || draft === 'refractor-carrier';
    const anchors = needsAnchorToggle ? [false, true] : [false];
    for (const files of CANDIDATE_FILE_PAIRS) {
      for (const anchor of anchors) {
        const rules = fleetOverlay(draft, files, anchor);
        const id = rulesConfigId(rules);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(rules);
      }
    }
  }
  return out;
}

/** Fleet-baseline cell for paired comparison (standard Beams @ 2-8). */
export function fleetBaselineRules(): RulesConfig {
  return resolveRulesConfig('hybrid-fleet');
}

export function formatGeometryReport(rows: OpeningGeometryRow[]): string {
  const header = [
    'draft'.padEnd(18),
    'files'.padEnd(7),
    'anc',
    'wHvy'.padStart(5),
    'bHvy'.padStart(5),
    'wTot'.padStart(5),
    'net'.padStart(6),
    'diag'.padStart(5),
    'bypass'.padStart(7),
    'carOut'.padStart(7),
  ].join(' ');

  const lines = [header, '-'.repeat(header.length)];
  for (const r of rows) {
    lines.push(
      [
        r.draft.padEnd(18),
        `${r.files[0]}-${r.files[1]}`.padEnd(7),
        r.anchor ? ' Y ' : ' n ',
        String(r.whiteHeavyMobility).padStart(5),
        String(r.blackHeavyMobility).padStart(5),
        String(r.whiteTotalMobility).padStart(5),
        `${r.heaviesInOwnNet}/${r.heaviesTotal}`.padStart(6),
        String(r.whiteDiagonalDestinations).padStart(5),
        String(r.whiteCornerBypassDestinations).padStart(7),
        String(r.carriersOutsideHub).padStart(7),
      ].join(' '),
    );
  }
  return lines.join('\n');
}

/** Emit --fixed tokens for evolve (hybrid-fleet knobs + draft). */
export function toFixedSpec(rules: RulesConfig): string {
  const files = rules.heavyUnitFiles ?? [2, 8];
  const parts = [
    'hub3',
    'esc1',
    'link2',
    '0.45',
    'hold1',
    'neutral',
    'act100',
    'relay1',
  ];
  const draft = rules.heavyUnitDraft ?? 'standard';
  if (draft !== 'standard') parts.push(`draft=${draft}`);
  if (rules.carrierRequiresHubAnchor) parts.push('anchor');
  if (files[0] !== 2 || files[1] !== 8) {
    parts.push(`files=${files[0]}-${files[1]}`);
  }
  return `hybrid-fleet:${parts.join(',')}`;
}

function parseArgs(argv: string[]): { out?: string; emitFixed: boolean } {
  let out: string | undefined;
  let emitFixed = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) out = argv[++i];
    else if (argv[i] === '--emit-fixed') emitFixed = true;
  }
  return { out, emitFixed };
}

export function runHeavyDraftGeometryCli(
  argv: string[] = process.argv.slice(2),
): void {
  const opts = parseArgs(argv);
  const matrix = buildHeavyDraftMatrix();
  const rows = matrix.map(measureOpeningGeometry);
  // Sort: prefer some opening diagonal activity, heavies in net, then mobility.
  rows.sort((a, b) => {
    const score = (r: OpeningGeometryRow) =>
      r.heaviesInOwnNet * 100 +
      r.whiteDiagonalDestinations * 3 +
      r.whiteCornerBypassDestinations * 5 +
      r.whiteHeavyMobility -
      r.carriersOutsideHub * (r.anchor ? 0 : 2);
    return score(b) - score(a);
  });

  console.log(
    `heavy-draft opening geometry — ${rows.length} cells on hybrid-fleet base\n`,
  );
  console.log(formatGeometryReport(rows));

  if (opts.emitFixed) {
    console.log('\n--fixed specs (semicolon-joined for evolve):');
    console.log(matrix.map(toFixedSpec).join(';'));
  }

  if (opts.out) {
    const path = resolve(opts.out);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
      'utf8',
    );
    console.log(`\nWrote JSONL → ${path}`);
  }
}

const isMain =
  typeof process !== 'undefined' &&
  Boolean(process.argv[1]) &&
  /heavy-draft-geometry\.(mjs|js)|sim\/heavy-draft-geometry\.(ts|js)/.test(
    process.argv[1]!,
  );

if (isMain) {
  runHeavyDraftGeometryCli();
}
