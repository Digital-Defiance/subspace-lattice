import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  missionPlyStaticPath,
  type OverlayFlags,
  type PlyStats,
} from '../lib/schema';

const COLORS = {
  bg: '#030812',
  panel: '#0b1220',
  accent: '#34e3c5',
  whiteNet: '#60a5fa',
  blackNet: '#f87171',
  contested: '#c084fc',
  warn: '#fbbf24',
  text: '#e2e8f0',
  muted: '#94a3b8',
};

export const AcademyChrome: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <AbsoluteFill
    style={{
      background:
        'radial-gradient(circle at 20% 0%, rgba(37,99,235,0.22), transparent 40%), #030812',
      color: COLORS.text,
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    }}
  >
    {children}
  </AbsoluteFill>
);

export const TitleCard: React.FC<{
  eyebrow?: string;
  headline: string;
  subhead?: string;
}> = ({ eyebrow, headline, subhead }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: 'clamp',
  });
  return (
    <AcademyChrome>
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          padding: '0 120px',
          opacity,
        }}
      >
        {eyebrow && (
          <div
            style={{
              color: COLORS.accent,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontSize: 28,
              fontWeight: 700,
              marginBottom: 24,
            }}
          >
            {eyebrow}
          </div>
        )}
        <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
          {headline}
        </div>
        {subhead && (
          <div
            style={{
              marginTop: 28,
              fontSize: 36,
              color: COLORS.muted,
              maxWidth: 1400,
              lineHeight: 1.35,
            }}
          >
            {subhead}
          </div>
        )}
      </AbsoluteFill>
    </AcademyChrome>
  );
};

export const NarrationCard: React.FC<{
  headline?: string;
  bullets?: string[];
  caption: string;
}> = ({ headline, bullets, caption }) => (
  <AcademyChrome>
    <AbsoluteFill style={{ padding: '100px 120px' }}>
      {headline && (
        <div style={{ fontSize: 56, fontWeight: 750, marginBottom: 36 }}>
          {headline}
        </div>
      )}
      {bullets && (
        <ul style={{ fontSize: 34, lineHeight: 1.55, margin: 0, paddingLeft: 40 }}>
          {bullets.map((b) => (
            <li key={b} style={{ marginBottom: 16 }}>
              {b}
            </li>
          ))}
        </ul>
      )}
      <CaptionBar text={caption} />
    </AbsoluteFill>
  </AcademyChrome>
);

export const CaptionBar: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: 'absolute',
      left: 80,
      right: 80,
      bottom: 56,
      padding: '22px 28px',
      background: 'rgba(2, 8, 20, 0.82)',
      border: '1px solid rgba(148,163,184,0.25)',
      borderRadius: 12,
      fontSize: 28,
      lineHeight: 1.4,
      color: COLORS.text,
    }}
  >
    {text}
  </div>
);

export const OverlayHud: React.FC<{ overlays?: OverlayFlags }> = ({
  overlays,
}) => {
  if (!overlays) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 40,
        right: 48,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        alignItems: 'flex-end',
      }}
    >
      {overlays.threeQuestions && (
        <Badge title="Three-Question Scan" color={COLORS.accent}>
          1 · Can I take their Hub?
          <br />
          2 · Can they take mine?
          <br />
          3 · What does this do for the nets?
        </Badge>
      )}
      {overlays.hubEnPrise && (
        <Badge title="HUB EN PRISE" color={COLORS.warn}>
          Enemy can capture the Command Hub next ply.
        </Badge>
      )}
      {overlays.targetLocked && (
        <Badge title="TARGET LOCK" color={COLORS.blackNet}>
          Locked ships: one orthogonal step only.
        </Badge>
      )}
      {overlays.nets && (
        <Badge title="SENSOR NET" color={COLORS.whiteNet}>
          {overlays.nets === 'white' && 'Blue = White coverage'}
          {overlays.nets === 'black' && 'Red = Black coverage'}
          {overlays.nets === 'both' && 'Blue White · Red Black'}
          {overlays.nets === 'contested' && 'Purple = Contested Space'}
        </Badge>
      )}
    </div>
  );
};

