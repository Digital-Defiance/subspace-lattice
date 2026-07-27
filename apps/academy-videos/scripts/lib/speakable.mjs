/**
 * Turn coach / manual copy into lines ElevenLabs can speak naturally.
 *
 * Captions may still show precise `(x,y)` move labels on the board chrome;
 * this transform is for the spoken `voiceover` string (and TTS input).
 */

const UNDER_20 = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

/** Board coords are 0–10; also handle ply counts up to a few hundred. */
export function speakableNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0 || num > 999) return String(n);
  if (num < 20) return UNDER_20[num];
  if (num < 100) {
    const tens = TENS[Math.floor(num / 10)];
    const ones = num % 10;
    return ones ? `${tens}-${UNDER_20[ones]}` : tens;
  }
  const hundreds = Math.floor(num / 100);
  const rest = num % 100;
  if (rest === 0) return `${UNDER_20[hundreds]} hundred`;
  return `${UNDER_20[hundreds]} hundred ${speakableNumber(rest)}`;
}

/**
 * Spoken board address.
 *
 * Digits-as-glyphs ("row 5") make ElevenLabs garble endings — and bare "row"
 * is often voiced as the argument /raʊ/ ("rao"), so "row five" comes out like
 * "fah-safe". "row number five" forces the line-of-seats reading and a clean
 * number word.
 */
export function speakableBoardSquare(x, y) {
  return `column ${speakableNumber(x)}, row number ${speakableNumber(y)}`;
}

/** `(5,9)` → `column five, row number nine` */
export function speakableCoord(_match, x, y) {
  return speakableBoardSquare(x, y);
}

/**
 * `lattice.iwgf.org` → `lattice dot I W G F dot O R G`
 * `iwgf.org` → `I W G F dot O R G`
 *
 * ElevenLabs otherwise swallows the leading I (reads something like "wuh-giff").
 */
export function speakableIwgfHost(_match, host) {
  const brand = 'I W G F dot O R G';
  return host ? `${host} dot ${brand}` : brand;
}

/**
 * @param {string} text
 * @returns {string}
 */
export function speakable(text) {
  if (!text) return '';
  let out = String(text);

  // Coordinates — the main TTS foot-gun ("five comma nine").
  out = out.replace(/\((\d+)\s*,\s*(\d+)\)/g, speakableCoord);

  // Already-expanded forms from seeded episode JSON / prior speakable passes.
  out = out.replace(
    /\bcolumn\s+(\d+)\s*,\s*row(?:\s+number)?\s+(\d+)\b/gi,
    (_m, x, y) => speakableBoardSquare(x, y),
  );

  // Federation hosts — spell the brand letter-by-letter.
  out = out.replace(/\b(?:([a-z0-9-]+)\.)?iwgf\.org\b/gi, speakableIwgfHost);

  // Arrows that sometimes leak into prose.
  out = out.replace(/\s*→\s*/g, ' to ');
  out = out.replace(/\s*->\s*/g, ' to ');

  // Typographic noise TTS often misreads.
  out = out.replace(/[—–]/g, ' — ');
  out = out.replace(/\u00a0/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();

  // "Ply 12." at a sentence start reads cleaner as "Move twelve" for voice;
  // keep mid-sentence "ply 100" as "ply 100" (activation jargon) but expand
  // the digits so they aren't swallowed.
  out = out.replace(/^Ply (\d+)\./, (_, n) => `Move ${speakableNumber(n)}.`);
  out = out.replace(/\bply (\d+)\b/gi, (_, n) => `ply ${speakableNumber(n)}`);

  return out;
}
