import { describe, it, expect } from 'vitest';
import { racePoints, RACE_TABLE } from '../../src/lib/core/scoring';

describe('racePoints', () => {
  it('pays most for stage 0 both', () => {
    expect(racePoints('both', 0, true)).toBe(RACE_TABLE.both[0]);
    expect(RACE_TABLE.both[0]).toBeGreaterThan(RACE_TABLE.both[4]!);
  });
  it('title beats artist at same stage', () => {
    expect(racePoints('title', 1, true)).toBeGreaterThan(racePoints('artist', 1, true));
  });
  it('clamps out-of-range stage', () => {
    expect(racePoints('both', 99, true)).toBe(RACE_TABLE.both[4]);
  });
  it('respects allowNegative=false', () => {
    expect(racePoints('none', 0, false)).toBe(0);
  });
});
