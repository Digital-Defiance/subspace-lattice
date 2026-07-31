import { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  sceneAlignmentStaticPath,
  type CaptionSentence,
  type SceneAlignmentFile,
} from '../lib/audio-paths';

function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isEnd =
      (ch === '.' || ch === '!' || ch === '?') &&
      (i === text.length - 1 || /\s/.test(text[i + 1] ?? ''));
    if (!isEnd) continue;
    let end = i + 1;
    while (end < text.length && /\s/.test(text[end])) end++;
    const slice = text.slice(start, end).trim();
    if (slice) out.push(slice);
    start = end;
  }
  if (start < text.length) {
    const slice = text.slice(start).trim();
    if (slice) out.push(slice);
  }
  return out;
}

function evenPace(text: string, durationSec: number): CaptionSentence[] {
  const parts = splitSentences(text);
  if (parts.length === 0) return [];
  const slice = Math.max(0.01, durationSec / parts.length);
  return parts.map((sentence, i) => ({
    text: sentence,
    startSec: i * slice,
    endSec: (i + 1) * slice,
  }));
}

function activeIndex(sentences: CaptionSentence[], t: number): number {
  if (sentences.length === 0) return -1;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]!;
    if (t >= s.startSec && t < s.endSec) return i;
  }
  if (t < sentences[0]!.startSec) return 0;
  return sentences.length - 1;
}

/**
 * Time-synced VO captions (no box): current sentence + next if any.
 * Prefers ElevenLabs alignment sidecar; falls back to even pacing.
 */
export const SyncedCaptions: React.FC<{
  episodeId: string;
  sceneId: string;
  /** Raw / speakable voiceover — used if alignment file is missing. */
  fallbackText: string;
}> = ({ episodeId, sceneId, fallbackText }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const [sentences, setSentences] = useState<CaptionSentence[] | null>(null);

  useEffect(() => {
    const handle = delayRender(`captions-${episodeId}-${sceneId}`);
    let cancelled = false;
    const src = staticFile(sceneAlignmentStaticPath(episodeId, sceneId));
    void fetch(src)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as SceneAlignmentFile;
      })
      .then((data) => {
        if (cancelled) return;
        if (data?.sentences?.length) {
          setSentences(data.sentences);
        } else {
          setSentences(
            evenPace(fallbackText, Math.max(0.5, durationInFrames / fps)),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSentences(
            evenPace(fallbackText, Math.max(0.5, durationInFrames / fps)),
          );
        }
      })
      .finally(() => {
        continueRender(handle);
      });
    return () => {
      cancelled = true;
    };
  }, [episodeId, sceneId, fallbackText, durationInFrames, fps]);

  if (!sentences || sentences.length === 0) return null;

  // Prefer on-screen wording from the authored voiceover (e.g. "tear") while
  // timing comes from TTS alignment (which may use speakable spellings like "tare").
  const displayParts = splitSentences(fallbackText);
  const idx = activeIndex(sentences, t);
  if (idx < 0) return null;
  const activeText = displayParts[idx] ?? sentences[idx]!.text;
  const upcomingText =
    idx + 1 < sentences.length
      ? (displayParts[idx + 1] ?? sentences[idx + 1]!.text)
      : null;

  const fade = interpolate(
    frame,
    [0, 8, Math.max(9, durationInFrames - 10), durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        padding: '0 100px 64px',
        pointerEvents: 'none',
        opacity: fade,
      }}
    >
      <div
        style={{
          maxWidth: 1500,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 34,
            fontWeight: 650,
            lineHeight: 1.35,
            color: '#f8fafc',
            textShadow:
              '0 2px 4px rgba(0,0,0,0.85), 0 0 22px rgba(0,0,0,0.55)',
          }}
        >
          {activeText}
        </div>
        {upcomingText && (
          <div
            style={{
              marginTop: 14,
              fontSize: 26,
              fontWeight: 500,
              lineHeight: 1.35,
              color: 'rgba(226,232,240,0.55)',
              textShadow:
                '0 2px 4px rgba(0,0,0,0.75), 0 0 18px rgba(0,0,0,0.45)',
            }}
          >
            {upcomingText}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
