import { useEffect, useId, useRef } from 'react';
import {
  ORIGIN_STORY_DURATION_SEC,
  ORIGIN_STORY_YOUTUBE_ID,
} from './origin-welcome';

declare global {
  interface Window {
    YT?: {
      Player: new (
        target: string | HTMLElement,
        options?: {
          events?: {
            onReady?: (event: { target: YtPlayer }) => void;
            onStateChange?: (event: { data: number; target: YtPlayer }) => void;
          };
        },
      ) => YtPlayer;
      PlayerState?: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YtPlayer = {
  getPlayerState: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
};

const YT_ENDED = 0;

let apiLoader: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoader) return apiLoader;

  apiLoader = new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled || !window.YT?.Player) return;
      settled = true;
      resolve();
    };

    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prior?.();
      } finally {
        done();
      }
    };

    if (!document.querySelector('script[data-lattice-yt-api]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.latticeYtApi = '1';
      document.head.appendChild(script);
    }

    const started = Date.now();
    const tick = window.setInterval(() => {
      done();
      if (settled || Date.now() - started > 12_000) {
        window.clearInterval(tick);
        // Resolve anyway so callers can fall back to the duration timer.
        if (!settled) {
          settled = true;
          resolve();
        }
      }
    }, 40);
  });

  return apiLoader;
}

function embedSrc(autoplay: boolean): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    origin: typeof window !== 'undefined' ? window.location.origin : '',
  });
  if (autoplay) params.set('autoplay', '1');
  return `https://www.youtube.com/embed/${ORIGIN_STORY_YOUTUBE_ID}?${params}`;
}

export interface OriginStoryPlayerProps {
  autoplay?: boolean;
  onEnded?: () => void;
  className?: string;
}

/**
 * YouTube origin-story embed with end detection.
 * Prefers live player time via the IFrame API; falls back to a duration timer
 * when the API is blocked (common with privacy tools / some webviews).
 */
export function OriginStoryPlayer({
  autoplay = true,
  onEnded,
  className,
}: OriginStoryPlayerProps) {
  const reactId = useId().replace(/:/g, '');
  const iframeId = `lattice-origin-yt-${reactId}`;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const onEndedRef = useRef(onEnded);
  const endedOnceRef = useRef(false);
  onEndedRef.current = onEnded;

  useEffect(() => {
    let cancelled = false;
    let pollId = 0;
    let fallbackId = 0;
    endedOnceRef.current = false;

    const signalEnded = () => {
      if (endedOnceRef.current || cancelled) return;
      endedOnceRef.current = true;
      if (pollId) window.clearInterval(pollId);
      if (fallbackId) window.clearTimeout(fallbackId);
      onEndedRef.current?.();
    };

    // Always arm a fallback — even if the API never loads, UI still advances.
    fallbackId = window.setTimeout(
      signalEnded,
      (ORIGIN_STORY_DURATION_SEC + 3) * 1000,
    );

    const startPolling = (player: YtPlayer) => {
      if (pollId) window.clearInterval(pollId);
      let sawPlayback = false;
      pollId = window.setInterval(() => {
        if (cancelled || endedOnceRef.current) return;
        try {
          const state = player.getPlayerState();
          const duration = player.getDuration();
          const current = player.getCurrentTime();
          if (current > 1) sawPlayback = true;
          if (state === (window.YT?.PlayerState?.ENDED ?? YT_ENDED)) {
            signalEnded();
            return;
          }
          if (
            sawPlayback &&
            duration > 5 &&
            current > 0 &&
            current >= duration - 0.5
          ) {
            signalEnded();
          }
        } catch {
          // Player tearing down.
        }
      }, 250);
    };

    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !window.YT?.Player || !iframeRef.current) return;
      try {
        playerRef.current = new window.YT.Player(iframeRef.current, {
          events: {
            onReady: (event) => {
              if (cancelled) return;
              startPolling(event.target);
            },
            onStateChange: (event) => {
              if (event.data === (window.YT?.PlayerState?.ENDED ?? YT_ENDED)) {
                signalEnded();
              }
              if (
                !pollId &&
                playerRef.current &&
                (event.data === 1 || event.data === 3)
              ) {
                startPolling(playerRef.current);
              }
            },
          },
        });
      } catch {
        // Keep the duration fallback.
      }
    });

    return () => {
      cancelled = true;
      if (pollId) window.clearInterval(pollId);
      if (fallbackId) window.clearTimeout(fallbackId);
      // Do not call player.destroy() — it removes React's iframe from the DOM.
      playerRef.current = null;
    };
  }, [autoplay]);

  return (
    <div className={className} data-testid="origin-welcome-player">
      <iframe
        ref={iframeRef}
        id={iframeId}
        className="origin-welcome__player"
        title="Subspace Lattice — Origin Story"
        src={embedSrc(autoplay)}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
