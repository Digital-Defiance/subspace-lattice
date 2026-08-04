/**
 * Fleet SFX playback — clips from `yarn sfx` → apps/web/public/sfx/<id>.mp3
 *
 * Keep ids in sync with scripts/sfx/lattice-sfx.json.
 */

import {
  GameState,
  MoveInfo,
  PieceType,
  PlayerColor,
  RulesConfig,
  SubspaceLatticeEngine,
} from '@subspace-lattice/core';

export type LatticeGameSound =
  | 'game-start'
  | 'command-overload'
  | 'infiltrator-warp'
  | 'infiltrator-spool'
  | 'target-lock'
  | 'surgical-strike'
  | 'clock-arm'
  | 'sector-integration'
  | 'resignation'
  | 'emp-charged'
  | 'escort-move'
  | 'command-hub-move'
  | 'beam-move'
  | 'refractor-move'
  | 'carrier-move'
  | 'capture'
  | 'phase-three-initiated'
  | 'terminal-overclock-charged'
  | 'thermal-runaway-radius-expanded'
  | 'terminal-overclock-fired';

const SOUND_SRC: Record<LatticeGameSound, string> = {
  'game-start': '/sfx/game-start.mp3',
  'command-overload': '/sfx/command-overload.mp3',
  'infiltrator-warp': '/sfx/infiltrator-warp.mp3',
  'infiltrator-spool': '/sfx/infiltrator-spool.mp3',
  'target-lock': '/sfx/target-lock.mp3',
  'surgical-strike': '/sfx/surgical-strike.mp3',
  'clock-arm': '/sfx/clock-arm.mp3',
  'sector-integration': '/sfx/sector-integration.mp3',
  resignation: '/sfx/resignation.mp3',
  'emp-charged': '/sfx/emp-charged.mp3',
  'escort-move': '/sfx/escort-move.mp3',
  'command-hub-move': '/sfx/command-hub-move.mp3',
  'beam-move': '/sfx/beam-move.mp3',
  'refractor-move': '/sfx/refractor-move.mp3',
  'carrier-move': '/sfx/carrier-move.mp3',
  capture: '/sfx/capture.mp3',
  'phase-three-initiated': '/sfx/phase-three-initiated.mp3',
  'terminal-overclock-charged': '/sfx/terminal-overclock-charged.mp3',
  'thermal-runaway-radius-expanded':
    '/sfx/thermal-runaway-radius-expanded.mp3',
  'terminal-overclock-fired': '/sfx/terminal-overclock-fired.mp3',
};

const ALL_SOUNDS = Object.keys(SOUND_SRC) as LatticeGameSound[];

export const GAME_SOUNDS_MUTED_STORAGE_KEY = 'lattice-sounds-muted';
export const GAME_SOUNDS_VOLUME_STORAGE_KEY =
  'subspace-lattice.gameSoundsVolume.v1';
const MUTE_CHANGE_EVENT = 'lattice-sounds-muted-change';
const VOLUME_CHANGE_EVENT = 'lattice-sounds-volume-change';

/** Default matches the previous hard-coded one-shot level. */
export const DEFAULT_GAME_SOUNDS_VOLUME = 0.85;

let soundsMuted = readStoredMuted();
let soundsVolume = readStoredVolume();
const activeAudio = new Set<HTMLAudioElement>();

export function readStoredGameSoundsMuted(): boolean {
  return readStoredMuted();
}

function readStoredMuted(): boolean {
  try {
    return localStorage.getItem(GAME_SOUNDS_MUTED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GAME_SOUNDS_VOLUME;
  return Math.min(1, Math.max(0, value));
}

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(GAME_SOUNDS_VOLUME_STORAGE_KEY);
    if (raw == null) return DEFAULT_GAME_SOUNDS_VOLUME;
    return clampVolume(Number.parseFloat(raw));
  } catch {
    return DEFAULT_GAME_SOUNDS_VOLUME;
  }
}

export function storeGameSoundsMuted(muted: boolean): void {
  try {
    localStorage.setItem(GAME_SOUNDS_MUTED_STORAGE_KEY, String(muted));
  } catch {
    /* ignore quota / private mode */
  }
}

export function setGameSoundsMuted(muted: boolean): void {
  soundsMuted = muted;
  storeGameSoundsMuted(muted);
  if (muted) stopGameSounds();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(MUTE_CHANGE_EVENT));
  }
}

export function areGameSoundsMuted(): boolean {
  return soundsMuted;
}

export function getGameSoundsVolume(): number {
  return soundsVolume;
}

