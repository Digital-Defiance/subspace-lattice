import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listGameSounds,
  playGameSound,
  stopGameSounds,
  unlockGameAudio,
  type LatticeGameSound,
} from '../lib/game-sounds';
import './Soundboard.scss';

/** Human titles — keep aligned with scripts/sfx/lattice-sfx.json. */
const SOUND_TITLES: Record<LatticeGameSound, string> = {
  'game-start': 'Match / mission spool-up',
  'command-overload': 'Command Overload / EMP',
  'infiltrator-warp': 'Infiltrator Warp',
  'infiltrator-spool': 'Infiltrator Spool',
  'target-lock': 'Target Lock',
  'surgical-strike': 'Surgical Strike',
  'clock-arm': 'Clock Arm',
  'sector-integration': 'Sector Integration',
  resignation: 'Resignation',
  'emp-charged': 'EMP Charged',
  'escort-move': 'Escort Move',
  'command-hub-move': 'Command Hub Move',
  'beam-move': 'Beam Move',
  'refractor-move': 'Refractor Move',
  'carrier-move': 'Carrier Move',
  capture: 'Capture',
  'phase-three-initiated': 'Phase Three Initiated',
  'terminal-overclock-charged': 'Terminal Overclock Charged',
  'thermal-runaway-radius-expanded': 'Thermal Runaway Radius Expanded',
  'terminal-overclock-fired': 'Terminal Overclock Fired',
};

interface SoundGroup {
  id: string;
  title: string;
  blurb: string;
  sounds: readonly LatticeGameSound[];
}

const GROUPS: readonly SoundGroup[] = [
  {
    id: 'match',
    title: 'Match & outcomes',
    blurb: 'Open, finish, and resign.',
    sounds: [
      'game-start',
      'surgical-strike',
      'sector-integration',
      'resignation',
      'clock-arm',
    ],
  },
  {
    id: 'moves',
    title: 'Ship moves',
    blurb: 'Per-type footfalls on the lattice.',
    sounds: [
      'escort-move',
      'command-hub-move',
      'beam-move',
      'refractor-move',
      'carrier-move',
      'infiltrator-warp',
      'infiltrator-spool',
    ],
  },
  {
    id: 'combat',
    title: 'Combat & midgame EMP',
    blurb: 'Captures, locks, and Command Overload.',
    sounds: [
      'capture',
      'target-lock',
      'emp-charged',
      'command-overload',
    ],
  },
  {
    id: 'terminal',
    title: 'Terminal Overclock',
    blurb: 'Phase three — initiate, charge, bloom, fire.',
    sounds: [
      'phase-three-initiated',
      'terminal-overclock-charged',
      'thermal-runaway-radius-expanded',
      'terminal-overclock-fired',
    ],
  },
];

function titleFor(id: LatticeGameSound): string {
  return SOUND_TITLES[id] ?? id;
}

export function Soundboard() {
  const [lastPlayed, setLastPlayed] = useState<LatticeGameSound | null>(null);
  const catalog = new Set(listGameSounds());
  const grouped = new Set(GROUPS.flatMap((g) => g.sounds));
  const orphan = listGameSounds().filter((id) => !grouped.has(id));

  const play = (id: LatticeGameSound) => {
    unlockGameAudio();
    playGameSound(id, { force: true });
    setLastPlayed(id);
  };

  return (
    <main className="soundboard" data-testid="soundboard">
      <div className="soundboard__atmosphere" aria-hidden="true" />
      <header className="soundboard__header">
        <p className="soundboard__eyebrow">Internal · not linked from nav</p>
        <h1 className="soundboard__title">Soundboard</h1>
        <p className="soundboard__lede">
          Every catalogued fleet SFX. Plays even if Options mute is on.
        </p>
        <div className="soundboard__actions">
          <button
            type="button"
            className="soundboard__ghost"
            onClick={() => stopGameSounds()}
          >
            Stop all
          </button>
          <Link to="/" className="soundboard__ghost soundboard__ghost--link">
            ← Home
          </Link>
        </div>
      </header>

      <div className="soundboard__groups">
        {GROUPS.map((group) => (
          <section
            key={group.id}
            className="soundboard__group"
            aria-labelledby={`soundboard-${group.id}`}
          >
            <div className="soundboard__group-head">
              <h2 id={`soundboard-${group.id}`}>{group.title}</h2>
              <p>{group.blurb}</p>
            </div>
            <ul className="soundboard__grid">
              {group.sounds
                .filter((id) => catalog.has(id))
                .map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      className={`soundboard__pad${
                        lastPlayed === id ? ' soundboard__pad--live' : ''
                      }`}
                      onClick={() => play(id)}
                      data-testid={`soundboard-${id}`}
                    >
                      <span className="soundboard__pad-title">
                        {titleFor(id)}
                      </span>
                      <span className="soundboard__pad-id">{id}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}

        {orphan.length > 0 && (
          <section
            className="soundboard__group"
            aria-labelledby="soundboard-other"
          >
            <div className="soundboard__group-head">
              <h2 id="soundboard-other">Uncategorized</h2>
              <p>Present in the catalog but not yet grouped.</p>
            </div>
            <ul className="soundboard__grid">
              {orphan.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    className={`soundboard__pad${
                      lastPlayed === id ? ' soundboard__pad--live' : ''
                    }`}
                    onClick={() => play(id)}
                    data-testid={`soundboard-${id}`}
                  >
                    <span className="soundboard__pad-title">{titleFor(id)}</span>
                    <span className="soundboard__pad-id">{id}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
