// Deja Tune game engine. Pure-ish TS: every transition is deterministic and the
// whole Game object round-trips through JSON, so resume == rehydrate == run.
import {
  fnv1a,
  mulberry32,
  makeCode,
  uid,
  pickIndex
} from './rng';
import { timelineBands, crownBonus, buzzPoints, applyFloor, firstVotePoints, findWinner, racePoints } from './scoring';
import { normalize } from './norm';
import { judgeText, passForStrictness } from './judge';
import { pickTrack, pickCategory, yearDiffers } from './freshness';
import type { Game, GameEvent, Guess, Mode, Player, PlayerState, Round, Settings, Track, View } from './types';

export { DEFAULT_SETTINGS } from './settings';

export interface EngineSnapshot {
  game: Game;
  view: View;
  v?: number;
}

export interface CreateOptions {
  names: string[];
  settings: Settings;
  pool: Track[];
  recentIds?: Set<number>;
  existing?: EngineSnapshot;
  onEvent?: (e: GameEvent) => void;
  onReveal?: (track: Track) => void;
  rnd?: () => number;
}

const PLAYER_COLORS = ['#A475FF', '#FF5D8F', '#FF7A59', '#FFB020', '#5CD68B', '#2ED3B6', '#4DA6FF', '#E6E15C'];

export class Engine {
  game: Game;
  view: View;
  private onEvent?: (e: GameEvent) => void;
  private onReveal?: (track: Track) => void;

  constructor(snapshot: EngineSnapshot) {
    this.game = snapshot.game;
    this.view = snapshot.view;
  }

