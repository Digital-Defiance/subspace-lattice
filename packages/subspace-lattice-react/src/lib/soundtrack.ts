/**
 * Optional adaptive soundtrack — pools under /soundtrack/*.mp3
 *
 * UI scenes:
 * - command-deck (landing `/`): Void Call → Void Call 2 sequential loop
 * - lobby (`/play` pre-match): Pre-Mission Tension → 2 sequential loop
 *
 * Match phases (priority: resolved > terminal > siege > midgame > opening):
 * - opening: Void Pulse 1–4 until first contested Sensor Net tile
 * - midgame: Void Protocol 1–4 until ply≥sectorActivation or Terminal
 * - siege: Cold Calculations 1–4 when Sector Integration clock arms
 * - terminal: The Last Thermal Count when Phase 3 arms (overrides siege)
 * - resolved: kill loops; Final Algorithm (win) / Last Signal Fades (loss)
 */

import {
  PlayerColor,
  type GameState,
  type RulesConfig,
  type SubspaceLatticeEngine,
} from '@subspace-lattice/core';

export type SoundtrackPhase =
  | 'command-deck'
  | 'lobby'
  | 'opening'
  | 'midgame'
  | 'siege'
  | 'terminal'
  | 'resolved';

/** Where the player is in the app chrome. */
export type SoundtrackScene = 'command-deck' | 'lobby' | 'match' | 'idle';

const FADE_MS = 420;

/** Default match-level music loudness (pre-Options slider). */
export const DEFAULT_SOUNDTRACK_VOLUME = 0.38;
export const SOUNDTRACK_VOLUME_STORAGE_KEY =
  'subspace-lattice.soundtrackVolume.v1';
const VOLUME_CHANGE_EVENT = 'subspace-lattice:soundtrack-volume';

const VOID_CALL = ['Void Call', 'Void Call 2'] as const;
const PRE_MISSION = [
  'Pre-Mission Tension',
  'Pre-Mission Tension 2',
] as const;
const VOID_PULSE = [
  'Void Pulse',
  'Void Pulse 2',
  'Void Pulse 3',
  'Void Pulse 4',
] as const;
const VOID_PROTOCOL = [
  'Void Protocol',
  'Void Protocol 2',
  'Void Protocol 3',
  'Void Protocol 4',
] as const;
const COLD_CALCULATIONS = [
  'Cold Calculations',
  'Cold Calculations 2',
  'Cold Calculations 3',
  'Cold Calculations 4',
] as const;
const THERMAL_COUNT = [
  'The Last Thermal Count',
  'The Last Thermal Count 2',
] as const;
const FINAL_ALGORITHM = [
  'The Final Algorithm',
  'The Final Algorithm 2',
] as const;
const LAST_SIGNAL = ['Last Signal Fades', 'Last Signal Fades 2'] as const;

type LoopPhase = Exclude<SoundtrackPhase, 'resolved'>;

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SOUNDTRACK_VOLUME;
  return Math.min(1, Math.max(0, value));
}

function readStoredVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_SOUNDTRACK_VOLUME;
  try {
    const raw = localStorage.getItem(SOUNDTRACK_VOLUME_STORAGE_KEY);
    if (raw == null) return DEFAULT_SOUNDTRACK_VOLUME;
    return clampVolume(Number.parseFloat(raw));
  } catch {
    return DEFAULT_SOUNDTRACK_VOLUME;
  }
}

let soundtrackVolume = readStoredVolume();
let currentAudio: HTMLAudioElement | null = null;
let fadeRaf: number | null = null;

function applySoundtrackVolumeLive(): void {
  if (currentAudio && fadeRaf == null) {
    currentAudio.volume = soundtrackVolume;
  }
}

export function getSoundtrackVolume(): number {
  return soundtrackVolume;
}

export function setSoundtrackVolume(volume: number): void {
  soundtrackVolume = clampVolume(volume);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(
        SOUNDTRACK_VOLUME_STORAGE_KEY,
        String(soundtrackVolume),
      );
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(VOLUME_CHANGE_EVENT));
  }
  applySoundtrackVolumeLive();
}

export function subscribeSoundtrackVolume(
  onStoreChange: () => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === SOUNDTRACK_VOLUME_STORAGE_KEY ||
      event.key === null
    ) {
      soundtrackVolume = readStoredVolume();
      applySoundtrackVolumeLive();
      onStoreChange();
    }
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(VOLUME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(VOLUME_CHANGE_EVENT, onStoreChange);
  };
}

function srcFor(stem: string): string {
  return `/soundtrack/${encodeURIComponent(stem)}.mp3`;
}

