import { describe, it, expect } from 'vitest';
import { Engine, keepsSorted } from '../../src/lib/core/game';
import { mulberry32 } from '../../src/lib/core/rng';
import { DEFAULT_SETTINGS } from '../../src/lib/core/settings';
import type { Category, Settings, Track } from '../../src/lib/core/types';

function pool(n: number, category: Category = 'pop'): Track[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    deezerId: i,
    itunesId: null,
    title: `Title ${i}`,
    artist: `Artist ${i}`,
    year: 1955 + (i % 50),
    category,
    hasDeezer: true
  }));
}

function settings(mode: Settings['mode'], over: Partial<Settings> = {}): Settings {
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    mode,
    categories: ['pop'],
    ...over
  };
}

function mustRound(e: Engine) {
  const r = e.currentRound;
  if (!r) throw new Error('expected a current round');
  return r;
}

/** Place every un-locked player's guess for the current timeline round, then advance. */
function completeTimelineRound(e: Engine, p: Track[], loserGap = 40): void {
  while (e.currentRound?.activeSeat !== null) {
    const seat = e.currentRound!.activeSeat!;
    const ps = e.playerState(seat);
    if (!ps) throw new Error('active seat has no player');
    const truth = e.currentRound!.tracks[0]!.year;
    e.placeYear(ps.player.id, ps.player.seat === 0 ? truth : truth + loserGap);
  }
  if (e.game.status !== 'finished') {
    e.advanceAfterReveal();
    e.nextRound(p, new Set());
  }
}

describe('Engine.create', () => {
  it('creates players, a room code, and starts round 0 in answer view', () => {
    const e = Engine.create({ names: ['Ada', 'Grace'], settings: settings('timeline'), pool: pool(50) });
    expect(e.game.players).toHaveLength(2);
    expect(e.game.players[0]!.player.name).toBe('Ada');
    expect(e.game.code).toMatch(/^[A-Z0-9]{4,6}$/);
    expect(e.view).toBe('answer');
    expect(mustRound(e).phase).toBe('answer');
    expect(e.game.players[0]!.player.seat).toBe(0);
  });
});

describe('timeline scoring', () => {
  it('scores bands + closest crown and reveals', () => {
    const e = Engine.create({ names: ['A', 'B'], settings: settings('timeline'), pool: pool(50) });
    const r = mustRound(e);
    const truth = r.tracks[0]!.year;
    const pA = e.playerState(0)!;
    const pB = e.playerState(1)!;

    e.placeYear(pA.player.id, truth); // exact → 5 + crown 1
    e.placeYear(pB.player.id, truth + 7); // |7| → 2, no crown

    expect(r.phase).toBe('revealed');
    expect(e.view).toBe('reveal');
    expect(pA.score).toBe(6);
    expect(pB.score).toBe(2);
    expect(r.guesses[pA.player.id]!.distance).toBe(0);
    expect(r.guesses[pB.player.id]!.distance).toBe(7);
  });

  it('wager ruleset multiplies the crown bonus', () => {
    const e = Engine.create({ names: ['A', 'B'], settings: settings('timeline', { ruleset: 'wager' }), pool: pool(50) });
    const r = mustRound(e);
    const truth = r.tracks[0]!.year;
    const pA = e.playerState(0)!;
    const pB = e.playerState(1)!;
    e.placeYear(pA.player.id, truth);
    e.placeYear(pB.player.id, truth + 30);
    expect(pA.score).toBe(9); // 5 + crown×4
    expect(pB.score).toBe(0);
  });

  it('closest_pot gives all points to the single closest', () => {
    const e = Engine.create({ names: ['A', 'B'], settings: settings('timeline', { ruleset: 'closest_pot' }), pool: pool(50) });
    const r = mustRound(e);
    const truth = r.tracks[0]!.year;
    const pA = e.playerState(0)!;
    const pB = e.playerState(1)!;
    e.placeYear(pA.player.id, truth);
    e.placeYear(pB.player.id, truth + 2);
    expect(pA.score).toBe(5);
    expect(pB.score).toBe(0);
  });

  it('auto-lock skips a player without a guess', () => {
    const e = Engine.create({ names: ['A', 'B'], settings: settings('timeline'), pool: pool(50) });
    const r = mustRound(e);
    const pA = e.playerState(0)!;
    e.placeYear(pA.player.id, r.tracks[0]!.year);
    e.autoLockSeat(); // B's turn → locked, round ends
    expect(r.phase).toBe('revealed');
    expect(r.guesses[e.playerState(1)!.player.id]!.autoLocked).toBe(true);
  });
});