  static create(opts: CreateOptions): Engine {
    let rnd = opts.rnd ?? mulberry32(Date.now() >>> 0);
    let game: Game;
    if (opts.existing) {
      return new Engine(opts.existing);
    }
    const players: PlayerState[] = opts.names.map((name, i) => {
      const p: Player = {
        id: uid(rnd),
        seat: i,
        name: name.trim() || `P${i + 1}`,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length]!
      };
      return { player: p, score: 0, streak: 0 };
    });
    const id = 'g_' + uid(rnd);
    game = {
      id,
      code: makeCode(mulberry32(fnv1a(id + ':code'))),
      mode: opts.settings.mode,
      settings: opts.settings,
      players,
      rounds: [],
      status: 'playing',
      winnerId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usedTrackIds: [],
      boards: {},
      lastPlacement: null,
      soloDone: false
    };
    const engine = new Engine({ game, view: 'lobby' });
    engine.onEvent = opts.onEvent;
    engine.onReveal = opts.onReveal;
    if (game.mode === 'cards') engine.dealStarters(opts.pool, opts.recentIds ?? new Set());
    engine.startNextRound(opts.pool, opts.recentIds ?? new Set());
    return engine;
  }

  // ---------------------------------------------------------------- introspect
  get currentRound(): Round | null {
    return this.game.rounds[this.game.rounds.length - 1] ?? null;
  }
  get currentTrack(): Track | null {
    const r = this.currentRound;
    return r ? r.tracks[0]! : null;
  }
  playerState(seat: number): PlayerState | undefined {
    return this.game.players.find((p) => p.player.seat === seat);
  }
  playerStateById(id: string): PlayerState | undefined {
    return this.game.players.find((p) => p.player.id === id);
  }
  /** ordered list of seats for a round (clockwise from firstSeat). */
  seatOrder(firstSeat: number): number[] {
    const n = this.game.players.length;
    return Array.from({ length: n }, (_, k) => (firstSeat + k) % n);
  }

  setHandlers(opts: { onEvent?: (e: GameEvent) => void; onReveal?: (track: Track) => void }): void {
    this.onEvent = opts.onEvent;
    this.onReveal = opts.onReveal;
  }

  private emit(e: GameEvent): void {
    this.game.updatedAt = Date.now();
    this.maybePacing();
    this.onEvent?.(e);
  }

  /** 4+ minutes on one answer phase → one nag per round (transitions trigger it). */
  private lastPacingSeq = -1;
  private maybePacing(): void {
    const r = this.currentRound;
    if (!r || r.phase !== 'answer') return;
    if (Date.now() - r.startedAt > PACING_MS && this.lastPacingSeq !== r.seq) {
      this.lastPacingSeq = r.seq;
      this.onEvent?.({ type: 'pacing', message: `Round ${r.seq + 1} is dragging — place it or hit Skip!` });
    }
  }

  // ---------------------------------------------------------------- transitions
  startNextRound(pool: Track[], recentIds: Set<number>): void {
    const n = this.game.players.length;
    const prev = this.currentRound;
    const firstSeat = prev ? (prev.firstSeat + 1) % n : 0;
    const tracks = this.chooseTracks(pool, recentIds);
    if (!tracks.length) {
      // Empty pool / all excluded — keep a placeholder round and let UI show
      // the error card with Retry/Skip instead of crashing on tracks[0]!.
      const round: Round = {
        seq: this.game.rounds.length,
        tracks: [],
        phase: 'answer',
        firstSeat,
        activeSeat: firstSeat,
        guesses: {},
        buzzWinnerId: null,
        buzzLockedSeats: [],
        listenLoopsUsed: 0,
        skipped: false,
        startedAt: Date.now(),
        raceStage: 0
      };
      this.game.rounds.push(round);
      this.view = 'answer';
      this.emit({ type: 'nextRound', roundSeq: round.seq });
      return;
    }
    const round: Round = {
      seq: this.game.rounds.length,
      tracks,
      phase: 'answer',
      firstSeat,
      activeSeat: firstSeat,
      guesses: {},
      buzzWinnerId: null,
      buzzLockedSeats: [],
      listenLoopsUsed: 0,
      skipped: false,
      startedAt: Date.now(),
      raceStage: 0
    };
    this.game.rounds.push(round);
    this.view = 'answer';
    this.emit({ type: 'nextRound', roundSeq: round.seq });
  }

  private chooseTracks(pool: Track[], recentIds: Set<number>): Track[] {
    const rnd = mulberry32(fnv1a(this.game.id + ':round:' + this.game.rounds.length));
    if (this.game.mode === 'first') {
      const cat = this.pickCategoryFor(pool, rnd, recentIds);
      const catPool = pool.filter((t) => t.category === cat);
      if (!catPool.length) return [];
      const a = this.pickStaged(catPool, recentIds, rnd);
      if (!a) return [];
      const aId = a.deezerId ?? -1;
      // b search, stage 1: full freshness exclusion; stage 2: in-game repeats only.
      const bothPlusA = new Set(recentIds);
      for (const id of this.game.usedTrackIds) bothPlusA.add(id);
      bothPlusA.add(aId);
      const usedPlusA = new Set<number>(this.game.usedTrackIds);
      usedPlusA.add(aId);
      let b = null;
      for (let i = 0; i < 40 && !b; i++) {
        const cand = pickTrack(catPool, bothPlusA, rnd);
        if (cand && yearDiffers(cand, a)) b = cand;
      }
      if (!b) {
        for (let i = 0; i < 40 && !b; i++) {
          const cand = pickTrack(catPool, usedPlusA, rnd);
          if (cand && cand.id !== a.id && yearDiffers(cand, a)) b = cand;
        }
      }
      // Fallback: same-year or same-pool pair is playable (tie scores 0) —
      // never return a solo track, which would soft-lock the vote UI.
      if (!b) {
        for (let i = 0; i < 40 && !b; i++) {
          const cand = pickTrack(catPool, usedPlusA, rnd);
          if (cand && cand.id !== a.id) b = cand;
        }
      }
      if (!b) {
        const others = catPool.filter((t) => t.id !== a.id);
        if (others.length > 0) b = others[Math.floor(rnd() * others.length)]!;
      }
      if (a && b) {
        this.game.usedTrackIds.push(a.deezerId ?? -1, b.deezerId ?? -1);
        return [a, b];
      }
      return [];
    }
    const cat = this.pickCategoryFor(pool, rnd, recentIds);
    const catPool = pool.filter((t) => t.category === cat);
    const t = this.pickStaged(catPool, recentIds, rnd);
    if (t) this.game.usedTrackIds.push(t.deezerId ?? -1);
    return t ? [t] : [];
  }

  /**
   * Staged pick with a two-step relaxation ladder:
   * 1. exclude cross-game freshness AND in-game repeats;
   * 2. exclude in-game repeats only (freshness window is advisory);
   * 3. anything (tiny pools) — repeats possible, never a crash.
   * The in-game no-repeat rule survives everything except a truly exhausted pool.
   */
  private pickStaged(candidates: Track[], recentIds: Set<number>, rnd: () => number): Track | null {
    const used = new Set<number>(this.game.usedTrackIds);
    const both = new Set(recentIds);
    for (const id of used) both.add(id);
    return (
      pickTrack(candidates, both, rnd) ??
      pickTrack(candidates, used, rnd) ??
      pickTrack(candidates, new Set(), rnd)
    );
  }

  private pickCategoryFor(pool: Track[], rnd: () => number, recentIds?: Set<number>): string {
    const cats = this.game.settings.categories.filter((c) => pool.some((t) => t.category === c));
    if (!cats.length) return 'pop';
    if (!recentIds) return cats[pickIndex(cats.length, rnd)]!;
    // Weight by fresh-track count so a small pool isn't drained (and forced to
    // repeat) sooner than a big one. Null-deezer tracks are always eligible.
    const used = new Set<number>(this.game.usedTrackIds);
    const fresh = (t: Track): boolean =>
      t.deezerId === null || (!used.has(t.deezerId) && !recentIds.has(t.deezerId));
    const weights = cats.map((c) => pool.filter((t) => t.category === c && fresh(t)).length);
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return cats[pickIndex(cats.length, rnd)]!;
    let roll = rnd() * total;
    for (let i = 0; i < cats.length; i++) {
      roll -= weights[i]!;
      if (roll < 0) return cats[i]!;
    }
    return cats[cats.length - 1]!;
  }

  // ---------- timeline
  placeYear(playerId: string, year: number): void {
    const r = this.currentRound;
    const ps = this.playerStateById(playerId);
    if (!r || !ps || ps.player.seat !== r.activeSeat || r.phase !== 'answer') return;
    if (this.game.mode !== 'timeline') return;
    r.guesses[ps.player.id] = {
      playerId: ps.player.id,
      seat: ps.player.seat,
      year: Math.round(year),
      text: null,
      vote: null,
      distance: null,
      points: 0,
      correctLevel: null,
      buzzedMs: null,
      autoLocked: false
    };
    this.emit({ type: 'placed', playerId, seat: ps.player.seat, year });
    this.advanceActiveSeat(r);
    if (r.activeSeat === null) this.finishRound();
  }

  autoLockSeat(): void {
    const r = this.currentRound;
    const ps = r && r.activeSeat !== null ? this.playerState(r.activeSeat) : undefined;
    if (!r || !ps || r.phase !== 'answer' || this.game.mode !== 'timeline' || ps.player.seat !== r.activeSeat) return;
    r.guesses[ps.player.id] = {
      playerId: ps.player.id,
      seat: ps.player.seat,
      year: null,
      text: null,
      vote: null,
      distance: null,
      points: 0,
      correctLevel: null,
      buzzedMs: null,
      autoLocked: true
    };
    this.advanceActiveSeat(r);
    if (r.activeSeat === null) this.finishRound();
  }

  private advanceActiveSeat(r: Round): void {
    const cur = r.activeSeat;
    if (cur === null) return;
    const order = this.seatOrder(r.firstSeat);
    const idx = order.indexOf(cur);
    for (let k = 1; k <= order.length; k++) {
      const cand = order[(idx + k) % order.length]!;
      const has = this.game.players.some(
        (p) => p.player.seat === cand && (r.guesses[p.player.id]?.year !== undefined || r.guesses[p.player.id])
      );
      if (!has) {
        r.activeSeat = cand;
        return;
      }
    }
    r.activeSeat = null;
  }

  // ---------- timeline cards
  /** Deal one visible starter per player (counts toward targetCards, never redrawn). */
  private dealStarters(pool: Track[], recentIds: Set<number>): void {
    const rnd = mulberry32(fnv1a(this.game.id + ':starters'));
    const excluded = new Set(recentIds);
    for (const id of this.game.usedTrackIds) excluded.add(id);
    for (const ps of this.game.players) {
      const cat = this.pickCategoryFor(pool, rnd, recentIds);
      const catPool = pool.filter((t) => t.category === cat);
      const t =
        pickTrack(catPool, excluded, rnd) ??
        pickTrack(pool, excluded, rnd) ??
        this.pickStaged(catPool, recentIds, rnd);
      if (!t) continue;
      this.game.usedTrackIds.push(t.deezerId ?? -1);
      if (t.deezerId !== null) excluded.add(t.deezerId);
      this.game.boards[ps.player.id] = [t];
      // starters stay visible all game — count them as recent cross-game too
      this.onReveal?.(t);
    }
  }

  /**
   * Place the round's mystery track into the player's own board at gap `gap`
   * (0 = before all cards). Correct iff the board stays sorted non-decreasing —
   * ties accepted anywhere the order holds. Wrong → discard (never reused).
   * The verdict is recorded on `game.lastPlacement` so the board can animate it
   * inline; only the winning placement takes the reveal → champion ceremony,
   * every other turn flows straight into the next mystery (no page switches).
   * Returns false when the move is illegal; correctness otherwise.
   */
  placeCard(playerId: string, gap: number, pool: Track[], recentIds: Set<number>): boolean {
    const r = this.currentRound;
    const ps = this.playerStateById(playerId);
    if (!r || !ps || ps.player.seat !== r.activeSeat || r.phase !== 'answer') return false;
    if (this.game.mode !== 'cards') return false;
    const track = r.tracks[0];
    if (!track) return false;
    const board = this.game.boards[ps.player.id] ?? [];
    if (!Number.isInteger(gap) || gap < 0 || gap > board.length) return false;
    const correct = keepsSorted(board, track.year, gap);
    r.guesses[ps.player.id] = {
      playerId: ps.player.id,
      seat: ps.player.seat,
      year: null,
      text: null,
      vote: null,
      distance: null,
      points: correct ? 1 : 0,
      correctLevel: null,
      buzzedMs: null,
      autoLocked: false,
      gap
    };
    if (correct) {
      board.splice(gap, 0, track);
      this.game.boards[ps.player.id] = board;
      ps.score += 1;
      ps.streak += 1;
    } else {
      ps.streak = 0;
    }
    this.game.lastPlacement = { playerId, gap, correct, trackId: track.id, year: track.year, seq: r.seq };
    this.emit({ type: 'placedCard', playerId, seat: ps.player.seat, gap, correct });
    for (const t of r.tracks) this.onReveal?.(t);
    this.maybeFinishGame();
    if (this.game.status === 'finished') {
      r.phase = 'revealed';
      this.view = 'reveal';
      this.emit({ type: 'revealed', roundSeq: r.seq });
    } else {
      this.startNextRound(pool, recentIds);
    }
    return correct;
  }

  // ---------- buzz (+ race reuses the same floor)
  buzz(seat: number, playerId: string, timeStamp: number): boolean {
    const r = this.currentRound;
    const ps = this.playerState(seat);
    if (!r || !ps || r.phase !== 'answer' || (this.game.mode !== 'buzz' && this.game.mode !== 'race')) return false;
    if (r.buzzWinnerId || r.buzzLockedSeats.includes(seat)) return false;
    if (ps.player.id !== playerId) return false;
    r.buzzWinnerId = ps.player.id;
    r.guesses[ps.player.id] = {
      playerId: ps.player.id,
      seat,
      year: null,
      text: null,
      vote: null,
      distance: null,
      points: 0,
      correctLevel: null,
      buzzedMs: timeStamp,
      autoLocked: false
    };
    r.activeSeat = null;
    this.emit({ type: 'buzzed', seat, playerId });
    return true;
  }

  submitAnswer(playerId: string, text: string): boolean {
    const r = this.currentRound;
    if (!r || r.phase !== 'answer' || (this.game.mode !== 'buzz' && this.game.mode !== 'race')) return false;
    if (r.buzzWinnerId !== playerId) return false;
    const ps = this.playerStateById(playerId);
    if (!ps) return false;
    const track = r.tracks[0];
    if (!track) return false;
    const s = this.game.settings;
    const verdict = judgeText(text, track);
    const pass = passForStrictness(verdict.correctLevel, s.strictness);
    const guess = r.guesses[playerId] ?? {
      playerId, seat: ps.player.seat, year: null, text: null, vote: null,
      distance: null, points: 0, correctLevel: null, buzzedMs: null, autoLocked: false
    };
    guess.text = normalize(text).slice(0, 200);
    guess.correctLevel = verdict.correctLevel;
    r.guesses[playerId] = guess;
    if (pass) {
      guess.points =
        this.game.mode === 'race'
          ? racePoints(verdict.correctLevel, r.raceStage ?? 0, s.allowNegative)
          : buzzPoints(verdict.correctLevel, s.buzzScoring, s.allowNegative);
      ps.score += guess.points;
      ps.streak += 1;
      this.emit({ type: 'answered', playerId, correctLevel: verdict.correctLevel, points: guess.points });
      this.finishRound();
      return true;
    }
    guess.points = applyFloor(s.buzzScoring.wrong, s.buzzScoring.floor, s.allowNegative);
    ps.score += guess.points;
    ps.streak = 0;
    r.buzzLockedSeats.push(ps.player.seat);
    r.buzzWinnerId = null;
    r.listenLoopsUsed += 1;
    this.emit({ type: 'wrong', playerId, points: guess.points });
    if (r.buzzLockedSeats.length >= this.game.players.length) this.finishRound();
    else if (this.game.mode === 'race') this.raceAdvanceStage();
    return false;
  }

  /** Solo hint ladder: reveal decade → artist initial → title initial, each costs 1pt. */
  useHint(playerId: string): number {
    const r = this.currentRound;
    const ps = this.playerStateById(playerId);
    if (!r || !ps || r.phase !== 'answer') return 0;
    if (!this.game.settings.solo) return 0;
    const used = r.hintsUsed?.[playerId] ?? 0;
    if (used >= 3) return used;
    const level = used + 1;
    r.hintsUsed = { ...(r.hintsUsed ?? {}), [playerId]: level };
    const s = this.game.settings;
    ps.score = s.allowNegative ? Math.max(s.buzzScoring.floor, ps.score - 1) : Math.max(0, ps.score - 1);
    this.emit({ type: 'hint', playerId, level });
    return level;
  }

  /** Release the floor when the winner gives up / times out. Counts as a wrong answer. */
  releaseBuzz(playerId: string): boolean {
    const r = this.currentRound;
    if (!r || r.phase !== 'answer' || (this.game.mode !== 'buzz' && this.game.mode !== 'race')) return false;
    if (r.buzzWinnerId !== playerId) return false;
    const ps = this.playerStateById(playerId);
    if (!ps) return false;
    const s = this.game.settings;
    const guess = r.guesses[playerId] ?? {
      playerId, seat: ps.player.seat, year: null, text: null, vote: null,
      distance: null, points: 0, correctLevel: null, buzzedMs: null, autoLocked: false
    };
    guess.text = guess.text ?? '(gave up)';
    guess.correctLevel = 'none';
    guess.points = applyFloor(s.buzzScoring.wrong, s.buzzScoring.floor, s.allowNegative);
    r.guesses[playerId] = guess;
    ps.score += guess.points;
    ps.streak = 0;
    r.buzzLockedSeats.push(ps.player.seat);
    r.buzzWinnerId = null;
    this.emit({ type: 'wrong', playerId, points: guess.points });
    if (r.buzzLockedSeats.length >= this.game.players.length) this.finishRound();
    else if (this.game.mode === 'race') this.raceAdvanceStage();
    return true;
  }

  /** Host override in Reveal: flip a guess to correct/wrong and adjust the score. */
  overrideCorrect(playerId: string, correct: boolean): boolean {
    const r = this.currentRound;
    if (!r || r.phase !== 'revealed') return false;
    const ps = this.playerStateById(playerId);
    const g = r.guesses[playerId];
    if (!ps || !g) return false;
    const s = this.game.settings;
    // Revert old points, apply new.
    ps.score -= g.points;
    if (correct) {
      if (this.game.mode === 'timeline') {
        // Timeline has no fuzzy call — override means "credit full marks".
        g.distance = g.distance ?? 0;
        g.points = 5 + 1;
        ps.score += g.points;
        ps.streak += 1;
      } else if (this.game.mode === 'first') {
        g.points = 2;
        ps.score += g.points;
        ps.streak += 1;
      } else if (this.game.mode === 'cards') {
        // Cards verdicts are deterministic; override only flips a discard back
        // is not possible from reveal (wrong placements never reach reveal).
        // Accept on the winning placement is a no-op that keeps the board.
        if (g.points <= 0) {
          g.points = 1;
          ps.score += 1;
          ps.streak += 1;
        } else {
          ps.score += g.points;
        }
      } else {
        g.correctLevel = g.correctLevel && g.correctLevel !== 'none' ? g.correctLevel : 'title';
        g.points =
          this.game.mode === 'race'
            ? racePoints(g.correctLevel ?? 'title', r.raceStage ?? 0, s.allowNegative)
            : buzzPoints(g.correctLevel ?? 'title', s.buzzScoring, s.allowNegative);
        ps.score += g.points;
        ps.streak += 1;
      }
    } else {
      if (this.game.mode === 'timeline' || this.game.mode === 'first') {
        g.points = 0;
        ps.score += 0;
        ps.streak = 0;
      } else if (this.game.mode === 'cards') {
        // Flip a winning placement to wrong: remove the card from the board,
        // reopen the game if it had finished on this placement.
        const board = this.game.boards[playerId] ?? [];
        const trackId = r.tracks[0]?.id;
        if (trackId) {
          const idx = board.findIndex((t) => t.id === trackId);
          if (idx >= 0) board.splice(idx, 1);
        }
        g.points = 0;
        ps.score += 0;
        ps.streak = 0;
        if (this.game.status === 'finished') {
          this.game.status = 'playing';
          this.game.winnerId = null;
          if (this.game.soloDone) this.game.soloDone = false;
        }
      } else {
        g.correctLevel = 'none';
        g.points = applyFloor(s.buzzScoring.wrong, s.buzzScoring.floor, s.allowNegative);
        ps.score += g.points;
        ps.streak = 0;
      }
    }
    this.maybeFinishGame();
    this.emit({ type: 'overridden', playerId, points: g.points });
    return true;
  }

  // ---------- opening bars race
  raceAdvanceStage(): void {
    const r = this.currentRound;
    if (!r || r.phase !== 'answer' || this.game.mode !== 'race') return;
    r.raceStage = Math.min(RACE_STEPS.length - 1, (r.raceStage ?? 0) + 1);
    this.emit({ type: 'stage', roundSeq: r.seq, stage: r.raceStage });
    if ((r.raceStage ?? 0) >= RACE_STEPS.length - 1 && r.buzzLockedSeats.length >= this.game.players.length) {
      this.finishRound();
    }
  }

  raceExhaustStages(): void {
    const r = this.currentRound;
    if (!r || r.phase !== 'answer' || this.game.mode !== 'race') return;
    this.finishRound();
  }

  notifyLoop(): void {
    const r = this.currentRound;
    if (!r || r.phase !== 'answer' || this.game.mode !== 'buzz') return;
    if (this.game.settings.listenLoops <= 0) return;
    r.listenLoopsUsed += 1;
    if (r.listenLoopsUsed >= this.game.settings.listenLoops && !r.buzzWinnerId) this.finishRound();
  }

  // ---------- which came first
  vote(playerId: string, vote: 'a' | 'b'): void {
    const r = this.currentRound;
    const ps = this.playerStateById(playerId);
    if (!r || !ps || r.phase !== 'answer' || this.game.mode !== 'first') return;
    if (ps.player.seat !== r.activeSeat) return;
    if (r.guesses[ps.player.id]) return;
    r.guesses[ps.player.id] = {
      playerId: ps.player.id,
      seat: ps.player.seat,
      year: null,
      text: null,
      vote,
      distance: null,
      points: 0,
      correctLevel: null,
      buzzedMs: null,
      autoLocked: false
    };
    this.emit({ type: 'voted', playerId, vote });
    this.advanceActiveSeat(r);
    if (r.activeSeat === null) this.finishRound();
  }

  // ---------- skips & round end
  skipRound(pool: Track[], recentIds: Set<number>): void {
    const r = this.currentRound;
    if (!r || r.phase !== 'answer') return;
    for (const t of r.tracks) if (t.deezerId !== null && !this.game.usedTrackIds.includes(t.deezerId)) this.game.usedTrackIds.push(t.deezerId);
    r.skipped = true;
    const tracks = this.chooseTracks(pool, recentIds);
    if (!tracks.length) {
      this.finishRound();
      return;
    }
    r.tracks = tracks;
    r.guesses = {};
    r.buzzWinnerId = null;
    r.buzzLockedSeats = [];
    r.listenLoopsUsed = 0;
    r.activeSeat = r.firstSeat;
    this.emit({ type: 'skipped', roundSeq: r.seq });
  }

  finishRound(): void {
    const r = this.currentRound;
    if (!r || r.phase === 'revealed') return;
    if (this.game.mode === 'timeline') this.scoreTimelineRound(r);
    if (this.game.mode === 'first') this.scoreFirstRound(r);
    r.phase = 'revealed';
    for (const t of r.tracks) this.onReveal?.(t);
    this.emit({ type: 'revealed', roundSeq: r.seq });
    this.view = 'reveal';
    this.maybeFinishGame();
  }

  private scoreTimelineRound(r: Round): void {
    const s = this.game.settings;
    const truth = r.tracks[0]?.year;
    if (truth === undefined) return;
    const mercy = s.mercyBands || s.ruleset === 'decades_easy';
    const distances = this.game.players.map((ps) => {
      const g = r.guesses[ps.player.id];
      if (!g || g.year === null) return null;
      const d = Math.abs(g.year - truth);
      g.distance = d;
      return d;
    });
    if (s.ruleset === 'closest_pot') {
      const valid = distances.filter((d): d is number => d !== null);
      const min = valid.length ? Math.min(...valid) : null;
      this.game.players.forEach((ps, i) => {
        const g = r.guesses[ps.player.id];
        if (!g) return;
        if (min !== null && distances[i] === min) {
          g.points = 5;
          ps.score += 5;
        }
      });
      return;
    }
    const bonuses = crownBonus(distances);
    const norm = s.ruleset === 'wager' ? 4 : 1;
    this.game.players.forEach((ps, i) => {
      const g = r.guesses[ps.player.id];
      if (!g) return;
      const base = g.year !== null ? timelineBands(g.distance ?? 999, mercy) : 0;
      const crown = bonuses[i] ?? 0;
      g.points = base + crown * norm;
      ps.score += g.points;
    });
  }

  private scoreFirstRound(r: Round): void {
    const [a, b] = r.tracks;
    if (!a || !b) return;
    // Same-year pair (degenerate fallback): no skill signal — score 0 for all.
    if (a.year === b.year) {
      this.game.players.forEach((ps) => {
        const g = r.guesses[ps.player.id];
        if (!g || !g.vote) return;
        g.points = 0;
        ps.streak = 0;
      });
      return;
    }
    const aOlder = a.year < b.year;
    this.game.players.forEach((ps) => {
      const g = r.guesses[ps.player.id];
      if (!g || !g.vote) return;
      const correct = g.vote === 'a' ? aOlder : !aOlder;
      if (correct) ps.streak += 1;
      else ps.streak = 0;
      g.points = firstVotePoints(correct, ps.streak);
      ps.score += g.points;
    });
  }

  private maybeFinishGame(): void {
    // Marks winner/status now (for persistence), but the VIEW stays 'reveal':
    // the final round's reveal must be seen before the champion screen appears.
    const s = this.game.settings;
    if (this.game.mode === 'cards') {
      const target = Math.max(2, s.targetCards);
      const size = (id: string): number => this.game.boards[id]?.length ?? 0;
      if (s.solo) {
        const me = this.game.players[0]!;
        if (size(me.player.id) >= target || this.game.rounds.length >= s.soloParRounds) {
          this.game.winnerId = me.player.id;
          this.game.soloDone = true;
          this.game.status = 'finished';
          this.emit({ type: 'champion', playerId: me.player.id });
        }
        return;
      }
      const champ = this.game.players.find((p) => size(p.player.id) >= target);
      if (champ && !this.game.winnerId) {
        this.game.winnerId = champ.player.id;
        this.game.status = 'finished';
        this.emit({ type: 'champion', playerId: champ.player.id });
      }
      return;
    }
    if (s.solo) {
      const me = this.game.players[0]!;
      const roundsUsed = this.game.rounds.length;
      if (me.score >= s.targetScore || roundsUsed >= s.soloParRounds) {
        this.game.winnerId = me.player.id;
        this.game.soloDone = true;
        this.game.status = 'finished';
        this.emit({ type: 'champion', playerId: me.player.id });
      }
      return;
    }
    const idx = findWinner(this.game.players.map((p) => p.score), s.targetScore);
    if (idx !== null && !this.game.winnerId) {
      this.game.winnerId = this.game.players[idx]!.player.id;
      this.game.status = 'finished';
      this.emit({ type: 'champion', playerId: this.game.winnerId });
    }
  }

  /** after reveal choreography completes (or user taps through). */
  advanceAfterReveal(): View {
    if (this.game.status === 'finished') {
      this.view = 'champion';
      return this.view;
    }
    this.view = 'scoreboard';
    return this.view;
  }

  /** from scoreboard: start next round (engine picks track via pool+exclusions). */
  nextRound(pool: Track[], recentIds: Set<number>): void {
    this.startNextRound(pool, recentIds);
  }

  serialize(): EngineSnapshot {
    return { game: this.game, view: this.view };
  }

  excludeSet(recentIds: Set<number>): Set<number> {
    const out = new Set<number>(recentIds);
    for (const id of this.game.usedTrackIds) out.add(id);
    return out;
  }
}

/** epoch of a round for pacing assertions */
export function roundElapsed(round: Round): number {
  return Date.now() - round.startedAt;
}

/** Opening Bars Race snippet lengths (seconds) per stage. */
export const RACE_STEPS = [0.7, 1.5, 3, 6, 12];

/** cards judging: inserting `year` at `gap` keeps the board non-decreasing. */
export function keepsSorted(board: Track[], year: number, gap: number): boolean {
  const years = board.map((t) => t.year);
  years.splice(gap, 0, year);
  return years.every((y, i) => i === 0 || years[i - 1]! <= y);
}

export const PACING_MS = 4 * 60_000;