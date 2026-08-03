import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { OstTrackVisual } from '../components/OstTrackVisual';
import {
  OST_FPS,
  ostSoundtrackStaticPath,
  type OstFamily as OstFamilyDef,
} from '../lib/ost-catalog';
import {
  ostTrackStartsFrames,
  type OstTrackDurations,
} from '../lib/resolve-ost-audio';

export type OstFamilyProps = {
  family: OstFamilyDef;
  /** Measured stem lengths from calculateMetadata. */
  trackSeconds: OstTrackDurations;
};

/**
 * Pure soundtrack video: stems drive duration; story stills rotate underneath.
 * No VO / no BGM ducking.
 */
export const OstFamilyVideo: React.FC<OstFamilyProps> = ({
  family,
  trackSeconds,
}) => {
  const fps = OST_FPS;
  const starts = ostTrackStartsFrames(trackSeconds, fps);

  return (
    <AbsoluteFill style={{ background: '#030812' }}>
      {family.stems.map((stem, i) => {
        const from = starts[i]!;
        const trackSec = trackSeconds[i]!;
        const durationInFrames = Math.max(1, Math.round(trackSec * fps));
        return (
          <Sequence
            key={stem}
            from={from}
            durationInFrames={durationInFrames}
            name={stem}
          >
            <Audio src={staticFile(ostSoundtrackStaticPath(stem))} />
            <OstTrackVisual
              family={family}
              stem={stem}
              stemIndex={i}
              trackSec={trackSec}
              durationInFrames={durationInFrames}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
