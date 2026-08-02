import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DocLink, SubspaceLatticeLogo, getSoundtrackVolume } from '@subspace-lattice/react';
import { MarketingNav } from './marketing-nav';
import './story.scss';
import './soundtrack-page.scss';

type Cue = {
  id: string;
  stage: string;
  title: string;
  trigger: string;
  behavior: string;
  tracks: string[];
};

const CUES: Cue[] = [
  {
    id: 'command-deck',
    stage: '00',
    title: 'Command deck',
    trigger: 'Landing on the fleet site',
    behavior: 'Plays in order, then loops while you stay on the deck.',
    tracks: ['Void Call', 'Void Call 2'],
  },
  {
    id: 'lobby',
    stage: '01',
    title: 'Lobby',
    trigger: 'Signed into /play, waiting to deploy',
    behavior: 'Plays in order, then loops until a match begins.',
    tracks: ['Pre-Mission Tension', 'Pre-Mission Tension 2'],
  },
  {
    id: 'opening',
    stage: '02',
    title: 'Opening',
    trigger: 'Match start — nets have not collided yet',
    behavior: 'Shuffles Void Pulse variants until Contested Space appears.',
    tracks: ['Void Pulse', 'Void Pulse 2', 'Void Pulse 3', 'Void Pulse 4'],
  },
  {
    id: 'midgame',
    stage: '03',
    title: 'Midgame',
    trigger: 'First Contested Space tile',
    behavior: 'Shuffles Void Protocol while the fleets grind for position.',
    tracks: [
      'Void Protocol',
      'Void Protocol 2',
      'Void Protocol 3',
      'Void Protocol 4',
    ],
  },
  {
    id: 'siege',
    stage: '04',
    title: 'Siege',
    trigger: 'Sector Integration clock arms (default ply 100)',
    behavior: 'Cold Calculations takes the floor — coverage now decides wars.',
    tracks: [
      'Cold Calculations',
      'Cold Calculations 2',
      'Cold Calculations 3',
      'Cold Calculations 4',
    ],
  },
  {
    id: 'terminal',
    stage: '05',
    title: 'Terminal Overclock',
    trigger: 'Phase 3 arms (lone Hubs)',
    behavior: 'Master interrupt. Overrides siege until the sector resolves.',
    tracks: ['The Last Thermal Count', 'The Last Thermal Count 2'],
  },
  {
    id: 'resolve',
    stage: '06',
    title: 'Resolution',
    trigger: 'Surgical Strike, Lockout, or Sector Integration',
    behavior: 'Loops die. Win and loss each draw from a short stinger pair.',
    tracks: [
      'The Final Algorithm',
      'The Final Algorithm 2',
      'Last Signal Fades',
      'Last Signal Fades 2',
    ],
  },
];

function trackSrc(stem: string): string {
  return `/soundtrack/${encodeURIComponent(stem)}.mp3`;
}

const ALL_TRACKS = CUES.flatMap((cue) => cue.tracks);

function nextPlayThroughStem(stem: string): string | null {
  const index = ALL_TRACKS.indexOf(stem);
  if (index < 0) return null;
  return ALL_TRACKS[(index + 1) % ALL_TRACKS.length];
}

function TrackRow({
  stem,
  activeStem,
  onToggle,
}: {
  stem: string;
  activeStem: string | null;
  onToggle: (stem: string) => void;
}) {
  const playing = activeStem === stem;

  return (
    <li>
      <span>{stem}</span>
      <button
        type="button"
        className={`ost-cue__play${playing ? ' ost-cue__play--active' : ''}`}
        aria-pressed={playing}
        aria-label={playing ? `Stop ${stem}` : `Play ${stem}`}
        onClick={() => onToggle(stem)}
      >
        {playing ? 'Stop' : 'Play'}
      </button>
    </li>
  );
}

