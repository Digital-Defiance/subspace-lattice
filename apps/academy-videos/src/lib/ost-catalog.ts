/**
 * Fleet OST — one Remotion composition per cue family (no VO).
 * Stems live under public/soundtrack (symlink → web). Stills from story/.
 */

export const OST_FPS = 30;

/** Hold family hero at each track open. */
export const OST_HERO_HOLD_SEC = 10;

/** Default still dwell (Ken Burns + crossfade). */
export const OST_STILL_SEC = 18;

/** Crossfade between stills. */
export const OST_CROSSFADE_SEC = 1.2;

/** Title overlay fade after hero hold. */
export const OST_TITLE_FADE_SEC = 1.5;

export type OstFamily = {
  /** Remotion composition id, e.g. OstVoidCall */
  compositionId: string;
  /** YouTube / file slug */
  id: string;
  title: string;
  /** Matches /soundtrack cue stage */
  stage: string;
  stageTitle: string;
  stems: readonly string[];
  /** Filename under public/story/ep-story-01/ */
  heroAsset: string;
  /** Deterministic shuffle seed for scene bed */
  seed: number;
};

/** Numbered bed stills under public/story/scenes/ */
export const OST_SCENE_FILES: readonly string[] = [
  '1.png',
  '1_5.png',
  '2.png',
  '2_5.png',
  '3.png',
  '3_5.png',
  '4.png',
  '4_5.png',
  '5.png',
  '5_5.png',
  '6.png',
  '6_5.png',
  '7.png',
  '7_5.png',
  '8.png',
  '8_5.png',
  '9.png',
  '9_5.png',
  '10.png',
  '10_5.png',
  '11.png',
  '11_5.png',
  '12.png',
];

export const OST_FAMILIES: readonly OstFamily[] = [
  {
    compositionId: 'OstVoidCall',
    id: 'ost-void-call',
    title: 'Void Call',
    stage: '00',
    stageTitle: 'Command deck',
    stems: ['Void Call', 'Void Call 2'],
    heroAsset: 'title.png',
    seed: 11,
  },
  {
    compositionId: 'OstPreMission',
    id: 'ost-pre-mission',
    title: 'Pre-Mission Tension',
    stage: '01',
    stageTitle: 'Lobby',
    stems: ['Pre-Mission Tension', 'Pre-Mission Tension 2'],
    heroAsset: 'signal-architecture.png',
    seed: 22,
  },
  {
    compositionId: 'OstVoidPulse',
    id: 'ost-void-pulse',
    title: 'Void Pulse',
    stage: '02',
    stageTitle: 'Opening',
    stems: ['Void Pulse', 'Void Pulse 2', 'Void Pulse 3', 'Void Pulse 4'],
    heroAsset: 'the-unmapped-dark.png',
    seed: 33,
  },
  {
    compositionId: 'OstVoidProtocol',
    id: 'ost-void-protocol',
    title: 'Void Protocol',
    stage: '03',
    stageTitle: 'Midgame',
    stems: [
      'Void Protocol',
      'Void Protocol 2',
      'Void Protocol 3',
      'Void Protocol 4',
    ],
    heroAsset: 'electronic-warfare.png',
    seed: 44,
  },
  {
    compositionId: 'OstColdCalculations',
    id: 'ost-cold-calculations',
    title: 'Cold Calculations',
    stage: '04',
    stageTitle: 'Siege',
    stems: [
      'Cold Calculations',
      'Cold Calculations 2',
      'Cold Calculations 3',
      'Cold Calculations 4',
    ],
    heroAsset: 'the-singularity.png',
    seed: 55,
  },
  {
    compositionId: 'OstThermalCount',
    id: 'ost-thermal-count',
    title: 'The Last Thermal Count',
    stage: '05',
    stageTitle: 'Terminal Overclock',
    stems: ['The Last Thermal Count', 'The Last Thermal Count 2'],
    heroAsset: 'the-singularity-b.png',
    seed: 66,
  },
  {
    compositionId: 'OstFinalAlgorithm',
    id: 'ost-final-algorithm',
    title: 'The Final Algorithm',
    stage: '06',
    stageTitle: 'Resolution · win',
    stems: ['The Final Algorithm', 'The Final Algorithm 2'],
    heroAsset: 'decisive-resolution.png',
    seed: 77,
  },
  {
    compositionId: 'OstLastSignal',
    id: 'ost-last-signal',
    title: 'Last Signal Fades',
    stage: '06',
    stageTitle: 'Resolution · loss',
    stems: ['Last Signal Fades', 'Last Signal Fades 2'],
    heroAsset: 'outro.png',
    seed: 88,
  },
];

export function ostSoundtrackStaticPath(stem: string): string {
  return `soundtrack/${stem}.mp3`;
}

export function ostHeroStaticPath(heroAsset: string): string {
  return `story/ep-story-01/${heroAsset}`;
}

export function ostSceneStaticPath(file: string): string {
  return `story/scenes/${file}`;
}

/** Mulberry32 — deterministic shuffle for still beds. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  let t = seed >>> 0;
  const rand = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

/**
 * Still dwell scales gently with track length so 8-minute stems
 * don't flip every 18s into a slideshow panic.
 */
export function ostStillDwellSec(trackSec: number): number {
  if (trackSec >= 360) return 24;
  if (trackSec >= 240) return 20;
  return OST_STILL_SEC;
}
