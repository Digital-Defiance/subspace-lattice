import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  OST_CROSSFADE_SEC,
  OST_HERO_HOLD_SEC,
  OST_SCENE_FILES,
  OST_TITLE_FADE_SEC,
  ostHeroStaticPath,
  ostSceneStaticPath,
  ostStillDwellSec,
  seededShuffle,
  type OstFamily,
} from '../lib/ost-catalog';

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

function KenBurnsStill({
  src,
  localFrame,
  durationInFrames,
  variant,
  opacity,
}: {
  src: string;
  localFrame: number;
  durationInFrames: number;
  variant: number;
  opacity: number;
}) {
  const zoomFrom = variant % 2 === 0 ? 1.0 : 1.08;
  const zoomTo = variant % 2 === 0 ? 1.1 : 1.0;
  const xFrom = variant % 3 === 0 ? 0 : variant % 3 === 1 ? -2.5 : 2;
  const xTo = -xFrom;
  const yFrom = variant % 2 === 0 ? -1.5 : 1.5;
  const yTo = -yFrom;

  const scale = interpolate(
    localFrame,
    [0, durationInFrames],
    [zoomFrom, zoomTo],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const tx = interpolate(localFrame, [0, durationInFrames], [xFrom, xTo], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ty = interpolate(localFrame, [0, durationInFrames], [yFrom, yTo], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ overflow: 'hidden', opacity }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `translate(${tx}%, ${ty}%) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      />
    </AbsoluteFill>
  );
}

function TrackChrome({
  family,
  stem,
  stemIndex,
  stemCount,
}: {
  family: OstFamily;
  stem: string;
  stemIndex: number;
  stemCount: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hold = Math.round(OST_HERO_HOLD_SEC * fps);
  const fade = Math.round(OST_TITLE_FADE_SEC * fps);
  const opacity = interpolate(
    frame,
    [0, Math.round(0.4 * fps), hold, hold + fade],
    [0, 1, 1, 0.35],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        background:
          'linear-gradient(180deg, rgba(3,8,18,0.55) 0%, rgba(3,8,18,0.12) 38%, rgba(3,8,18,0.72) 100%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 72,
          right: 72,
          bottom: 72,
          opacity,
          fontFamily: FONT,
          color: '#e2e8f0',
        }}
      >
        <div
          style={{
            color: '#34e3c5',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          {family.stage} · {family.stageTitle}
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 500,
            lineHeight: 1.1,
            marginBottom: 12,
            textShadow: '0 2px 24px rgba(0,0,0,0.55)',
          }}
        >
          {stem}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 22 }}>
          {family.title}
          {stemCount > 1 ? ` · ${stemIndex + 1} / ${stemCount}` : null}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/**
 * One stem's visuals: hero hold, then rotating scene stills with Ken Burns.
 *
 * Only the active still(s) mount — spawning dozens of <Img> Sequences for
 * multi-minute stems OOMs Chromium ("EncodingError: source image cannot be
 * decoded") under Remotion's default concurrency with ~8MB PNG heroes.
 */
export const OstTrackVisual: React.FC<{
  family: OstFamily;
  stem: string;
  stemIndex: number;
  trackSec: number;
  durationInFrames: number;
}> = ({ family, stem, stemIndex, trackSec, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const heroHold = Math.min(
    durationInFrames,
    Math.round(OST_HERO_HOLD_SEC * fps),
  );
  const crossfade = Math.round(OST_CROSSFADE_SEC * fps);
  const dwellSec = ostStillDwellSec(trackSec);
  const dwell = Math.max(crossfade + 1, Math.round(dwellSec * fps));
  const advance = Math.max(1, dwell - crossfade);

  const bed = useMemo(() => {
    const shuffled = seededShuffle(
      OST_SCENE_FILES,
      family.seed + stemIndex * 97,
    );
    return shuffled.map((file) => staticFile(ostSceneStaticPath(file)));
  }, [family.seed, stemIndex]);

  const heroSrc = staticFile(ostHeroStaticPath(family.heroAsset));

  let layers: React.ReactNode = null;
  if (frame < heroHold) {
    const heroOut = Math.min(crossfade, Math.floor(heroHold / 3));
    const opacity =
      frame >= heroHold - heroOut
        ? interpolate(frame, [heroHold - heroOut, heroHold], [1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        : 1;
    layers = (
      <KenBurnsStill
        src={heroSrc}
        localFrame={frame}
        durationInFrames={heroHold}
        variant={stemIndex}
        opacity={opacity}
      />
    );
  } else if (bed.length > 0) {
    const bedFrame = frame - heroHold;
    const index = Math.floor(bedFrame / advance);
    const local = bedFrame - index * advance;
    const src = bed[index % bed.length]!;
    const fadeIn = Math.min(crossfade, Math.floor(dwell / 3));

    const currentOpacity =
      local < fadeIn
        ? interpolate(local, [0, fadeIn], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        : 1;

    const prev =
      index > 0
        ? {
            src: bed[(index - 1) % bed.length]!,
            localFrame: local + advance,
            variant: stemIndex + index - 1,
            opacity: 1,
          }
        : frame < heroHold + fadeIn
          ? {
              src: heroSrc,
              localFrame: heroHold - fadeIn + local,
              variant: stemIndex,
              opacity: 1,
            }
          : null;

    layers = (
      <>
        {prev ? (
          <KenBurnsStill
            src={prev.src}
            localFrame={prev.localFrame}
            durationInFrames={dwell}
            variant={prev.variant}
            opacity={prev.opacity}
          />
        ) : null}
        <KenBurnsStill
          src={src}
          localFrame={local}
          durationInFrames={dwell}
          variant={stemIndex + index}
          opacity={currentOpacity}
        />
      </>
    );
  }

  return (
    <AbsoluteFill style={{ background: '#030812' }}>
      {layers}
      <TrackChrome
        family={family}
        stem={stem}
        stemIndex={stemIndex}
        stemCount={family.stems.length}
      />
    </AbsoluteFill>
  );
};
