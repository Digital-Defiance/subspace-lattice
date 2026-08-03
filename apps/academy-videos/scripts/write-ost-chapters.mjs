/**
 * Write YouTube chapter markers for each OST family.
 * Durations from public/soundtrack mp3s (afinfo / ffprobe).
 *
 *   node scripts/write-ost-chapters.mjs
 *   → out/chapters-ost-*.txt
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const soundtrackDir = path.join(root, 'public', 'soundtrack');
const outDir = path.join(root, 'out');

const FAMILIES = [
  {
    id: 'ost-void-call',
    title: 'Void Call',
    stems: ['Void Call', 'Void Call 2'],
  },
  {
    id: 'ost-pre-mission',
    title: 'Pre-Mission Tension',
    stems: ['Pre-Mission Tension', 'Pre-Mission Tension 2'],
  },
  {
    id: 'ost-void-pulse',
    title: 'Void Pulse',
    stems: ['Void Pulse', 'Void Pulse 2', 'Void Pulse 3', 'Void Pulse 4'],
  },
  {
    id: 'ost-void-protocol',
    title: 'Void Protocol',
    stems: [
      'Void Protocol',
      'Void Protocol 2',
      'Void Protocol 3',
      'Void Protocol 4',
    ],
  },
  {
    id: 'ost-cold-calculations',
    title: 'Cold Calculations',
    stems: [
      'Cold Calculations',
      'Cold Calculations 2',
      'Cold Calculations 3',
      'Cold Calculations 4',
    ],
  },
  {
    id: 'ost-thermal-count',
    title: 'The Last Thermal Count',
    stems: ['The Last Thermal Count', 'The Last Thermal Count 2'],
  },
  {
    id: 'ost-final-algorithm',
    title: 'The Final Algorithm',
    stems: ['The Final Algorithm', 'The Final Algorithm 2'],
  },
  {
    id: 'ost-last-signal',
    title: 'Last Signal Fades',
    stems: ['Last Signal Fades', 'Last Signal Fades 2'],
  },
];

function durationSec(stem) {
  const file = path.join(soundtrackDir, `${stem}.mp3`);
  try {
    const out = execFileSync('afinfo', [file], { encoding: 'utf8' });
    const m = out.match(/estimated duration:\s+([0-9.]+)/);
    if (m) return Number.parseFloat(m[1]);
  } catch {
    /* try ffprobe */
  }
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
    { encoding: 'utf8' },
  );
  return Number.parseFloat(out.trim());
}

function formatTs(totalSec) {
  const s = Math.floor(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

mkdirSync(outDir, { recursive: true });

for (const family of FAMILIES) {
  let acc = 0;
  const lines = [`Subspace Lattice OST · ${family.title}`, ''];
  for (const stem of family.stems) {
    lines.push(`${formatTs(acc)} ${stem}`);
    acc += durationSec(stem);
  }
  lines.push('');
  lines.push(`Total ~ ${formatTs(acc)}`);
  const outPath = path.join(outDir, `chapters-${family.id}.txt`);
  writeFileSync(outPath, `${lines.join('\n')}\n`);
  console.log(`wrote ${outPath} (${formatTs(acc)})`);
}