export function hasContestedSensorNet(engine: SubspaceLatticeEngine): boolean {
  if (!engine.isHybrid()) return false;
  const white = engine.getSensorNetSet(PlayerColor.White);
  const black = engine.getSensorNetSet(PlayerColor.Black);
  for (const key of white) {
    if (black.has(key)) return true;
  }
  return false;
}

export function resolveSoundtrackPhase(
  engine: SubspaceLatticeEngine,
): SoundtrackPhase {
  const state = engine.getState();
  if (state.winner) return 'resolved';
  if (state.terminalPhaseArmed) return 'terminal';

  const contested = hasContestedSensorNet(engine);
  if (!contested) return 'opening';

  const activation = engine.getRules().sectorActivationPly ?? 0;
  const ply = state.plyCount ?? 0;
  if (activation > 0 && ply >= activation) return 'siege';
  return 'midgame';
}

function poolForPhase(phase: LoopPhase): readonly string[] {
  switch (phase) {
    case 'command-deck':
      return VOID_CALL;
    case 'lobby':
      return PRE_MISSION;
    case 'opening':
      return VOID_PULSE;
    case 'midgame':
      return VOID_PROTOCOL;
    case 'siege':
      return COLD_CALCULATIONS;
    case 'terminal':
      return THERMAL_COUNT;
  }
}

/** Sequential pools play in order; shuffle pools pick at random (avoid last). */
function isSequentialPhase(phase: LoopPhase): boolean {
  return phase === 'command-deck' || phase === 'lobby';
}

function pickTrack(
  pool: readonly string[],
  avoid: string | null,
  sequentialIndex: number | null,
): { stem: string; nextIndex: number | null } {
  if (pool.length === 0) return { stem: '', nextIndex: null };
  if (sequentialIndex != null) {
    const idx = ((sequentialIndex % pool.length) + pool.length) % pool.length;
    const stem = pool[idx] ?? pool[0] ?? '';
    return {
      stem,
      nextIndex: (idx + 1) % pool.length,
    };
  }
  if (pool.length === 1) {
    return { stem: pool[0] ?? '', nextIndex: null };
  }
  const choices = avoid ? pool.filter((t) => t !== avoid) : [...pool];
  const list = choices.length > 0 ? choices : [...pool];
  return {
    stem: list[Math.floor(Math.random() * list.length)] ?? pool[0] ?? '',
    nextIndex: null,
  };
}

let enabledPreference = false;
let activeMatchKey: string | null = null;
let currentPhase: SoundtrackPhase | null = null;
let lastStem: string | null = null;
/** Next index into sequential pools (command-deck / lobby). */
let sequenceNext = 0;
let generation = 0;

function clearFade(): void {
  if (fadeRaf != null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(fadeRaf);
  }
  fadeRaf = null;
}

function hardStopAudio(): void {
  clearFade();
  if (!currentAudio) return;
  try {
    currentAudio.onended = null;
    currentAudio.pause();
    currentAudio.src = '';
  } catch {
    /* ignore */
  }
  currentAudio = null;
}

function fadeOutThen(done: () => void): void {
  const audio = currentAudio;
  if (!audio) {
    done();
    return;
  }
  clearFade();
  const start = performance.now();
  const from = audio.volume;
  const gen = generation;
  const step = (now: number) => {
    if (gen !== generation) return;
    const t = Math.min(1, (now - start) / FADE_MS);
    audio.volume = from * (1 - t);
    if (t < 1) {
      fadeRaf = requestAnimationFrame(step);
      return;
    }
    hardStopAudio();
    done();
  };
  fadeRaf = requestAnimationFrame(step);
}

function playStem(
  stem: string,
  opts: { loopChain: boolean; phase: SoundtrackPhase },
): void {
  if (!stem || typeof Audio === 'undefined') return;
  const audio = new Audio(srcFor(stem));
  audio.volume = soundtrackVolume;
  audio.preload = 'auto';
  currentAudio = audio;
  lastStem = stem;
  const gen = generation;
  audio.onended = () => {
    if (gen !== generation) return;
    if (!opts.loopChain || currentPhase !== opts.phase) return;
    if (opts.phase === 'resolved') return;
    const phase = opts.phase as LoopPhase;
    const pool = poolForPhase(phase);
    const sequential = isSequentialPhase(phase);
    const { stem: next, nextIndex } = pickTrack(
      pool,
      lastStem,
      sequential ? sequenceNext : null,
    );
    if (sequential && nextIndex != null) sequenceNext = nextIndex;
    playStem(next, opts);
  };
  void Promise.resolve(audio.play()).then(undefined, () => {
    /* autoplay blocked — wait for next user gesture sync */
  });
}

