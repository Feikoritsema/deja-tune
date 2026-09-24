// Freshness: in-game hard rule + cross-game window with a relaxation ladder.
import type { Track } from './types';

export interface FreshRecord {
  deezerId: number;
  playedAt: number; // epoch ms
}

export function windowRecent(records: FreshRecord[], days: number, count: number): Set<number> {
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const sorted = records
    .filter((r) => r.playedAt >= cutoff)
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, count);
  return new Set(sorted.map((r) => r.deezerId));
}

export function eligibleTracks(pool: Track[], excluded: Set<number>): Track[] {
  return pool.filter((t) => t.deezerId === null || !excluded.has(t.deezerId));
}

/**
 * Pick a track from the union pool, seeded & deterministic.
 * Exclusions are permanent-deezerId sets (this game + freshness window).
 * void) Relaxation ladder is exposed separately: pick ignores exclusions when
 * strict=true fails and returns null; caller decides to widen or log starvation.
 */
export function pickTrack(
  pool: Track[],
  excluded: Set<number>,
  rnd: () => number,
  strict = true
): Track | null {
  const elig = strict ? eligibleTracks(pool, excluded) : pool;
  if (elig.length === 0) return null;
  return elig[Math.floor(rnd() * elig.length)]!;
}

/** Deterministic weighted category choice — equal weights across selected categories. */
export function pickCategory(categories: string[], rnd: () => number): string {
  return categories[Math.floor(rnd() * categories.length)]!;
}

/** Voice guard for 'first' mode: the two clips must differ by year. */
export function yearDiffers(a: Track, b: Track): boolean {
  return a.year !== b.year;
}