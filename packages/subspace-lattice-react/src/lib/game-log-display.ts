import type { TeiGrade } from '@subspace-lattice/core';

export interface NameColorEntry {
  name: string;
  color: string;
}

export interface TeiSegment {
  grade: TeiGrade;
  score: string;
  reference?: boolean;
}

export interface CoordSegment {
  left: string;
  right: string;
  separator: string;
  doubleLabel?: boolean;
}

export type LogSegment =
  | { text: string; tei?: undefined; coordinate?: undefined; color?: undefined }
  | { text: string; tei: TeiSegment; coordinate?: undefined; color?: undefined }
  | {
      text: string;
      coordinate: CoordSegment;
      tei?: undefined;
      color?: undefined;
    }
  | { text: string; color: string; tei?: undefined; coordinate?: undefined };

const TEI_RE = /\b(ref\s+)?([EVCIP])(\d{2})\b/g;
const COORD_RE = /\((\d+),\s*(\d+)\)/g;
const TS_RE = /^\[([^\]]+)\]\s*(?:-\s*)?(.*)$/;

export function splitGameLogLine(line: string): {
  timestamp: string | null;
  body: string;
} {
  const m = TS_RE.exec(line);
  if (!m) return { timestamp: null, body: line };
  return { timestamp: m[1] ?? null, body: m[2] ?? '' };
}

function pushText(segments: LogSegment[], text: string): void {
  if (!text) return;
  segments.push({ text });
}

/**
 * Split body into plain / TEI / coordinate / named-color segments.
 * TEI and coords take precedence over name highlighting.
 */
export function splitBodyByNames(
  body: string,
  nameColors: readonly NameColorEntry[] = [],
): LogSegment[] {
  type Mark =
    | { start: number; end: number; kind: 'tei'; tei: TeiSegment; text: string }
    | {
        start: number;
        end: number;
        kind: 'coord';
        coordinate: CoordSegment;
        text: string;
      };

  const marks: Mark[] = [];

  TEI_RE.lastIndex = 0;
  let tm: RegExpExecArray | null;
  while ((tm = TEI_RE.exec(body)) !== null) {
    marks.push({
      start: tm.index,
      end: tm.index + tm[0].length,
      kind: 'tei',
      text: tm[0],
      tei: {
        grade: tm[2] as TeiGrade,
        score: tm[3]!,
        reference: Boolean(tm[1]),
      },
    });
  }

  COORD_RE.lastIndex = 0;
  let cm: RegExpExecArray | null;
  while ((cm = COORD_RE.exec(body)) !== null) {
    marks.push({
      start: cm.index,
      end: cm.index + cm[0].length,
      kind: 'coord',
      text: cm[0],
      coordinate: {
        left: cm[1]!,
        right: cm[2]!,
        separator: ',',
      },
    });
  }

  marks.sort((a, b) => a.start - b.start || b.end - a.end);

  // Drop overlapping marks (keep earlier / longer)
  const filtered: Mark[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue;
    filtered.push(mark);
    cursor = mark.end;
  }

  const segments: LogSegment[] = [];
  let i = 0;
  for (const mark of filtered) {
    if (mark.start > i) {
      pushColoredOrPlain(segments, body.slice(i, mark.start), nameColors);
    }
    if (mark.kind === 'tei') {
      segments.push({ text: mark.text, tei: mark.tei });
    } else {
      segments.push({ text: mark.text, coordinate: mark.coordinate });
    }
    i = mark.end;
  }
  if (i < body.length) {
    pushColoredOrPlain(segments, body.slice(i), nameColors);
  }
  return segments;
}

function pushColoredOrPlain(
  segments: LogSegment[],
  text: string,
  nameColors: readonly NameColorEntry[],
): void {
  if (!text) return;
  if (nameColors.length === 0) {
    pushText(segments, text);
    return;
  }

  // Longest-name first
  const sorted = [...nameColors].sort((a, b) => b.name.length - a.name.length);
  let remaining = text;
  while (remaining.length > 0) {
    let hit: { index: number; entry: NameColorEntry } | null = null;
    for (const entry of sorted) {
      const idx = remaining.indexOf(entry.name);
      if (idx === -1) continue;
      if (!hit || idx < hit.index) hit = { index: idx, entry };
    }
    if (!hit) {
      pushText(segments, remaining);
      break;
    }
    if (hit.index > 0) {
      pushText(segments, remaining.slice(0, hit.index));
    }
    segments.push({
      text: hit.entry.name,
      color: hit.entry.color,
    });
    remaining = remaining.slice(hit.index + hit.entry.name.length);
  }
}

const CAPTAIN_PALETTE = [
  '#38bdf8',
  '#a78bfa',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#fb7185',
];

export function buildCaptainNameColors(
  names: Readonly<Record<string, string>>,
  captainOrder: readonly string[],
): NameColorEntry[] {
  return captainOrder
    .map((id, i) => {
      const name = names[id];
      if (!name) return null;
      return {
        name,
        color: CAPTAIN_PALETTE[i % CAPTAIN_PALETTE.length]!,
      };
    })
    .filter((e): e is NameColorEntry => e != null);
}

/** Lattice has no pip colors; keep API for Warp parity (unused). */
export function logPipTextColor(_value: string | number): string {
  return 'var(--warp-accent, #38bdf8)';
}
