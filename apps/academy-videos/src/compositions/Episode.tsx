import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import type { EpisodeScript } from '../lib/schema';
import { sceneAudioStaticPath } from '../lib/audio-paths';
import type { AudioSeconds } from '../lib/timing';
import {
  FPS,
  pausePromptFrames,
  sceneDurationFrames,
  sceneStarts,
} from '../lib/timing';
import {
  BoardScene,
  MontageScene,
  NarrationCard,
  OutroCard,
  PausePredictScene,
  TitleCard,
} from '../components/Scenes';

export type EpisodeProps = {
  script: EpisodeScript;
  /** Measured TTS lengths from calculateMetadata; omit → durationHintSec. */
  audioSeconds?: AudioSeconds;
};

export const Episode: React.FC<EpisodeProps> = ({ script, audioSeconds }) => {
  const fps = script.fps ?? FPS;
  const starts = sceneStarts(script, fps, audioSeconds);
  const totalPlies = script.scenes.reduce(
    (max, scene) =>
      scene.kind === 'board' || scene.kind === 'pause-predict'
        ? Math.max(max, scene.ply)
        : scene.kind === 'montage'
          ? Math.max(max, scene.toPly)
          : max,
    0,
  );

  return (
    <AbsoluteFill>
      {script.scenes.map((scene, i) => {
        const from = starts[i]!;
        const durationInFrames = sceneDurationFrames(
          scene,
          fps,
          audioSeconds,
        );
        const mainAudio = audioSeconds?.[scene.id];
        const revealAudio =
          scene.kind === 'pause-predict'
            ? audioSeconds?.[`${scene.id}-reveal`]
            : undefined;

        return (
          <Sequence
            key={scene.id}
            from={from}
            durationInFrames={durationInFrames}
            name={scene.id}
          >
            {scene.kind === 'title' && (
              <TitleCard
                eyebrow={scene.eyebrow}
                headline={scene.headline}
                subhead={scene.subhead}
              />
            )}
            {scene.kind === 'narration' && (
              <NarrationCard
                headline={scene.headline}
                bullets={scene.bullets}
                caption={scene.voiceover}
              />
            )}
            {scene.kind === 'board' && (
              <BoardScene
                missionId={scene.missionId}
                ply={scene.ply}
                moveLabel={scene.moveLabel}
                caption={scene.voiceover}
                overlays={scene.overlays}
                totalPlies={totalPlies}
                stats={scene.stats}
              />
            )}
            {scene.kind === 'pause-predict' && (
              <PausePredictScene
                missionId={scene.missionId}
                ply={scene.ply}
                revealPly={scene.revealPly}
                prompt={scene.prompt}
                promptCaption={scene.voiceover}
                revealCaption={scene.revealVoiceover}
                promptFrames={pausePromptFrames(scene, fps, audioSeconds)}
                overlays={scene.overlays}
              />
            )}
            {scene.kind === 'montage' && (
              <MontageScene
                missionId={scene.missionId}
                fromPly={scene.fromPly}
                toPly={scene.toPly}
                caption={scene.voiceover}
                label={scene.caption}
              />
            )}
            {scene.kind === 'outro' && (
              <OutroCard
                headline={scene.headline}
                nextEpisode={scene.nextEpisode}
                caption={scene.voiceover}
              />
            )}

            {mainAudio != null && scene.kind !== 'pause-predict' && (
              <Audio
                src={staticFile(sceneAudioStaticPath(script.id, scene.id))}
              />
            )}
            {scene.kind === 'pause-predict' && mainAudio != null && (
              <Sequence
                from={0}
                durationInFrames={pausePromptFrames(scene, fps, audioSeconds)}
                name={`${scene.id}-vo`}
              >
                <Audio
                  src={staticFile(sceneAudioStaticPath(script.id, scene.id))}
                />
              </Sequence>
            )}
            {scene.kind === 'pause-predict' && revealAudio != null && (
              <Sequence
                from={pausePromptFrames(scene, fps, audioSeconds)}
                durationInFrames={Math.max(
                  1,
                  Math.round(revealAudio * fps),
                )}
                name={`${scene.id}-vo-reveal`}
              >
                <Audio
                  src={staticFile(
                    sceneAudioStaticPath(script.id, scene.id, 'reveal'),
                  )}
                />
              </Sequence>
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
