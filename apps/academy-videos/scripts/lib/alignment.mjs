/**
 * Build sentence-level caption cues from ElevenLabs character alignment.
 */

/**
 * @typedef {{ text: string, startSec: number, endSec: number }} SentenceCue
 * @typedef {{
 *   characters: string[],
 *   character_start_times_seconds: number[],
 *   character_end_times_seconds: number[],
 * }} CharAlignment
 */

/**
 * Split spoken text into sentence ranges [start, end) over character indices.
 * @param {string} text
 * @returns {Array<{ start: number, end: number, text: string }>}
 */
export function sentenceRanges(text) {
  const ranges = [];
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
    if (slice) ranges.push({ start, end, text: slice });
    start = end;
  }
  if (start < text.length) {
    const slice = text.slice(start).trim();
    if (slice) ranges.push({ start, end: text.length, text: slice });
  }
  return ranges;
}

/**
 * @param {string} spoken
 * @param {CharAlignment | null | undefined} alignment
 * @returns {SentenceCue[]}
 */
export function sentencesFromAlignment(spoken, alignment) {
  if (
    !alignment?.characters?.length ||
    !alignment.character_start_times_seconds?.length ||
    !alignment.character_end_times_seconds?.length
  ) {
    return [];
  }

  const n = Math.min(
    alignment.characters.length,
    alignment.character_start_times_seconds.length,
    alignment.character_end_times_seconds.length,
  );
  // Prefer the aligned character stream so indices match timestamps exactly.
  const alignedText = alignment.characters.slice(0, n).join('');
  const ranges = sentenceRanges(alignedText.length ? alignedText : spoken);
  if (ranges.length === 0) return [];

  const cues = [];
  for (const range of ranges) {
    const from = Math.min(Math.max(0, range.start), n - 1);
    const to = Math.min(Math.max(from, range.end - 1), n - 1);
    const startSec = alignment.character_start_times_seconds[from] ?? 0;
    const endSec =
      alignment.character_end_times_seconds[to] ??
      alignment.character_start_times_seconds[to] ??
      startSec;
    cues.push({
      text: range.text,
      startSec,
      endSec: Math.max(endSec, startSec),
    });
  }
  return cues;
}

/**
 * Evenly pace sentences across a duration when timestamps are missing.
 * @param {string} spoken
 * @param {number} durationSec
 * @returns {SentenceCue[]}
 */
export function sentencesEvenPace(spoken, durationSec) {
  const ranges = sentenceRanges(spoken);
  if (ranges.length === 0) return [];
  const slice = Math.max(0.01, durationSec / ranges.length);
  return ranges.map((r, i) => ({
    text: r.text,
    startSec: i * slice,
    endSec: (i + 1) * slice,
  }));
}
