import { describe, it, expect } from 'vitest';
import { timelineBands, crownBonus, applyFloor, firstVotePoints, findWinner } from '../../src/lib/core/scoring';
import { buzzPoints } from '../../src/lib/core/scoring';
import { DEFAULT_BUZZ } from '../../src/lib/core/settings';

describe('timelineBands', () => {
  it('awards 5 for exact, tapering to 0 past 20', () => {
    expect(timelineBands(0, false)).toBe(5);
    expect(timelineBands(1, false)).toBe(4);
    expect(timelineBands(2, false)).toBe(4);
    expect(timelineBands(5, false)).toBe(3);
    expect(timelineBands(10, false)).toBe(2);
    expect(timelineBands(11, false)).toBe(1);
    expect(timelineBands(20, false)).toBe(1);
    expect(timelineBands(21, false)).toBe(0);
    expect(timelineBands(100, false)).toBe(0);
  });

  it('mercy bands are coarser', () => {
    expect(timelineBands(10, true)).toBe(2);
    expect(timelineBands(20, true)).toBe(1);
    expect(timelineBands(30, true)).toBe(1);
    expect(timelineBands(31, true)).toBe(0);
  });
});

describe('crownBonus', () => {
  it('gives +1 to the closest (all ties) and null to others', () => {
    expect(crownBonus([0, null, 5])).toEqual([1, null, null]);
    expect(crownBonus([4, 9, 4])).toEqual([1, null, 1]);
  });
  it('all-null distances return all null', () => {
    expect(crownBonus([null, null])).toEqual([null, null]);
  });
});

describe('applyFloor', () => {
  it('clamps to zero when negatives are off', () => {
    expect(applyFloor(-5, -3, false)).toBe(0);
    expect(applyFloor(3, -3, false)).toBe(3);
  });
  it('allows down to the configured floor when negatives are on', () => {
    expect(applyFloor(-5, -3, true)).toBe(-3);
    expect(applyFloor(-1, -3, true)).toBe(-1);
  });
});

describe('buzzPoints', () => {
  it('scores positive answers and floors wrong ones', () => {
    expect(buzzPoints('title', DEFAULT_BUZZ, true)).toBe(4);
    expect(buzzPoints('both', DEFAULT_BUZZ, true)).toBe(5);
    expect(buzzPoints('none', DEFAULT_BUZZ, true)).toBe(-1);
    expect(buzzPoints('none', { ...DEFAULT_BUZZ, wrong: -10 }, true)).toBe(-3);
  });
});

describe('firstVotePoints', () => {
  it('gives 2, or 3 on a streak of 3+', () => {
    expect(firstVotePoints(false, 3)).toBe(0);
    expect(firstVotePoints(true, 1)).toBe(2);
    expect(firstVotePoints(true, 2)).toBe(2);
    expect(firstVotePoints(true, 3)).toBe(3);
    expect(firstVotePoints(true, 9)).toBe(3);
  });
});

describe('findWinner', () => {
  it('returns the strict leader at/above target', () => {
    expect(findWinner([10, 5, 8], 10)).toBe(0);
    expect(findWinner([8, 12, 9], 10)).toBe(1);
    expect(findWinner([9, 11, 11], 10)).toBe(null); // tie at the top
    expect(findWinner([7, 9, 9], 10)).toBe(null); // nobody reached
  });
});