export function SoundtrackPage() {
  const briefId = useId();
  const cuesId = useId();
  const chainId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playThroughRef = useRef(false);
  const playStemRef = useRef<(stem: string) => void>(() => undefined);
  const [activeStem, setActiveStem] = useState<string | null>(null);
  const [playThrough, setPlayThrough] = useState(false);

  useEffect(() => {
    playThroughRef.current = playThrough;
  }, [playThrough]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const playStem = (stem: string) => {
    audioRef.current?.pause();
    const audio = new Audio(trackSrc(stem));
    audio.volume = getSoundtrackVolume();
    audio.addEventListener('ended', () => {
      if (audioRef.current !== audio) return;
      const next = playThroughRef.current
        ? nextPlayThroughStem(stem)
        : null;
      if (next) {
        playStemRef.current(next);
        return;
      }
      setActiveStem(null);
      audioRef.current = null;
    });
    audioRef.current = audio;
    void audio.play().then(
      () => setActiveStem(stem),
      () => {
        setActiveStem(null);
        audioRef.current = null;
      },
    );
  };
  playStemRef.current = playStem;

  const toggleStem = (stem: string) => {
    if (activeStem === stem) {
      audioRef.current?.pause();
      audioRef.current = null;
      setActiveStem(null);
      return;
    }
    playStem(stem);
  };

  return (
    <div className="story-page soundtrack-page">
      <MarketingNav
        active="soundtrack"
        cta={{ to: '/play', label: 'Enter Sector 11' }}
      />

      <header className="story-hero">
        <SubspaceLatticeLogo
          className="story-logo"
          width={440}
          ariaLabel="Subspace Lattice"
        />
        <p className="story-classification">IWGF signal score · Adaptive OST</p>
        <h1>Fleet soundtrack</h1>
        <blockquote>
          “The lattice does not hum the same way twice. From the command deck
          to Terminal Overclock, the score tracks the fight you are actually
          in.”
        </blockquote>
      </header>

      <main className="story-content">
        <section className="story-lead" aria-labelledby={briefId}>
          <p className="story-section-label">How it works</p>
          <h2 id={briefId}>Music that follows the mission.</h2>
          <div className="story-prose-columns">
            <p>
              The soundtrack is opt-in. On first visit to the command deck you
              choose Play or Keep quiet; you can change that anytime under
              Options → Audio → Soundtrack. Game sound effects stay separate.
            </p>
            <p>
              In a live match the score advances with the board: nets collide,
              the sector clock arms, Terminal Overclock seals the vents. Win and
              loss each get their own closing signal.
            </p>
          </div>
        </section>

        <section aria-labelledby={cuesId}>
          <p className="story-section-label">Signal cues</p>
          <h2 id={cuesId}>Every stage has a voice.</h2>
          <div className="ost-playback">
            <button
              type="button"
              className={`ost-playback__toggle${playThrough ? ' ost-playback__toggle--active' : ''}`}
              aria-pressed={playThrough}
              aria-describedby={chainId}
              onClick={() => setPlayThrough((on) => !on)}
            >
              {playThrough ? 'Play through on' : 'Play through'}
            </button>
            <p id={chainId}>
              When on, finishing a track starts the next cue in order — from
              command deck through resolution, then wraps.
            </p>
          </div>
          <div className="ost-cues">
            {CUES.map((cue) => (
              <article key={cue.id} id={cue.id} className="ost-cue">
                <span className="ost-cue__stage" aria-hidden="true">
                  {cue.stage}
                </span>
                <div className="ost-cue__body">
                  <p className="ost-cue__trigger">{cue.trigger}</p>
                  <h3>{cue.title}</h3>
                  <p className="ost-cue__behavior">{cue.behavior}</p>
                  <ul className="ost-cue__tracks">
                    {cue.tracks.map((track) => (
                      <TrackRow
                        key={track}
                        stem={track}
                        activeStem={activeStem}
                        onToggle={toggleStem}
                      />
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="story-cta" aria-label="Continue">
          <p>Ready to hear it under fire?</p>
          <div>
            <Link to="/soundboard">Soundboard</Link>
            <Link to="/play">Enter Sector 11</Link>
          </div>
        </section>
      </main>

      <footer className="story-footer">
        Companion to the <Link to="/story">Sector 11 briefing</Link> and{' '}
        <Link to="/soundboard">soundboard</Link>. Fiction sets the mood; the{' '}
        <DocLink doc="rules">official rules</DocLink> still govern the board.
        Prefer the command deck? <Link to="/">Return home</Link>.
      </footer>
    </div>
  );
}
