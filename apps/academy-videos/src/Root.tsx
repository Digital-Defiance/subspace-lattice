import React from 'react';
import { Composition } from 'remotion';
import { Episode, type EpisodeProps } from './compositions/Episode';
import { resolveAudioSeconds } from './lib/resolve-audio';
import { EpisodeScriptSchema, type EpisodeScript } from './lib/schema';
import { episodeDurationFrames, FPS } from './lib/timing';
import ep00 from '../scripts/episodes/ep00-intro.json';
import ep01 from '../scripts/episodes/ep01-tactical-mindset.json';
import ep02 from '../scripts/episodes/ep02-surgical-strike.json';
import ep03 from '../scripts/episodes/ep03-standard-battle.json';
import ep04 from '../scripts/episodes/ep04-sector-clock.json';
// Generated from docs/advanced-manual.tex by `yarn seed:mission-episodes`.
import ep05 from '../scripts/episodes/ep05-standard-battle-full.json';
import ep06 from '../scripts/episodes/ep06-clock-siege-full.json';
import ep07 from '../scripts/episodes/ep07-playing-black.json';
import ep08 from '../scripts/episodes/ep08-heavy-wing.json';
import ep09 from '../scripts/episodes/ep09-ai-skirmish.json';
import ep10 from '../scripts/episodes/ep10-infiltrator.json';
import ep11 from '../scripts/episodes/ep11-lockout.json';

function load(raw: unknown): EpisodeScript {
  return EpisodeScriptSchema.parse(raw);
}

const episodes = [
  load(ep00),
  load(ep01),
  load(ep02),
  load(ep03),
  load(ep04),
  load(ep05),
  load(ep06),
  load(ep07),
  load(ep08),
  load(ep09),
  load(ep10),
  load(ep11),
];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {episodes.map((script) => (
        <Composition
          key={script.compositionId}
          id={script.compositionId}
          component={Episode}
          durationInFrames={episodeDurationFrames(script)}
          fps={script.fps ?? FPS}
          width={script.width ?? 1920}
          height={script.height ?? 1080}
          defaultProps={{ script } satisfies EpisodeProps}
          calculateMetadata={async ({ props }) => {
            const s = EpisodeScriptSchema.parse(props.script);
            const audioSeconds = await resolveAudioSeconds(s.id, s.scenes);
            const fps = s.fps ?? FPS;
            return {
              durationInFrames: episodeDurationFrames(s, fps, audioSeconds),
              fps,
              width: s.width ?? 1920,
              height: s.height ?? 1080,
              props: { script: s, audioSeconds } satisfies EpisodeProps,
            };
          }}
        />
      ))}
    </>
  );
};