const Badge: React.FC<{
  title: string;
  color: string;
  children: React.ReactNode;
}> = ({ title, color, children }) => (
  <div
    style={{
      background: 'rgba(11,18,32,0.92)',
      border: `1px solid ${color}`,
      borderRadius: 10,
      padding: '14px 18px',
      minWidth: 320,
      maxWidth: 460,
      boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
    }}
  >
    <div
      style={{
        color,
        fontSize: 16,
        fontWeight: 800,
        letterSpacing: '0.1em',
        marginBottom: 8,
      }}
    >
      {title}
    </div>
    <div style={{ fontSize: 20, lineHeight: 1.35, color: COLORS.text }}>
      {children}
    </div>
  </div>
);

const CoverageRow: React.FC<{
  label: string;
  value: number;
  peak: number;
  color: string;
}> = ({ label, value, peak, color }) => (
  <div style={{ marginBottom: 14 }}>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 22,
        color: COLORS.muted,
        marginBottom: 6,
      }}
    >
      <span>{label}</span>
      <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
    <div
      style={{
        height: 10,
        borderRadius: 5,
        background: 'rgba(148,163,184,0.18)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.min(100, (value / peak) * 100)}%`,
          height: '100%',
          background: color,
        }}
      />
    </div>
  </div>
);

export const StatsPanel: React.FC<{ stats?: PlyStats }> = ({ stats }) => {
  if (!stats) return null;
  const { netWhite, netBlack, locked, capture, result } = stats;
  const hasNet = netWhite != null && netBlack != null;
  if (!hasNet && locked == null && !capture && !result) return null;
  // 121 cells is the theoretical max, but scale to the pair so the bars read.
  const peak = Math.max(24, netWhite ?? 0, netBlack ?? 0);

  return (
    <div
      style={{
        position: 'absolute',
        left: 72,
        top: 260,
        width: 330,
        padding: '22px 24px',
        background: 'rgba(11,18,32,0.85)',
        border: '1px solid rgba(148,163,184,0.22)',
        borderRadius: 12,
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: '0.12em',
          color: COLORS.accent,
          marginBottom: 16,
        }}
      >
        SECTOR COVERAGE
      </div>
      {hasNet && (
        <>
          <CoverageRow
            label="White net"
            value={netWhite}
            peak={peak}
            color={COLORS.whiteNet}
          />
          <CoverageRow
            label="Black net"
            value={netBlack}
            peak={peak}
            color={COLORS.blackNet}
          />
        </>
      )}
      {locked != null && locked > 0 && (
        <div style={{ fontSize: 22, color: COLORS.text, marginTop: 4 }}>
          {locked} ship{locked === 1 ? '' : 's'} Target Locked
        </div>
      )}
      {capture && (
        <div style={{ fontSize: 22, color: COLORS.warn, marginTop: 10 }}>
          Captures {capture}
        </div>
      )}
      {result && (
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: COLORS.accent,
            marginTop: 14,
          }}
        >
          {result}
        </div>
      )}
    </div>
  );
};

const ProgressTrack: React.FC<{ ply: number; total: number }> = ({
  ply,
  total,
}) => (
  <div
    style={{
      marginTop: 10,
      width: 520,
      height: 6,
      borderRadius: 3,
      background: 'rgba(148,163,184,0.22)',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        width: `${Math.min(100, (ply / total) * 100)}%`,
        height: '100%',
        background: COLORS.accent,
      }}
    />
  </div>
);