describe('game completion', () => {
  it('marks winner + finished but keeps view reveal until advance, then champion', () => {
    const p = pool(80);
    const e = Engine.create({ names: ['A', 'B'], settings: settings('timeline', { targetScore: 10 }), pool: p });
    for (let i = 0; i < 3; i++) {
      completeTimelineRound(e, p);
    }
    expect(e.game.status).toBe('finished');
    expect(e.game.winnerId).toBe(e.game.players[0]!.player.id);
    // final round reveals BEFORE champion appears
    expect(e.view).toBe('reveal');
    e.advanceAfterReveal();
    expect(e.view).toBe('champion');
  });
});

describe('solo completion', () => {
  it('finishes by par rounds even at zero score', () => {
    const p = pool(50);
    const e = Engine.create({ names: ['Solo'], settings: settings('timeline', { solo: true, soloParRounds: 3, targetScore: 99 }), pool: p });
    // solo always misses the exact year so the par count is what ends the game
    for (let i = 0; i < 3; i++) {
      const r = mustRound(e);
      e.placeYear(e.playerState(0)!.player.id, r.tracks[0]!.year + 100);
      if (e.game.status !== 'finished') {
        e.advanceAfterReveal();
        e.nextRound(p, new Set());
      }
    }
    expect(e.game.status).toBe('finished');
    expect(e.game.soloDone).toBe(true);
    expect(e.view).toBe('reveal');
  });
});

describe('buzz', () => {
  it('correct answer wins points and ends the round', () => {
    const e = Engine.create({ names: ['A', 'B'], settings: settings('buzz'), pool: pool(50) });
    const r = mustRound(e);
    const track = r.tracks[0]!;
    const pA = e.playerState(0)!;

    expect(e.buzz(0, pA.player.id, 100)).toBe(true);
    expect(r.buzzWinnerId).toBe(pA.player.id);
    expect(r.activeSeat).toBeNull();

    const ok = e.submitAnswer(pA.player.id, track.title);
    expect(ok).toBe(true);
    expect(r.phase).toBe('revealed');
    expect(pA.score).toBe(4); // rightTitle
  });

  it('wrong answer locks the seat, applies the penalty, and lets another player buzz', () => {
    const e = Engine.create({ names: ['A', 'B'], settings: settings('buzz'), pool: pool(50) });
    const r = mustRound(e);
    const track = r.tracks[0]!;
    const pA = e.playerState(0)!;
    const pB = e.playerState(1)!;

    expect(e.buzz(0, pA.player.id, 100)).toBe(true);
    expect(e.submitAnswer(pA.player.id, 'not the song')).toBe(false);
    expect(pA.score).toBe(-1);
    expect(r.buzzLockedSeats).toEqual([0]);
    expect(r.buzzWinnerId).toBeNull();

    expect(e.buzz(1, pB.player.id, 200)).toBe(true);
    expect(e.submitAnswer(pB.player.id, track.title)).toBe(true);
    expect(pB.score).toBe(4);
    expect(r.phase).toBe('revealed');
  });

  it('ends the round when everyone is locked out', () => {
    const e = Engine.create({ names: ['A', 'B'], settings: settings('buzz'), pool: pool(50) });
    const r = mustRound(e);
    e.buzz(0, e.playerState(0)!.player.id, 100);
    e.submitAnswer(e.playerState(0)!.player.id, 'nope');
    e.buzz(1, e.playerState(1)!.player.id, 200);
    e.submitAnswer(e.playerState(1)!.player.id, 'nuh uh');
    expect(r.phase).toBe('revealed');
  });

  it('ignores invalid buzz attempts', () => {
    const e = Engine.create({ names: ['A', 'B'], settings: settings('buzz'), pool: pool(50) });
    const pA = e.playerState(0)!;
    expect(e.buzz(0, 'wrong-player-id', 100)).toBe(false);
    expect(e.buzz(1, pA.player.id, 100)).toBe(false); // wrong seat for that player
  });
});

