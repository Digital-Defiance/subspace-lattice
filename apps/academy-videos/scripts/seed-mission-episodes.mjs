#!/usr/bin/env node
/**
 * Generate turn-by-turn episode scripts straight from docs/advanced-manual.tex.
 *
 * The manual already annotates every ply (engine-replayed narration + computed
 * facts), so the long-form videos are derived from it rather than hand-authored.
 * That keeps the PDF and the videos from ever drifting apart.
 *
 * Writes:
 *   scripts/episodes/ep05-standard-battle-full.json   (Mission 2, 57 plies)
 *   scripts/episodes/ep06-clock-siege-full.json       (Mission 3, 115 plies)
 *   out/chapters-<episode-id>.txt                     (YouTube chapter markers)
 *
 * Usage: yarn seed:mission-episodes
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { speakable } from './lib/speakable.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEX = path.resolve(ROOT, '../../docs/advanced-manual.tex');
const EP_DIR = path.join(ROOT, 'scripts', 'episodes');
const OUT_DIR = path.join(ROOT, 'out');

const FPS = 30;

/** Read a balanced `{...}` group starting at `start` (which must be `{`). */
function readGroup(src, start) {
  if (src[start] !== '{') throw new Error(`expected { at ${start}`);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { content: src.slice(start + 1, i), next: i + 1 };
    }
  }
  throw new Error(`unbalanced group at ${start}`);
}

/** Strip the gray facts bracket, returning [prose, facts]. */
function splitFacts(body) {
  const marker = '{\\color{gray}\\scriptsize';
  const at = body.indexOf(marker);
  if (at === -1) return [body, ''];
  const group = readGroup(body, at);
  const facts = group.content
    .replace('\\color{gray}', '')
    .replace('\\scriptsize', '')
    .trim()
    .replace(/^\[|\]$/g, '');
  return [body.slice(0, at), facts];
}

