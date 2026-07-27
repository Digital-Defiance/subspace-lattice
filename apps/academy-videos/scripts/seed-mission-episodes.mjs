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

/** Phase cards are mission-specific so the win condition is stated once, not every ply. */
function phaseCopy(missionId, phase) {
  if (missionId === 'mission-clock-finish') {
    return {
      opening: {
        headline: 'Opening · stockpile coverage',
        bullets: [
          'Escorts first — they grow Sovereign Space',
          'Hubs will march for territory, not mate',
          'Beams reposition inside existing glow',
        ],
        voiceover:
          'Opening. This game digs in — Strike will not land — so early Escorts and Hub walks are stockpiling Sovereign Space for the clock. Quiet hops are relay work; the plan is coverage, not a highlight-reel capture.',
      },
      midgame: {
        headline: 'Midgame · thin relays, keep radiating',
        bullets: [
          'Trades that kill linking Escorts matter most',
          'Beam trades clear the board for a coverage race',
          'Hub marches reshape who owns cells',
        ],
        voiceover:
          'Midgame. Peel relays that hold the enemy net, trade Beams off when dreadnoughts stop mattering, and keep Hub walks aimed at territory. You are still building toward activation, not hunting a hang.',
      },
      endgame: {
        headline: 'Endgame · hold the Integration line',
        bullets: [
          'After ply 100, coverage can win',
          'Contested Space breaks a streak',
          'Hub steps are scoreboard moves',
        ],
        voiceover:
          'Endgame. The clock is live. Push Sovereign Space over the Integration line and make the hold survive the reply. Contested purple counts for neither side — use it to stall. Strike is still legal; here saturation finishes it.',
      },
    }[phase];
  }
  return {
    opening: {
      headline: 'Opening · build the Strike scaffold',
      bullets: [
        'Park Beams on files you will later shoot down',
        'Escorts grow the glow those Beams ride',
        'Initiative Relay buys early midboard coverage',
      ],
      voiceover:
        'Opening. White is scaffolding a Surgical Strike: park Beams on the files that will matter, then grow Escorts so those Beams can slide. Quiet Escort hops are relay work — skim them; the plan is the Hub, not painting the map.',
    },
    midgame: {
      headline: 'Midgame · open the Hub files',
      bullets: [
        'Cut relay tips that create Target Locks',
        'Hub marches expand the whole lattice',
        'Trade Beams off the files you need clear',
      ],
      voiceover:
        'Midgame. Lift locks, march the Hub so coverage owns the center files, and trade away Beams that block the hunt. Each annotated beat is a job toward peeling Black’s Hub — unmarked hops stay short on purpose.',
    },
    endgame: {
      headline: 'Endgame · peel the screen, take the Hub',
      bullets: [
        'Thin Escorts around the enemy Hub',
        'Hub safety outranks every other plan',
        'One hang ends it — Surgical Strike',
      ],
      voiceover:
        'Endgame. The scaffold pays off: thin the screen, punish a Hub that steps onto a taken square, and convert with Surgical Strike. That is the finish this opening was built for.',
    },
  }[phase];
}

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
 * Quiet setup plies share the short "Seat Piece to (x,y)." shape. Voice the
 * first occurrence of a template fully; later repeats stay as that short line
 * (firstSentence is a no-op when the whole voiceover is one sentence).
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
      const copy = phaseCopy(mission.id, phase);
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
      'Episode five: every ply of Mission 2. White’s plan is Surgical Strike — take Black’s Command Hub. The opening parks Beams and grows Escorts so those Beams can ride; the finish peels the Hub’s screen. Quiet hops stay short on purpose; annotated beats name the job of that move.',
    startVoiceover:
      'Hybrid-fleet start, teaching clock off. White holds the Initiative Relay forward. Watch how Beam parking and relay hops become a Hub hunt — not a race to paint the map.',
    outroHeadline: 'That is a complete Surgical Strike game',
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
      'Episode six: one hundred fifteen plies where Strike never lands. The plan from move one is stockpile Sovereign Space for the sector clock — after ply one hundred, coverage can win. Quiet hops are relay work; the annotated beats are the coverage jobs that matter.',
    startVoiceover:
      'Full hybrid-fleet: clock arms at ply one hundred, Contested Space neutral, Initiative Relay on. Surgical Strike stays legal; this game simply digs in until saturation ends it.',
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