describe('which came first', () => {
  it('votes rotate seats; correct oldest pick scores', () => {
    const e = Engine.create({ names: ['A', 'B'], settings: settings('first'), pool: pool(50) });
    const r = mustRound(e);
    const [a, b] = r.tracks;
    if (!a || !b) throw new Error('first mode needs two tracks');
    const aOlder = a.year < b.year;
    const pA = e.playerState(0)!;
    const pB = e.playerState(1)!;

    e.vote(pA.player.id, aOlder ? 'a' : 'b'); // A: correct
    e.vote(pB.player.id, aOlder ? 'b' : 'a'); // B: wrong
    expect(r.phase).toBe('revealed');
    expect(pA.score).toBe(2);
    expect(pB.score).toBe(0);
    expect(pA.streak).toBe(1);
    expect(pB.streak).toBe(0);
  });

  it('rejects out-of-turn or duplicate votes', () => {
    const e = Engine.create({ names: ['A', 'B'], settings: settings('first'), pool: pool(50) });
    const r = mustRound(e);
    const pA = e.playerState(0)!;
    const pB = e.playerState(1)!;
    e.vote(pB.player.id, 'a'); // not B's turn
    expect(r.guesses[pB.player.id]).toBeUndefined();
    e.vote(pA.player.id, 'a');
    e.vote(pA.player.id, 'b'); // duplicate — rejected
    expect(r.guesses[pA.player.id]!.vote).toBe('a');
    expect(r.phase).toBe('answer');
  });
});

describe('skipRound', () => {
  it('replaces the track, resets guesses and keeps the round number', () => {
    const e = Engine.create({ names: ['A', 'B'], settings: settings('timeline'), pool: pool(60) });
    const r = mustRound(e);
    const beforeId = r.tracks[0]!.deezerId;
    const seq = r.seq;

    e.skipRound(pool(60), new Set());
    expect(r.skipped).toBe(true);
    expect(r.seq).toBe(seq);
    expect(r.tracks[0]!.deezerId).not.toBe(beforeId);
    expect(r.guesses).toEqual({});
    expect(r.activeSeat).toBe(r.firstSeat);
    expect(e.game.usedTrackIds).toContain(beforeId);
  });
});

describe('no-repeat freshness', () => {
  it('never reuses a track within one game (hard rule)', () => {
    const p = pool(80);
    const e = Engine.create({ names: ['A', 'B'], settings: settings('timeline', { targetScore: 999 }), pool: p });
    const seen = new Set<number>();
    for (let i = 0; i < 15; i++) {
      const r = mustRound(e);
      const id = r.tracks[0]!.deezerId!;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      completeTimelineRound(e, p);
    }
    expect(seen.size).toBe(15);
  });

  it('respects cross-game recentIds when the pool is big enough', () => {
    const e = Engine.create({
      names: ['A', 'B'],
      settings: settings('timeline'),
      pool: pool(80),
      recentIds: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    });
    const id = mustRound(e).tracks[0]!.deezerId!;
    expect(id).toBeGreaterThanOrEqual(10);
  });
});

describe('serialize / rehydrate', () => {
  it('round-trips a mid-round game and continues deterministically', () => {
    const e = Engine.create({ names: ['A', 'B'], settings: settings('timeline'), pool: pool(50) });
    const r = mustRound(e);
    const pA = e.playerState(0)!;
    const pB = e.playerState(1)!;
    e.placeYear(pA.player.id, r.tracks[0]!.year); // mid-round: A placed, B to go

    const snap = e.serialize();
    const re = new Engine(JSON.parse(JSON.stringify(snap)));
    re.setHandlers({});

    expect(re.view).toBe('answer');
    expect(re.currentRound!.guesses[pA.player.id]!.year).toBe(r.tracks[0]!.year);
    expect(re.currentRound!.activeSeat).toBe(1);

    re.placeYear(pB.player.id, r.tracks[0]!.year + 20);
    expect(re.currentRound!.phase).toBe('revealed');
    expect(re.playerState(0)!.score).toBe(6);
    expect(re.playerState(1)!.score).toBe(1); // |20| → 1 band point
  });

  it('preserves usedTrackIds so rehydrated games keep the no-repeat rule', () => {
    const e = Engine.create({ names: ['A', 'B'], settings: settings('timeline'), pool: pool(30) });
    const r = mustRound(e);
    e.placeYear(e.playerState(0)!.player.id, r.tracks[0]!.year + 3);
    e.placeYear(e.playerState(1)!.player.id, r.tracks[0]!.year + 9);
    const re = new Engine(JSON.parse(JSON.stringify(e.serialize())));
    expect(re.game.usedTrackIds).toEqual(e.game.usedTrackIds);
  });
});