/** LaTeX fragment → spoken/displayable plain text. */
function detex(input, { arrow = '→' } = {}) {
  let out = input;
  out = out.replace(/\$\\rightarrow\$/g, arrow);
  out = out.replace(/\\textasciitilde\{\}/g, '~');
  out = out.replace(/\\textbullet/g, '·');
  out = out.replace(/\\(textbf|emph|texttt|textit)\{([^{}]*)\}/g, '$2');
  out = out.replace(/\\(?:;|,|noindent)/g, ' ');
  out = out.replace(/\$\\geq\$/g, '≥');
  out = out.replace(/\$\\approx\$/g, '≈');
  out = out.replace(/\$\\rho\$/g, 'rho');
  out = out.replace(/\$\\times\$/g, '×');
  out = out.replace(/---/g, '—');
  out = out.replace(/(\d)--(\d)/g, '$1–$2');
  out = out.replace(/--/g, '–');
  out = out.replace(/\\([&%$#_{}])/g, '$1');
  out = out.replace(/[{}]/g, '');
  return out.replace(/\s+/g, ' ').trim();
}

function parseManual(tex) {
  const missions = new Map();
  const sectionRe = /\\section\{(Mission [^}]*)\}/g;
  const sections = [];
  let m;
  while ((m = sectionRe.exec(tex)) !== null) {
    sections.push({ title: detex(m[1]), at: m.index });
  }

  const plyRe = /\\plyfig\{figures\/missions\/([^/]+)\/ply-(\d+)\}/g;
  while ((m = plyRe.exec(tex)) !== null) {
    const missionId = m[1];
    const ply = Number(m[2]);
    const headingGroup = readGroup(tex, m.index + m[0].length);
    const bodyGroup = readGroup(tex, headingGroup.next);
    const [prose, facts] = splitFacts(bodyGroup.content);

    if (!missions.has(missionId)) {
      const section = sections
        .filter((s) => s.at < m.index)
        .sort((a, b) => b.at - a.at)[0];
      missions.set(missionId, {
        id: missionId,
        title: section?.title ?? missionId,
        plies: [],
      });
    }
    missions.get(missionId).plies.push({
      ply,
      heading: detex(headingGroup.content),
      prose: detex(prose),
      facts: detex(facts, { arrow: 'to' }),
    });
  }

  const debriefRe = /\\noindent\\textbf\{Debrief\.\}([^\n]*)/g;
  const debriefs = [];
  while ((m = debriefRe.exec(tex)) !== null) debriefs.push(detex(m[1]));

  const ordered = [...missions.values()];
  ordered.forEach((mission, i) => {
    mission.debrief = debriefs[i] ?? '';
    mission.plies.sort((a, b) => a.ply - b.ply);
  });
  return ordered;
}

/** Manual's own phase split (walkthrough-narrate.ts). */
function phaseFor(plyIndex, total) {
  if (plyIndex < Math.min(14, Math.floor(total * 0.28))) return 'opening';
  if (plyIndex >= total - 8) return 'endgame';
  return 'midgame';
}

const PHASE_COPY = {
  opening: {
    headline: 'Opening',
    bullets: [
      'Advance central Escorts — they carry the net forward',
      'Keep every Escort within two squares of the chain',
      'Slide Beams into files that will matter later',
    ],
    voiceover:
      'Opening phase. Structure, not gambits: advance central Escorts to carry the net forward, keep the chain linked within two squares, and pre-slide Beams into files that will matter once coverage arrives.',
  },
  midgame: {
    headline: 'Midgame',
    bullets: [
      'Net pressure over map painting',
      'Target Locks punish overextension',
      'Probe for a Hub mistake',
    ],
    voiceover:
      'Midgame. This is net pressure and Target Lock threats, probing for a Hub mistake — not a race to paint the map. Watch for the moment an enemy Beam lane and a Hub share a file.',
  },
  endgame: {
    headline: 'Endgame',
    bullets: [
      'Strike if the Hub hunt is winning',
      'Otherwise coverage becomes the scoreboard',
      'Every ply threatens, builds, or refuses a hang',
    ],
    voiceover:
      'Endgame. Either a Hub hunt converts, or coverage becomes the scoreboard. Each step should threaten, expand a finishing net, or refuse a hang.',
  },
};

/** `net 49–49 · 2 ships locked · captures Escort · White wins` → structured. */
function statsFor(facts) {
  const stats = {};
  const net = /net (\d+)[–-](\d+)/.exec(facts);
  if (net) {
    stats.netWhite = Number(net[1]);
    stats.netBlack = Number(net[2]);
  }
  const locked = /(\d+) ships? locked/.exec(facts);
  if (locked) stats.locked = Number(locked[1]);
  const capture = /captures ([^·]+)/.exec(facts);
  if (capture) stats.capture = capture[1].trim();
  const result = /(White|Black) wins/.exec(facts);
  if (result) stats.result = `${result[1]} wins`;
  return stats;
}

function overlaysFor(mission, ply, facts) {
  const overlays = { nets: 'both' };
  if (/Hub en prise/i.test(facts)) overlays.hubEnPrise = true;
  if (/ship(s)? locked/i.test(facts)) overlays.targetLocked = true;
  if (mission.id === 'mission-clock-finish' && ply >= 100) {
    overlays.nets = 'contested';
  }
  return overlays;
}

/** Pace each beat by how much there is to read. */
function plyDurationSec(text, facts) {
  const words = `${text} ${facts}`.split(/\s+/).filter(Boolean).length;
  return Math.min(11, Math.max(3.2, Math.round((words / 2.7) * 10) / 10));
}

/**
 * The manual narrates from templates, so the same teaching sentence recurs
 * across dozens of plies. Voice the lesson the first time and drop to the
 * move-specific sentence afterwards, or the video becomes unwatchable.
 */
function templateSignature(prose) {
  return prose
    .replace(/\(\d+,\d+\)/g, '#')
    .replace(/^(White|Black)\b/, 'SEAT')
    .replace(/\b(White|Black)\b/g, 'SEAT');
}

function firstSentence(prose) {
  const m = /^[^.]*\./.exec(prose);
  return m ? m[0] : prose;
}

function buildEpisode(mission, meta) {
  const total = mission.plies.length;
  const scenes = [
    {
      kind: 'title',
      id: 'title',
      eyebrow: meta.eyebrow,
      headline: meta.headline,
      subhead: meta.subhead,
      voiceover: meta.introVoiceover,
      durationHintSec: 8,
    },
    {
      kind: 'board',
      id: 'start',
      missionId: mission.id,
      ply: 0,
      moveLabel: 'Starting position',
      overlays: { nets: 'both' },
      voiceover: meta.startVoiceover,
      durationHintSec: 9,
    },
  ];

  const seenTemplates = new Set();
  let lastPhase = null;
  for (let i = 0; i < total; i++) {
    const entry = mission.plies[i];
    const phase = phaseFor(i, total);
    if (phase !== lastPhase) {
      const copy = PHASE_COPY[phase];
      scenes.push({
        kind: 'narration',
        id: `phase-${phase}`,
        headline: `${copy.headline} · plies ${i + 1}–${
          phase === 'endgame' ? total : phaseEndIndex(phase, total)
        }`,
        bullets: copy.bullets,
        voiceover: copy.voiceover,
        durationHintSec: 9,
      });
      lastPhase = phase;
    }

    const label = entry.heading.replace(/^Ply\s+\d+\s*—\s*/, '');
    const signature = templateSignature(entry.prose);
    // Never abbreviate the beats a learner replays: hangs, captures, the win,
    // and the ply the sector clock arms.
    const critical =
      /en prise|captures|wins/i.test(entry.facts) ||
      /Sector Integration can now win/.test(entry.prose);
    const prose =
      !critical && seenTemplates.has(signature)
        ? firstSentence(entry.prose)
        : entry.prose;
    seenTemplates.add(signature);
    // Facts go in the side panel; narration stays speakable.
    const seconds = plyDurationSec(prose, '');
    scenes.push({
      kind: 'board',
      id: `ply-${String(entry.ply).padStart(3, '0')}`,
      missionId: mission.id,
      ply: entry.ply,
      moveLabel: label,
      overlays: overlaysFor(mission, entry.ply, entry.facts),
      stats: statsFor(entry.facts),
      voiceover: speakable(prose),
      durationHintSec: critical ? Math.max(6.5, seconds) : seconds,
    });
  }

  scenes.push({
    kind: 'outro',
    id: 'outro',
    headline: meta.outroHeadline,
    nextEpisode: meta.nextEpisode,
    voiceover: mission.debrief || meta.outroHeadline,
    durationHintSec: 10,
  });

  return {
    id: meta.id,
    compositionId: meta.compositionId,
    title: meta.headline,
    youtubeTitle: meta.youtubeTitle,
    description: meta.description,
    fps: FPS,
    width: 1920,
    height: 1080,
    scenes,
  };
}

function phaseEndIndex(phase, total) {
  if (phase === 'opening') return Math.min(14, Math.floor(total * 0.28));
  return total - 8;
}

function sceneFrames(scene) {
  if (scene.kind === 'pause-predict') {
    return Math.round(
      (scene.durationHintSec + scene.revealDurationHintSec) * FPS,
    );
  }
  return Math.round(scene.durationHintSec * FPS);
}

function chapters(episode) {
  const lines = [`# ${episode.youtubeTitle}`, '', episode.description, ''];
  let frame = 0;
  for (const scene of episode.scenes) {
    const sec = Math.floor(frame / FPS);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    const label =
      scene.kind === 'board' && scene.moveLabel
        ? `Ply ${scene.ply} — ${scene.moveLabel}`
        : scene.kind === 'narration'
          ? scene.headline
          : scene.kind === 'title'
            ? 'Intro'
            : scene.kind === 'outro'
              ? 'Debrief'
              : scene.id;
    // YouTube needs a 00:00 first chapter and ≥10s spacing; emit all beats and
    // let the uploader thin them if desired.
    lines.push(`${mm}:${ss} ${label}`);
    frame += sceneFrames(scene);
  }
  const totalSec = Math.round(frame / FPS);
  lines.push('', `# runtime ${Math.floor(totalSec / 60)}m ${totalSec % 60}s`);
  return lines.join('\n');
}

const META = {
  'mission-standard-battle': {
    id: 'ep05-standard-battle-full',
    compositionId: 'Episode05',
    eyebrow: 'Fleet Academy · Episode 5 · Full annotated game',
    headline: 'Every Ply: The Standard Battle',
    subhead:
      'All 57 plies of Mission 2, exactly as annotated in the Advanced Manual.',
    youtubeTitle:
      'Subspace Lattice Academy Ep.5 — Every Ply of a Full Game (57-Ply Surgical Strike)',
    description:
      'Turn-by-turn walkthrough of Mission 2 with the Advanced Manual annotation for every single ply: net counts, Target Locks, Hub-en-prise warnings, and the Surgical Strike finish.',
    introVoiceover:
      'Episode five: the full game, one ply at a time. No skipping, no scrubbing. This is Mission 2 from the Advanced Manual, and every move carries the same annotation you will find in the PDF — including the net counts and Hub warnings.',
    startVoiceover:
      'Starting seat under hybrid-fleet with the teaching clock disarmed. White holds the Initiative Relay Escort forward. Follow the ply counter in the corner; the caption is the manual text for that move.',
    outroHeadline: 'That is a complete fleet game',
    nextEpisode: 'Episode 6 — every ply of the 115-ply sector-clock siege',
  },
  'mission-clock-finish': {
    id: 'ep06-clock-siege-full',
    compositionId: 'Episode06',
    eyebrow: 'Fleet Academy · Episode 6 · Full annotated game',
    headline: 'Every Ply: The Sector-Clock Siege',
    subhead:
      'All 115 plies of Mission 3 — the game the Advanced Manual uses to explain Sector Integration.',
    youtubeTitle:
      'Subspace Lattice Academy Ep.6 — Every Ply of the 115-Ply Sector Integration Siege',
    description:
      'The complete record of Mission 3: dig-in defense, the sector clock arming at ply 100, Contested Space as a stalling weapon, and a win by coverage rather than capture.',
    introVoiceover:
      'Episode six: the long one. One hundred fifteen plies, every move annotated. This is the game where no Hub ever falls and coverage decides it — the reason the sector clock exists.',
    startVoiceover:
      'Full hybrid-fleet rules: Integration Hold, Contested Space, activation at ply one hundred, and the Initiative Relay. Surgical Strike stays legal the whole way; it simply never lands.',
    outroHeadline: 'Won by coverage, not capture',
    nextEpisode: 'Practice against the AI · Read the Advanced Manual',
  },
};

async function main() {
  const tex = await readFile(TEX, 'utf8');
  const missions = parseManual(tex);
  await mkdir(EP_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  for (const mission of missions) {
    const meta = META[mission.id];
    if (!meta) continue;
    const episode = buildEpisode(mission, meta);
    const file = path.join(EP_DIR, `${meta.id}.json`);
    await writeFile(file, `${JSON.stringify(episode, null, 2)}\n`, 'utf8');
    await writeFile(
      path.join(OUT_DIR, `chapters-${meta.id}.txt`),
      `${chapters(episode)}\n`,
      'utf8',
    );
    const frames = episode.scenes.reduce((s, sc) => s + sceneFrames(sc), 0);
    const sec = Math.round(frames / FPS);
    console.log(
      `${meta.compositionId} ← ${mission.id}: ${mission.plies.length} plies, ` +
        `${episode.scenes.length} scenes, ${Math.floor(sec / 60)}m ${sec % 60}s`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
