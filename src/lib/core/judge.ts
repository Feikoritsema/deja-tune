// The deterministic "Judge" seam. LLM out; fuzzy text matching in.
import { normalize, tokenSet, levenshtein, stripGuessSplit } from './norm';
import type { CorrectLevel, Strictness, Track } from './types';

export interface Verdict {
  correctLevel: CorrectLevel;
  matchedField: 'title' | 'artist' | 'both' | null;
}

export function titleSimilar(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const len = Math.min(na.length, nb.length);
  const threshold = len <= 5 ? 1 : len <= 10 ? 2 : Math.max(2, Math.ceil(0.2 * len));
  if (levenshtein(na, nb) <= threshold) return true;
  // containment: "satisfaction" ⊂ "(I Can't Get No) Satisfaction" — but require
  // a meaningful overlap (len>=6 + length ratio) so "heart" != "heartbreaker".
  if (na.length >= 6 && nb.length >= 6) {
    const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
    if (long.includes(short) && short.length / long.length > 0.6) return true;
  }
  // token-set: allow subset when the guess covers the truth up to one extra/
  // missing filler word (fixes "rolling stones" vs "the rolling stones").
  const ta = tokenSet(na);
  const tb = tokenSet(nb);
  if (ta.size > 0 && tb.size > 0) {
    const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
    if (big.size - small.size <= 1) {
      let same = true;
      for (const w of small) if (!big.has(w)) { same = false; break; }
      if (same) return true;
    }
  }
  return false;
}

export function artistSimilar(a: string, b: string): boolean {
  return titleSimilar(a, b);
}

export function judgeText(raw: string, track: Track): Verdict {
  const { title, artist } = stripGuessSplit(raw);
  let matchedField: 'title' | 'artist' | 'both' | null = null;
  if (title && titleSimilar(title, track.title)) matchedField = 'title';
  if (artist && artistSimilar(artist, track.artist)) {
    matchedField = matchedField === 'title' ? 'both' : 'artist';
  }
  return {
    correctLevel: matchedField === 'both' ? 'both' : matchedField === 'title' ? 'title' : matchedField === 'artist' ? 'artist' : 'none',
    matchedField
  };
}

/** strictness: lax = title OR artist ok; normal = title required, artist alone insufficient; strict = both. */
export function passForStrictness(level: CorrectLevel, strictness: Strictness): boolean {
  if (level === 'none') return false;
  if (strictness === 'strict') return level === 'both';
  if (strictness === 'lax') return true;
  return level === 'title' || level === 'both'; // normal
}

/** points for a correct buzz answer per the configured scoring. */
export function buzzPointsFor(level: CorrectLevel, scoring: { rightBoth: number; rightTitle: number; rightArtist: number }): number {
  if (level === 'both') return scoring.rightBoth;
  if (level === 'title') return scoring.rightTitle;
  if (level === 'artist') return scoring.rightArtist;
  return 0;
}