function startPhaseLoop(phase: LoopPhase): void {
  generation += 1;
  const gen = generation;
  const pool = poolForPhase(phase);
  const sequential = isSequentialPhase(phase);
  if (sequential) sequenceNext = 0;
  const begin = () => {
    if (gen !== generation) return;
    currentPhase = phase;
    const { stem, nextIndex } = pickTrack(
      pool,
      lastStem,
      sequential ? sequenceNext : null,
    );
    if (sequential && nextIndex != null) sequenceNext = nextIndex;
    playStem(stem, { loopChain: true, phase });
  };
  if (currentAudio) fadeOutThen(begin);
  else begin();
}

function playResolution(
  state: GameState,
  localPlayer: PlayerColor | 'OBSERVER' | null,
): void {
  generation += 1;
  const gen = generation;
  const lost =
    localPlayer &&
    localPlayer !== 'OBSERVER' &&
    state.winner &&
    state.winner !== localPlayer;
  const pool = lost ? LAST_SIGNAL : FINAL_ALGORITHM;
  const { stem } = pickTrack(pool, null, null);
  const begin = () => {
    if (gen !== generation) return;
    currentPhase = 'resolved';
    playStem(stem, { loopChain: false, phase: 'resolved' });
  };
  if (currentAudio) fadeOutThen(begin);
  else begin();
}

/** Stop all soundtrack audio (Options off, leave match, unmount). */
export function stopSoundtrack(): void {
  generation += 1;
  hardStopAudio();
  currentPhase = null;
  lastStem = null;
  activeMatchKey = null;
  sequenceNext = 0;
}

export function setSoundtrackPreference(enabled: boolean): void {
  enabledPreference = enabled;
  if (!enabled) stopSoundtrack();
}

export function isSoundtrackPreferenceEnabled(): boolean {
  return enabledPreference;
}

export type SyncSoundtrackArgs = {
  enabled: boolean;
  scene: SoundtrackScene;
  /** Required when `scene === 'match'`. */
  matchKey?: string | null;
  matchLive?: boolean;
  engine?: SubspaceLatticeEngine | null;
  localPlayer?: PlayerColor | 'OBSERVER' | null;
};

/**
 * Drive the soundtrack from UI scene + optional live match engine.
 * Safe to call every ply / every React sync.
 */
export function syncSoundtrack(args: SyncSoundtrackArgs): void {
  enabledPreference = args.enabled;

  if (!args.enabled || args.scene === 'idle') {
    if (currentAudio || currentPhase) stopSoundtrack();
    return;
  }

  if (args.scene === 'command-deck' || args.scene === 'lobby') {
    activeMatchKey = null;
    if (currentPhase !== args.scene) {
      startPhaseLoop(args.scene);
    }
    return;
  }

  // match
  if (!args.matchLive || !args.engine) {
    if (currentAudio || currentPhase) stopSoundtrack();
    return;
  }

  const key = args.matchKey ?? 'match';
  if (activeMatchKey && activeMatchKey !== key) {
    stopSoundtrack();
  }
  if (!activeMatchKey) activeMatchKey = key;

  const phase = resolveSoundtrackPhase(args.engine);
  const state = args.engine.getState();

  // Fresh game after a finished one (same matchKey rematch).
  if (
    currentPhase === 'resolved' &&
    phase !== 'resolved' &&
    !state.winner
  ) {
    hardStopAudio();
    currentPhase = null;
    lastStem = null;
  }

  if (phase === 'resolved') {
    if (currentPhase !== 'resolved') {
      playResolution(state, args.localPlayer ?? null);
    }
    return;
  }

  if (phase !== currentPhase) {
    startPhaseLoop(phase);
  }
}

/** Test helper — current phase while audio is managed. */
export function getSoundtrackPhaseForTests(): SoundtrackPhase | null {
  return currentPhase;
}

/** @internal rules helper for specs without a full engine when needed */
export function soundtrackActivationPly(rules: RulesConfig): number {
  return rules.sectorActivationPly ?? 0;
}

/** Test helper — track stems per phase. */
export function soundtrackPhasePools(): Record<LoopPhase, readonly string[]> {
  return {
    'command-deck': [...VOID_CALL],
    lobby: [...PRE_MISSION],
    opening: [...VOID_PULSE],
    midgame: [...VOID_PROTOCOL],
    siege: [...COLD_CALCULATIONS],
    terminal: [...THERMAL_COUNT],
  };
}
