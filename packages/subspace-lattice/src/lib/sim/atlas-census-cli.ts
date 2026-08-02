/**
 * Lattice Atlas census — opening geometry & inventories for the handbook.
 * Bundled by scripts/atlas-census.sh — not imported from browser.
 *
 * Usage: yarn atlas:census [--out docs/atlas/census.json]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig, type RulesVersion } from '../rules/rules-config';

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return argv[i + 1];
}

const PIECE_LABEL: Record<PieceType, string> = {
  [PieceType.CommandHub]: 'CommandHub',
  [PieceType.Escort]: 'Escort',
  [PieceType.Infiltrator]: 'Infiltrator',
  [PieceType.Beam]: 'Beam',
  [PieceType.Refractor]: 'Refractor',
  [PieceType.Carrier]: 'Carrier',
};

function inventory(engine: SubspaceLatticeEngine, color: PlayerColor) {
  const counts: Record<string, number> = {};
  for (const p of Object.values(engine.getState().pieces)) {
    if (p.owner !== color) continue;
    const label = PIECE_LABEL[p.type] ?? String(p.type);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}

function openingBranching(engine: SubspaceLatticeEngine, color: PlayerColor) {
  const moves = engine.listLegalMoves(color);
  const byType: Record<string, number> = {};
  let escortMoves = 0;
  for (const m of moves) {
    const piece = engine.getPiece(m.pieceId);
    const label = piece ? PIECE_LABEL[piece.type] : 'unknown';
    byType[label] = (byType[label] ?? 0) + 1;
    if (piece?.type === PieceType.Escort) escortMoves += 1;
  }
  return {
    legalMoves: moves.length,
    escortMoves,
    escortShare: moves.length === 0 ? 0 : escortMoves / moves.length,
    byMoverType: byType,
    canFireEmp: engine.canFireEmp(color),
    empCharge: engine.getEmpCharge(color),
    empTarget: engine.getEmpChargeTarget(color),
  };
}

function censusFor(version: RulesVersion) {
  const rules = resolveRulesConfig(version);
  const engine = new SubspaceLatticeEngine({ rules });
  return {
    rulesVersion: rules.version,
    rulesId: `${rules.version}`,
    sectorActivationPly: rules.sectorActivationPly,
    sectorIntegrationRatio: rules.sectorIntegrationRatio,
    sectorHoldPlies: rules.sectorHoldPlies,
    heavyUnitDraft: rules.heavyUnitDraft ?? 'standard',
    heavyUnitFiles: rules.heavyUnitFiles ?? [2, 8],
    firstPlayerRelayCount: rules.firstPlayerRelayCount ?? 0,
    opening: {
      white: {
        inventory: inventory(engine, PlayerColor.White),
        branching: openingBranching(engine, PlayerColor.White),
      },
      black: {
        inventory: inventory(engine, PlayerColor.Black),
        // Black to move from a clone with side switched — opening census uses
        // White's start; report Black inventory only (mirrors setup).
        inventoryOnly: true as const,
      },
    },
    board: {
      size: 11,
      gravityWell: { x: 5, y: 5 },
    },
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const outPath = path.resolve(
    argValue(argv, '--out') ?? 'docs/atlas/census.json',
  );
  const generatedAt = new Date().toISOString();

  const hybridFleet = censusFor('hybrid-fleet');
  const hybrid = censusFor('hybrid');

  const payload = {
    generatedAt,
    generator: 'atlas-census',
    encodingNote:
      'Opening branching is White to move at initial setup. Black inventory is the mirrored fleet.',
    rulesets: {
      'hybrid-fleet': hybridFleet,
      hybrid,
    },
  };

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const mdPath = path.join(path.dirname(outPath), 'census.md');
  const wf = hybridFleet.opening.white;
  const md = `# Atlas census (generated)

Do not edit by hand — run \`yarn atlas:census\`.

- **Generated:** ${generatedAt}
- **Shipping ruleset:** \`hybrid-fleet\`

## hybrid-fleet · White opening

| Metric | Value |
| --- | ---: |
| Legal moves | ${wf.branching.legalMoves} |
| Escort moves | ${wf.branching.escortMoves} |
| Escort share | ${(wf.branching.escortShare * 100).toFixed(1)}% |
| Can fire EMP | ${wf.branching.canFireEmp} |
| Activation ply | ${hybridFleet.sectorActivationPly} |
| Integration ρ | ${hybridFleet.sectorIntegrationRatio} |

### Inventory (White)

${Object.entries(wf.inventory)
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join('\n')}

### Inventory (Black)

${Object.entries(hybridFleet.opening.black.inventory)
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join('\n')}

### Moves by mover type (White ply 0)

${Object.entries(wf.branching.byMoverType)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join('\n')}

Machine-readable: [\`census.json\`](./census.json).
`;
  writeFileSync(mdPath, md, 'utf8');

  console.log(`atlas:census — wrote ${outPath}`);
  console.log(`atlas:census — wrote ${mdPath}`);
  console.log(
    `atlas:census — hybrid-fleet White legal=${wf.branching.legalMoves} escort=${wf.branching.escortMoves}`,
  );
}

main();
