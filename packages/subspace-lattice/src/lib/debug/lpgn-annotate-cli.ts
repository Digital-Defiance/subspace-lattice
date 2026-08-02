/// <reference types="node" />
/**
 * CLI: LPGN → annotated TeX + Board SVG figures (+ PDF when pdflatex exists).
 *
 * Default diagrams come from Playwright Board capture (Sensor Net, EMP/TO,
 * Subspace Lattice piece art). Pass `--letter-svg` for offline glyph fallbacks.
 *
 * Bundled by scripts/annotate-lpgn.sh (node-only; not imported by Vite).
 */
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlayerColor } from '../interfaces/playerColor';
import { replayLpgn } from './lpgn-replay';
import {
  annotateLpgnReplay,
  type AnnotateLpgnProgress,
} from './lpgn-annotate';
import { buildLpgnAnnotatedTex } from './lpgn-tex';

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function repoRoot(): string {
  // …/packages/subspace-lattice/dist/lpgn-annotate-cli.mjs → repo root
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../..');
}

/** Zero-dep TTY progress: braille spinner + bar, rewritten in place with \\r. */
function createGradeProgress(label: string) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
  let frame = 0;
  let lastPipedPct = -1;

  const bar = (pct: number, width = 22): string => {
    const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
    return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`;
  };

  return {
    update(p: AnnotateLpgnProgress) {
      const step = p.step
        ? ` · ${p.step.label} ${p.step.current}/${p.step.total}`
        : '';
      if (process.stdout.isTTY) {
        frame = (frame + 1) % frames.length;
        const msg = `${frames[frame]} ${label} ${bar(p.percent)} ${p.percent}% (${p.current}/${p.total})${step}`;
        const width = Math.max(48, (process.stdout.columns ?? 80) - 1);
        process.stdout.write(`\r${msg.slice(0, width).padEnd(width)}`);
        return;
      }
      if (p.percent === lastPipedPct) return;
      lastPipedPct = p.percent;
      console.log(
        `${label} ${p.percent}% (${p.current}/${p.total})${step}`,
      );
    },
    done(finalMessage?: string) {
      if (process.stdout.isTTY) {
        const width = Math.max(48, (process.stdout.columns ?? 80) - 1);
        const msg = finalMessage ?? `${label} done`;
        process.stdout.write(`\r${msg.padEnd(width)}\n`);
      }
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const lpgnPath = args.find((a) => !a.startsWith('--'));
  if (!lpgnPath) {
    console.error(
      'usage: lpgn-annotate-cli <file.lpgn> [--every-ply] [--letter-svg] [--out <dir>] [--perspective white|black] [--advisor fast|normal|strong|deep] [--force-capture]',
    );
    process.exit(1);
  }

  const everyPly = args.includes('--every-ply');
  const letterSvg = args.includes('--letter-svg');
  const forceCapture = args.includes('--force-capture');
  const advisorRaw = (argValue(args, '--advisor') ?? 'normal').toLowerCase();
  const advisorStrength =
    advisorRaw === 'fast' ||
    advisorRaw === 'normal' ||
    advisorRaw === 'strong' ||
    advisorRaw === 'deep'
      ? advisorRaw
      : 'normal';
  const root = repoRoot();
  const outRoot =
    argValue(args, '--out') ?? path.join(root, 'docs', 'lpgn-reports');
  const perspective =
    (argValue(args, '--perspective') ?? 'white').toLowerCase() === 'black'
      ? PlayerColor.Black
      : PlayerColor.White;

  const absLpgn = path.isAbsolute(lpgnPath)
    ? lpgnPath
    : path.resolve(process.cwd(), lpgnPath);
  const text = readFileSync(absLpgn, 'utf8');
  console.log(`annotate:lpgn — replaying ${absLpgn}…`);
  const replay = replayLpgn(text);
  console.log(`annotate:lpgn — ${replay.plies.length} plies ok`);

  console.log(`annotate:lpgn — grading with advisor=${advisorStrength}…`);
  const gradeProgress = createGradeProgress('annotate:lpgn');
  const report = await annotateLpgnReplay(replay, {
    perspective,
    advisorStrength,
    yieldEvery: 0,
    onProgress: (p) => gradeProgress.update(p),
  });
  gradeProgress.done(
    `annotate:lpgn — graded ${report.annotations.length} plies (advisor=${advisorStrength})`,
  );
  for (const line of report.summary) console.log(line);

  const id = path.basename(absLpgn, path.extname(absLpgn)).slice(0, 72);
  const reportDir = path.join(outRoot, id);
  mkdirSync(reportDir, { recursive: true });
  // Persist grades before TeX so a layout crash does not waste a Deep run.
  writeFileSync(
    path.join(reportDir, `${id}.grades.json`),
    JSON.stringify(
      {
        summary: report.summary,
        shortcuts: report.shortcuts,
        branches: report.branches,
        annotations: report.annotations,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`annotate:lpgn — wrote ${id}.grades.json`);

  const bundle = buildLpgnAnnotatedTex(report, {
    everyPly,
    letterSvg,
    id,
  });

  const figuresDir = path.join(reportDir, 'figures', 'lpgn', bundle.id);
  mkdirSync(figuresDir, { recursive: true });

  writeFileSync(path.join(reportDir, `${bundle.id}.lpgn`), text, 'utf8');

  const pliesPath = path.join(reportDir, 'diagram-plies.txt');
  writeFileSync(pliesPath, bundle.diagramPlies.join(','), 'utf8');

  if (letterSvg) {
    for (const [rel, svg] of bundle.figures) {
      const abs = path.join(reportDir, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, svg, 'utf8');
    }
    console.log(
      `annotate:lpgn — wrote ${bundle.figures.size} letter-svg fallbacks`,
    );
  } else {
    const plies = bundle.diagramPlies.join(',');
    console.log(
      `annotate:lpgn — capturing Board figures (${bundle.diagramPlies.length} plies)…`,
    );
    const captureArgs = [
      path.join(root, 'scripts', 'capture-lpgn-figures.mjs'),
      '--lpgn',
      absLpgn,
      '--out',
      outRoot,
      '--id',
      bundle.id,
      '--plies',
      plies,
    ];
    if (forceCapture) captureArgs.push('--force');
    const cap = spawnSync(process.execPath, captureArgs, {
      cwd: root,
      encoding: 'utf8',
      stdio: 'inherit',
    });
    if (cap.status !== 0) {
      console.error(
        'annotate:lpgn — Board capture failed. Retry with --force-capture, or use --letter-svg for offline glyphs.',
      );
      process.exit(cap.status ?? 1);
    }
  }

  const texPath = path.join(reportDir, `${bundle.id}.tex`);
  writeFileSync(texPath, bundle.tex, 'utf8');
  console.log(
    `annotate:lpgn — wrote ${texPath} (${bundle.diagramPlies.length} diagrams, ${report.shortcuts.length} shortcuts)`,
  );

  // SVG → PDF
  const whichRsvg = spawnSync('which', ['rsvg-convert'], { encoding: 'utf8' });
  const rsvgBin = whichRsvg.stdout.trim() || 'rsvg-convert';
  let converted = 0;
  let missing = 0;
  for (const ply of bundle.diagramPlies) {
    const stem = path.join(figuresDir, `ply-${String(ply).padStart(3, '0')}`);
    const svg = `${stem}.svg`;
    const pdf = `${stem}.pdf`;
    if (!existsSync(svg)) {
      missing++;
      console.warn(`missing figure: ${svg}`);
      continue;
    }
    const r = spawnSync(rsvgBin, ['-f', 'pdf', '-o', pdf, svg], {
      encoding: 'utf8',
    });
    if (r.status !== 0) {
      console.warn(`rsvg-convert failed for ${svg}: ${r.stderr}`);
    } else {
      converted++;
    }
  }
  console.log(`annotate:lpgn — rsvg-convert ${converted} figures (${missing} missing)`);
  if (missing > 0) process.exit(1);

  const pdflatex = spawnSync('which', ['pdflatex'], { encoding: 'utf8' });
  if (pdflatex.status === 0 && pdflatex.stdout.trim()) {
    const run = () =>
      spawnSync(
        'pdflatex',
        ['-interaction=nonstopmode', '-halt-on-error', path.basename(texPath)],
        { cwd: reportDir, encoding: 'utf8' },
      );
    let r = run();
    if (r.status !== 0) {
      console.error(r.stdout.slice(-2000));
      console.error(r.stderr.slice(-1000));
      process.exit(1);
    }
    r = run();
    const pdfPath = path.join(reportDir, `${bundle.id}.pdf`);
    console.log(`annotate:lpgn — wrote ${pdfPath}`);
  } else {
    console.warn('annotate:lpgn — pdflatex missing; left TeX + SVGs only');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