describe('pacing event', () => {
  it('emits pacing when a round drags past 4 minutes', () => {
    const events: string[] = [];
    const e = Engine.create({
      names: ['A'],
      settings: settings('timeline', { solo: true }),
      pool: pool(20),
      onEvent: (ev) => {
        if (ev.type === 'pacing') events.push(ev.message);
      }
    });
    // fudge the round start to 5 minutes ago via the current round
    const r = mustRound(e);
    (r as { startedAt: number }).startedAt = Date.now() - 5 * 60_000;
    e.placeYear(e.playerState(0)!.player.id, r.tracks[0]!.year);
    expect(events.length).toBeGreaterThan(0);
  });
});

describe('cards mode', () => {
  function cardSettings(over: Partial<Settings> = {}): Settings {
    return settings('cards', { targetCards: 10, ...over });
  }

  function newCardsGame(seed = 1, over: Partial<Settings> = {}, n = 60): Engine {
    return Engine.create({ names: ['A', 'B'], settings: cardSettings(over), pool: pool(n), rnd: mulberry32(seed) });
  }

  /** a gap that provably keeps the player's board sorted (throws if none). */
  function correctGap(e: Engine, pid: string, year: number): number {
    const board = e.game.boards[pid] ?? [];
    for (let g = 0; g <= board.length; g++) if (keepsSorted(board, year, g)) return g;
    throw new Error('no correct gap');
  }

  function advance(e: Engine, p: Track[]): void {
    // cards mode auto-advances inside placeCard; other modes step manually.
    e.advanceAfterReveal();
    if (e.game.status !== 'finished' && e.game.mode !== 'cards') e.nextRound(p, new Set());
  }

  function card(year: number): Track {
    return { id: `c${year}`, deezerId: 1000 + year, itunesId: null, title: 'T', artist: 'A', year, category: 'pop', hasDeezer: true };
  }

  it('deals one distinct starter per player plus a fresh mystery', () => {
    const e = newCardsGame();
    const [a, b] = e.game.players.map((p) => p.player.id);
    expect(e.game.boards[a]).toHaveLength(1);
    expect(e.game.boards[b]).toHaveLength(1);
    expect(e.game.boards[a]![0]!.id).not.toBe(e.game.boards[b]![0]!.id);
    const seen = new Set([e.game.boards[a]![0]!.id, e.game.boards[b]![0]!.id]);
    expect(seen.has(e.currentRound!.tracks[0]!.id)).toBe(false);
  });

  it('correct placement grows the board, scores, and flows straight on', () => {
    const e = newCardsGame();
    const p = pool(60);
    const pid = e.playerState(0)!.player.id;
    const year = e.currentRound!.tracks[0]!.year;
    expect(e.placeCard(pid, correctGap(e, pid, year), p, new Set())).toBe(true);
    expect(e.game.boards[pid]).toHaveLength(2);
    const years = e.game.boards[pid]!.map((t) => t.year);
    expect([...years].sort((x, y) => x - y)).toEqual(years);
    expect(e.playerState(0)!.score).toBe(1);
    expect(e.game.lastPlacement?.correct).toBe(true);
    // no page switches: already on the next turn, still answering
    expect(e.view).toBe('answer');
    expect(e.currentRound!.activeSeat).toBe(1);
  });

  it('wrong placement discards the card and never reuses it', () => {
    // find a seed whose first mystery does not tie the starter year
    let e = newCardsGame(1);
    let seed = 1;
    while (e.currentRound!.tracks[0]!.year === e.game.boards[e.playerState(0)!.player.id]![0]!.year && seed < 20) {
      seed += 1;
      e = newCardsGame(seed);
    }
    const p = pool(60);
    const pid = e.playerState(0)!.player.id;
    const board = e.game.boards[pid]!;
    const year = e.currentRound!.tracks[0]!.year;
    const discarded = e.currentRound!.tracks[0]!.id;
    const wrong = year > board[0]!.year ? 0 : board.length;
    expect(keepsSorted(board, year, wrong)).toBe(false);
    expect(e.placeCard(pid, wrong, p, new Set())).toBe(false);
    expect(e.game.boards[pid]).toHaveLength(1); // discarded, not inserted
    expect(e.playerState(0)!.score).toBe(0);
    expect(e.game.lastPlacement).toMatchObject({ playerId: pid, correct: false });
    expect(e.view).toBe('answer'); // straight to the next turn, no reveal detour
    for (let k = 0; k < 6; k++) {
      const ids = [...Object.values(e.game.boards).flat().map((t) => t.id), e.currentRound!.tracks[0]!.id];
      expect(ids).not.toContain(discarded);
      const ps = e.playerState(e.currentRound!.activeSeat!)!;
      e.placeCard(ps.player.id, correctGap(e, ps.player.id, e.currentRound!.tracks[0]!.year), p, new Set());
      if (e.game.status === 'finished') break;
    }
  });

  it('accepts ties anywhere the order holds', () => {
    const board = [card(1970), card(1990)];
    expect(keepsSorted(board, 1980, 1)).toBe(true);
    expect(keepsSorted(board, 1970, 0)).toBe(true);
    expect(keepsSorted(board, 1970, 1)).toBe(true);
    expect(keepsSorted(board, 1990, 1)).toBe(true);
    expect(keepsSorted(board, 1990, 2)).toBe(true);
    expect(keepsSorted(board, 1960, 1)).toBe(false);
    expect(keepsSorted(board, 2000, 1)).toBe(false);
    expect(keepsSorted(board, 1980, 0)).toBe(false);
    expect(keepsSorted(board, 1980, 2)).toBe(false);
  });

  it('rejects out-of-range gaps and strangers without mutating', () => {
    const e = newCardsGame();
    const p = pool(60);
    const pid = e.playerState(0)!.player.id;
    expect(e.placeCard(pid, -1, p, new Set())).toBe(false);
    expect(e.placeCard(pid, 99, p, new Set())).toBe(false);
    expect(e.placeCard('nobody', 0, p, new Set())).toBe(false);
    expect(e.currentRound!.phase).toBe('answer');
    expect(e.game.boards[pid]).toHaveLength(1);
    expect(e.game.lastPlacement).toBeNull();
  });

  it('first to targetCards wins, starter counting as 1', () => {
    const p = pool(60);
    const e = newCardsGame(1, { targetCards: 3 });
    for (let k = 0; k < 10 && e.game.status !== 'finished'; k++) {
      const ps = e.playerState(e.currentRound!.activeSeat!)!;
      e.placeCard(ps.player.id, correctGap(e, ps.player.id, e.currentRound!.tracks[0]!.year), p, new Set());
    }
    expect(e.game.status).toBe('finished');
    expect(e.game.winnerId).toBe(e.playerState(0)!.player.id);
    expect(e.game.boards[e.playerState(0)!.player.id]).toHaveLength(3);
    expect(e.view).toBe('reveal'); // only the winning placement takes the ceremony
  });

  it('serializes boards across a reload', () => {
    const e = newCardsGame();
    const p = pool(60);
    const pid = e.playerState(0)!.player.id;
    e.placeCard(pid, correctGap(e, pid, e.currentRound!.tracks[0]!.year), p, new Set());
    const re = new Engine(JSON.parse(JSON.stringify(e.serialize())));
    expect(re.game.boards).toEqual(e.game.boards);
    expect(re.game.lastPlacement).toEqual(e.game.lastPlacement);
    expect(re.view).toBe('answer');
  });
});
describe('pick relaxation + category weighting', () => {
  function mixedPool(): Track[] {
    const out: Track[] = [];
    for (let i = 0; i < 9; i++) {
      out.push({
        id: `rock${i}`,
        deezerId: 100 + i,
        itunesId: null,
        title: `Rock ${i}`,
        artist: `Rocker ${i}`,
        year: 1970 + i,
        category: 'rock',
        hasDeezer: true
      });
    }
    out.push({
      id: 'pop0',
      deezerId: 200,
      itunesId: null,
      title: 'Fresh Pop',
      artist: 'Popper',
      year: 2001,
      category: 'pop',
      hasDeezer: true
    });
    return out;
  }

  it('relaxes the freshness window before repeating in-game tracks', () => {
    const p = pool(10);
    const allIds = new Set(p.map((t) => t.deezerId!));
    const e = Engine.create({
      names: ['A', 'B'],
      settings: settings('timeline', { targetScore: 999 }),
      pool: p,
      recentIds: allIds // whole pool "recently played" — stage 1 can never hit
    });
    for (let i = 0; i < 10; i++) {
      completeTimelineRound(e, p);
    }
    // 10 rounds, 10 distinct tracks: the cross-game window gave way, the
    // in-game no-repeat rule held.
    expect(new Set(e.game.usedTrackIds).size).toBe(10);
  });

  it('prefers the category that still has fresh tracks', () => {
    const p = mixedPool();
    const rockIds = new Set(p.filter((t) => t.category === 'rock').map((t) => t.deezerId!));
    const s = settings('timeline', { targetScore: 999 });
    s.categories = ['pop', 'rock'];
    const e = Engine.create({ names: ['A', 'B'], settings: s, pool: p, recentIds: rockIds });
    expect(mustRound(e).tracks[0]!.category).toBe('pop');
  });
});
