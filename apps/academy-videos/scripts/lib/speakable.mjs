/**
 * Turn coach / manual copy into lines ElevenLabs can speak naturally.
 *
 * Captions may still show precise `(x,y)` move labels on the board chrome;
 * this transform is for the spoken `voiceover` string (and TTS input).
 */

/** `(5,9)` → `column 5, row 9` */
export function speakableCoord(match, x, y) {
  return `column ${x}, row ${y}`;
}

/**
 * `lattice.iwgf.org` → `lattice dot I W G F dot O R G`
 * `iwgf.org` → `I W G F dot O R G`
 *
 * ElevenLabs otherwise swallows the leading I (reads something like "wuh-giff").
 */
export function speakableIwgfHost(match, host) {
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
  // keep mid-sentence "ply 100" as "ply 100" (activation jargon).
  out = out.replace(/^Ply (\d+)\./, (_, n) => `Move ${Number(n)}.`);

  return out;
}
