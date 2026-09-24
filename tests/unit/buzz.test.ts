import { describe, it, expect } from 'vitest';
import { resolveBuzz, type Press } from '../../src/lib/core/buzz';

describe('resolveBuzz', () => {
  it('picks the earliest press', () => {
    const presses: Press[] = [
      { seat: 2, playerId: 'p2', timeStamp: 340 },
      { seat: 0, playerId: 'p0', timeStamp: 100 },
      { seat: 1, playerId: 'p1', timeStamp: 250 }
    ];
    expect(resolveBuzz(presses, { lockedSeats: [] })?.playerId).toBe('p0');
  });

  it('breaks equal timestamps by lowest seat (iPad simultaneity)', () => {
    const presses: Press[] = [
      { seat: 3, playerId: 'p3', timeStamp: 500 },
      { seat: 1, playerId: 'p1', timeStamp: 500 },
      { seat: 0, playerId: 'p0', timeStamp: 500 }
    ];
    expect(resolveBuzz(presses, { lockedSeats: [] })?.seat).toBe(0);
  });

  it('ignores locked seats', () => {
    const presses: Press[] = [
      { seat: 0, playerId: 'p0', timeStamp: 10 },
      { seat: 1, playerId: 'p1', timeStamp: 20 }
    ];
    expect(resolveBuzz(presses, { lockedSeats: [0] })?.playerId).toBe('p1');
  });

  it('returns null with no eligible presses', () => {
    expect(resolveBuzz([], { lockedSeats: [] })).toBeNull();
    expect(resolveBuzz([{ seat: 0, playerId: 'p0', timeStamp: 10 }], { lockedSeats: [0] })).toBeNull();
  });
});