export const BoardScene: React.FC<{
  missionId: string;
  ply: number;
  moveLabel?: string;
  caption: string;
  overlays?: OverlayFlags;
  /** Total plies in the game, for the progress track on long walkthroughs. */
  totalPlies?: number;
  stats?: PlyStats;
}> = ({ missionId, ply, moveLabel, caption, overlays, totalPlies, stats }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const src = staticFile(missionPlyStaticPath(missionId, ply));

  return (
    <AcademyChrome>
      <AbsoluteFill style={{ opacity, padding: '48px 72px 160px' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 20,
            maxWidth: '62%',
          }}
        >
          <div style={{ fontSize: 28, color: COLORS.muted }}>
            {missionId.replace(/-/g, ' ')}
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 750,
              color: COLORS.accent,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Ply {String(ply).padStart(3, '0')}
            {totalPlies ? ` / ${totalPlies}` : ''}
            {moveLabel ? ` · ${moveLabel}` : ''}
          </div>
          {totalPlies ? <ProgressTrack ply={ply} total={totalPlies} /> : null}
        </div>
        <div
          style={{
            flex: 1,
            // Without min-height:0 the flex item grows to the image's intrinsic
            // aspect height and pushes the board off-frame.
            minHeight: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Img
            src={src}
            style={{
              // The captured SVGs have a small intrinsic size, so scale to fit
              // rather than capping with max-* (which would leave them tiny).
              height: '100%',
              width: '100%',
              objectFit: 'contain',
              filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.45))',
            }}
          />
        </div>
        <StatsPanel stats={stats} />
        <OverlayHud overlays={overlays} />
        <CaptionBar text={caption} />
      </AbsoluteFill>
    </AcademyChrome>
  );
};

export const PausePredictScene: React.FC<{
  missionId: string;
  ply: number;
  revealPly: number;
  prompt: string;
  promptCaption: string;
  revealCaption: string;
  promptFrames: number;
  overlays?: OverlayFlags;
}> = ({
  missionId,
  ply,
  revealPly,
  prompt,
  promptCaption,
  revealCaption,
  promptFrames,
  overlays,
}) => {
  const frame = useCurrentFrame();
  const revealing = frame >= promptFrames;
  return (
    <AcademyChrome>
      {!revealing ? (
        <>
          <BoardScene
            missionId={missionId}
            ply={ply}
            caption={promptCaption}
            overlays={{ ...overlays, threeQuestions: true }}
          />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '42%',
              transform: 'translate(-50%, -50%)',
              padding: '28px 40px',
              background: 'rgba(3,8,18,0.88)',
              border: `2px solid ${COLORS.warn}`,
              borderRadius: 14,
              fontSize: 40,
              fontWeight: 750,
              textAlign: 'center',
              maxWidth: 900,
            }}
          >
            Pause &amp; Predict
            <div
              style={{
                marginTop: 14,
                fontSize: 28,
                fontWeight: 500,
                color: COLORS.muted,
              }}
            >
              {prompt}
            </div>
          </div>
        </>
      ) : (
        <BoardScene
          missionId={missionId}
          ply={revealPly}
          caption={revealCaption}
          overlays={overlays}
        />
      )}
    </AcademyChrome>
  );
};

export const MontageScene: React.FC<{
  missionId: string;
  fromPly: number;
  toPly: number;
  caption: string;
  label?: string;
}> = ({ missionId, fromPly, toPly, caption, label }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const span = Math.max(1, toPly - fromPly);
  const ply =
    fromPly +
    Math.min(
      span,
      Math.floor(
        interpolate(frame, [0, durationInFrames - 1], [0, span], {
          extrapolateRight: 'clamp',
        }),
      ),
    );
  return (
    <BoardScene
      missionId={missionId}
      ply={ply}
      moveLabel={label ?? `${fromPly}→${toPly} (scrub)`}
      caption={caption}
      overlays={{ nets: 'both' }}
    />
  );
};

export const OutroCard: React.FC<{
  headline: string;
  nextEpisode?: string;
  caption: string;
}> = ({ headline, nextEpisode, caption }) => (
  <AcademyChrome>
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        padding: '0 120px',
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 800 }}>{headline}</div>
      {nextEpisode && (
        <div style={{ marginTop: 28, fontSize: 34, color: COLORS.accent }}>
          Next: {nextEpisode}
        </div>
      )}
      <CaptionBar text={caption} />
    </AbsoluteFill>
  </AcademyChrome>
);