export function setGameSoundsVolume(volume: number): void {
  soundsVolume = clampVolume(volume);
  try {
    localStorage.setItem(GAME_SOUNDS_VOLUME_STORAGE_KEY, String(soundsVolume));
  } catch {
    /* ignore */
  }
  for (const audio of activeAudio) {
    audio.volume = soundsVolume;
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(VOLUME_CHANGE_EVENT));
  }
}

/** Subscribe to mute preference changes (same-tab + cross-tab). */
export function subscribeGameSoundsMuted(
  onStoreChange: () => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === GAME_SOUNDS_MUTED_STORAGE_KEY ||
      event.key === null
    ) {
      soundsMuted = readStoredMuted();
      onStoreChange();
    }
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(MUTE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(MUTE_CHANGE_EVENT, onStoreChange);
  };
}

/** Subscribe to effects volume changes (same-tab + cross-tab). */
export function subscribeGameSoundsVolume(
  onStoreChange: () => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === GAME_SOUNDS_VOLUME_STORAGE_KEY ||
      event.key === null
    ) {
      soundsVolume = readStoredVolume();
      for (const audio of activeAudio) {
        audio.volume = soundsVolume;
      }
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

export function stopGameSounds(): void {
  for (const audio of activeAudio) {
    audio.pause();
    audio.currentTime = 0;
  }
  activeAudio.clear();
}

/**
 * Play a catalogued effect. Concurrent one-shots are allowed (game-start can
 * overlap a later chirp). No-ops when muted. Never throws — SFX must not
 * block game actions (some environments' Audio.play() is sync/undefined).
 */
export function playGameSound(
  id: LatticeGameSound,
  opts?: { volume?: number; /** Ignore Options mute (soundboard). */ force?: boolean },
): HTMLAudioElement | null {
  if (soundsMuted && !opts?.force) return null;
  const src = SOUND_SRC[id];
  if (!src) return null;

  try {
    const audio = new Audio(src);
    audio.volume = Math.min(
      1,
      Math.max(0, opts?.volume ?? soundsVolume),
    );
    activeAudio.add(audio);
    const release = () => {
      activeAudio.delete(audio);
    };
    audio.addEventListener('ended', release, { once: true });
    audio.addEventListener('error', release, { once: true });
    // jsdom / some webviews leave play() unimplemented (returns undefined).
    void Promise.resolve(audio.play()).then(undefined, release);
    return audio;
  } catch {
    return null;
  }
}

export function playGameSounds(ids: readonly LatticeGameSound[]): void {
  for (const id of ids) {
    try {
      playGameSound(id);
    } catch {
      /* ignore */
    }
  }
}

/** Call from a click / key handler before the first play if needed. */
export function unlockGameAudio(): void {
  try {
    const ctx = new AudioContext();
    void ctx.resume();
  } catch {
    /* ignore */
  }
}

export function listGameSounds(): readonly LatticeGameSound[] {
  return ALL_SOUNDS;
}

function chebyshev(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function moveSoundForPieceType(type: PieceType): LatticeGameSound | null {
  switch (type) {
    case PieceType.Escort:
      return 'escort-move';
    case PieceType.CommandHub:
      return 'command-hub-move';
    case PieceType.Beam:
      return 'beam-move';
    case PieceType.Refractor:
      return 'refractor-move';
    case PieceType.Carrier:
      return 'carrier-move';
    case PieceType.Infiltrator:
      // Locked / ortho crawl — soft step; jumps use infiltrator-warp separately.
      return 'escort-move';
    default:
      return null;
  }
}

function gainedSpoolTarget(before: GameState, after: GameState): boolean {
  for (const [id, piece] of Object.entries(after.pieces ?? {})) {
    if (!piece.spoolTarget) continue;
    const prev = before.pieces?.[id];
    if (!prev?.spoolTarget) return true;
    if (
      prev.spoolTarget.x !== piece.spoolTarget.x ||
      prev.spoolTarget.y !== piece.spoolTarget.y
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Derive SFX from a before/after ply. Uses MoveInfo when present (local
 * engines); otherwise infers from state deltas (online Firestore sync).
 */
export function collectLatticeSoundsAfterPly(
  before: GameState,
  after: GameState,
  rules: RulesConfig,
  moveInfo?: MoveInfo | null,
): LatticeGameSound[] {
  const play: LatticeGameSound[] = [];

  // EMP may end the game (Lockout) on the same ply — fire SFX before the
  // winner early-return so Terminal / midgame overload still audibles.
  const empFired =
    Boolean(moveInfo?.empFired) || (!before.empActive && Boolean(after.empActive));
  if (empFired) {
    const terminalFire =
      moveInfo?.terminalEmp === true ||
      Object.values(after.pieces ?? {}).some((p) => p.enginesFused);
    play.push(
      terminalFire ? 'terminal-overclock-fired' : 'command-overload',
    );
  }

  if (!before.winner && after.winner) {
    switch (after.winnerReason) {
      case 'hub-capture':
        play.push('surgical-strike');
        break;
      case 'sector-integration':
        play.push('sector-integration');
        break;
      case 'resign':
      case 'ai-resigned':
        play.push('resignation');
        break;
      default:
        break;
    }
    // Terminal plies: don't also fire move SFX from stale lastMoveInfo.
    return play;
  }

  if (!empFired) {
    if (moveInfo?.spoolAnnounce || gainedSpoolTarget(before, after)) {
      play.push('infiltrator-spool');
    } else if (!moveInfo?.spoolFailed) {
      // Piece relocation SFX (failed jump — no board move).
      let movedType: PieceType | null = moveInfo?.moverType ?? null;
      let moveDist = 0;
      for (const [id, piece] of Object.entries(after.pieces ?? {})) {
        const prev = before.pieces?.[id];
        if (!prev) continue;
        const dist = chebyshev(prev.position, piece.position);
        if (dist === 0) continue;
        movedType = piece.type;
        moveDist = dist;
        break;
      }
      if (movedType === PieceType.Infiltrator && moveDist > 1) {
        play.push('infiltrator-warp');
      } else if (movedType) {
        const moveSound = moveSoundForPieceType(movedType);
        if (moveSound) play.push(moveSound);
      }

      if (
        moveInfo?.capturedType ||
        Object.keys(before.pieces ?? {}).some((id) => !after.pieces?.[id])
      ) {
        play.push('capture');
      }
    }
  }

  const beforeEng = SubspaceLatticeEngine.fromState(before, rules);
  const afterEng = SubspaceLatticeEngine.fromState(after, rules);
  for (const piece of Object.values(after.pieces ?? {})) {
    const prev = before.pieces?.[piece.id];
    if (!prev) continue;
    const was = beforeEng.isPieceDetected(prev);
    const now = afterEng.isPieceDetected(piece);
    if (!was && now) {
      play.push('target-lock');
      break;
    }
  }

  // Terminal Phase 3: last non-Hub falls → shared phase arms (counter @ 0).
  if (!before.terminalPhaseArmed && after.terminalPhaseArmed) {
    play.push('phase-three-initiated');
  }

  // Radius bloom while the shared Terminal phase is already live.
  if (before.terminalPhaseArmed && after.terminalPhaseArmed) {
    const rBefore = Math.max(
      beforeEng.getEmpRadius(PlayerColor.White),
      beforeEng.getEmpRadius(PlayerColor.Black),
    );
    const rAfter = Math.max(
      afterEng.getEmpRadius(PlayerColor.White),
      afterEng.getEmpRadius(PlayerColor.Black),
    );
    if (rAfter > rBefore) {
      play.push('thermal-runaway-radius-expanded');
    }
  }

  // Charge reached fire threshold: Terminal → terminal-overclock-charged; else emp-charged.
  for (const color of [PlayerColor.White, PlayerColor.Black]) {
    const target = afterEng.getEmpChargeTarget(color);
    if (target <= 0) continue;
    const b = before.empCharge?.[color] ?? 0;
    const a = after.empCharge?.[color] ?? 0;
    if (b < target && a >= target) {
      play.push(
        afterEng.isTerminalOverclock(color)
          ? 'terminal-overclock-charged'
          : 'emp-charged',
      );
      break;
    }
  }

  const activation = rules.sectorActivationPly ?? 0;
  if (
    activation > 0 &&
    (before.plyCount ?? 0) < activation &&
    (after.plyCount ?? 0) >= activation
  ) {
    play.push('clock-arm');
  }

  return play;
}

/** Snapshot before a local ply, then play derived sounds after the engine mutates. */
export function playLatticeSoundsAfterPly(
  before: GameState,
  engine: SubspaceLatticeEngine,
): void {
  try {
    const after = engine.getState();
    const sounds = collectLatticeSoundsAfterPly(
      before,
      after,
      engine.getRules(),
      engine.getLastMoveInfo(),
    );
    playGameSounds(sounds);
  } catch (err) {
    console.warn('[lattice-sfx] play after ply failed', err);
  }
}
