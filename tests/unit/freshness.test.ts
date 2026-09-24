import { describe, it, expect } from 'vitest';
import { windowRecent, eligibleTracks, pickTrack, pickCategory, yearDiffers, type FreshRecord } from '../../src/lib/core/freshness';
import type { Track } from '../../src/lib/core/types';

function track(i: number): Track {
  return {
    id: `t${i}`,
    deezerId: i,
    itunesId: null,
    title: `Title ${i}`,
    artist: `Artist ${i}`,
    year: 1960 + i,
    category: 'pop',
    hasDeezer: true
  };
}

describe('windowRecent', () => {
  const now = Date.now();
  const records: FreshRecord[] = [
    { deezerId: 1, playedAt: now - 3600_000 }, // 1h ago
    { deezerId: 2, playedAt: now - 2 * 3600_000 },
    { deezerId: 3, playedAt: now - 3 * 3600_000 },
    { deezerId: 4, playedAt: now - 10 * 24 * 3600_000 } // outside 7d window
  ];

  it('keeps only within the window, counted newest-first', () => {
    expect(windowRecent(records, 7, 50)).toEqual(new Set([1, 2, 3]));
  });

  it('caps at `count`', () => {
    expect(windowRecent(records, 7, 2)).toEqual(new Set([1, 2]));
  });
});

describe('eligibleTracks', () => {
  it('excludes only tracks with a matching deezerId', () => {
    const pool = [track(1), track(2), track(3)];
    expect(eligibleTracks(pool, new Set([2])).map((t) => t.id)).toEqual(['t1', 't3']);
  });
});

describe('pickTrack', () => {
  it('is deterministic given an rnd and excludes blocked ids', () => {
    const pool = [track(1), track(2), track(3), track(4)];
    const rnd = () => 0;
    expect(pickTrack(pool, new Set([1]), rnd)?.id).toBe('t2');
    expect(pickTrack(pool, new Set([1, 2]), rnd)?.id).toBe('t3');
  });

  it('relaxes when strict=false', () => {
    const pool = [track(1)];
    expect(pickTrack(pool, new Set([1]), () => 0, false)?.id).toBe('t1');
    expect(pickTrack(pool, new Set([1]), () => 0, true)).toBeNull();
  });
});

describe('pickCategory', () => {
  it('rounds rnd over the given categories', () => {
    expect(pickCategory(['pop', 'rock'], () => 0)).toBe('pop');
    expect(pickCategory(['pop', 'rock'], () => 0.99)).toBe('rock');
  });
});

describe('yearDiffers', () => {
  it('true when the two clips are from different years', () => {
    expect(yearDiffers(track(1), track(2))).toBe(true);
    expect(yearDiffers(track(1), track(1))).toBe(false);
  });
});