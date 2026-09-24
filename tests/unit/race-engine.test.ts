import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/lib/core/game';
import type { Settings, Track } from '../../src/lib/core/types';
import { DEFAULT_SETTINGS } from '../../src/lib/core/settings';

const base: Settings = { ...structuredClone(DEFAULT_SETTINGS), mode: 'race', targetScore: 10 };

function track(id: string, title = 'Dancing Queen', artist = 'ABBA'): Track {
  return {
    id, deezerId: Number(id.replace(/\D/g, '') || 1), itunesId: null,
    title, artist, year: 1976, category: 'pop', hasDeezer: false
  };
}

function makeEngine(): Engine {
  const pool = [track('t1'), track('t2'), track('t3')];
  return Engine.create({ names: ['A', 'B'], settings: base, pool, recentIds: new Set() });
}

describe('race mode engine', () => {
  it('starts at stage 0 with one track', () => {
    const e = makeEngine();
    expect(e.game.mode).toBe('race');
    expect(e.currentRound?.tracks.length).toBe(1);
    expect(e.currentRound?.raceStage).toBe(0);
  });
  it('wrong answer locks seat and advances stage', () => {
    const e = makeEngine();
    const ps = e.game.players[0]!;
    e.buzz(ps.player.seat, ps.player.id, 1);
    const ok = e.submitAnswer(ps.player.id, 'totally wrong song title xyz');
    expect(ok).toBe(false);
    expect(e.currentRound?.buzzLockedSeats).toContain(ps.player.seat);
    expect(e.currentRound?.raceStage).toBe(1);
  });
  it('correct at stage 0 scores max race points', () => {
    const e = makeEngine();
    const t = e.currentRound?.tracks[0];
    expect(t).toBeDefined();
    const ps = e.game.players[0]!;
    e.buzz(ps.player.seat, ps.player.id, 1);
    const ok = e.submitAnswer(ps.player.id, `${t!.artist} - ${t!.title}`);
    expect(ok).toBe(true);
    expect(ps.score).toBeGreaterThanOrEqual(6);
  });
  it('releaseBuzz frees the floor', () => {
    const e = makeEngine();
    const ps = e.game.players[0]!;
    e.buzz(ps.player.seat, ps.player.id, 1);
    expect(e.releaseBuzz(ps.player.id)).toBe(true);
    expect(e.currentRound?.buzzWinnerId).toBeNull();
    expect(e.currentRound?.buzzLockedSeats).toContain(ps.player.seat);
  });
  it('overrideCorrect flips a verdict in reveal', () => {
    const e = makeEngine();
    const ps = e.game.players[0]!;
    e.buzz(ps.player.seat, ps.player.id, 1);
    e.submitAnswer(ps.player.id, 'wrong xyz song title');
    expect(e.view).toBe('answer'); // B still live
    const ps2 = e.game.players[1]!;
    e.buzz(ps2.player.seat, ps2.player.id, 2);
    e.submitAnswer(ps2.player.id, `${e.currentRound?.tracks[0]?.artist} - ${e.currentRound?.tracks[0]?.title}`);
    expect(e.view).toBe('reveal');
    const before = ps.score;
    e.overrideCorrect(ps.player.id, true);
    expect(ps.score).toBeGreaterThan(before);
  });
});
