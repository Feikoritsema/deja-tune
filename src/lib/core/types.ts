// Core domain types — pure, serializable, storage-friendly.
// Pursuit: everything in a Game object round-trips through JSON so resume = rehydrate.

export type Mode = 'timeline' | 'buzz' | 'first' | 'cards' | 'race';
export type Category = 'pop' | 'rock' | 'guilty';
export type Ruleset = 'classic' | 'wager' | 'decades_easy' | 'closest_pot';
export type Strictness = 'lax' | 'normal' | 'strict';
export type BuzzPreset = 'standard' | 'gentle' | 'cutthroat' | 'custom';
export type CorrectLevel = 'both' | 'title' | 'artist' | 'none';
export type View = 'lobby' | 'answer' | 'reveal' | 'scoreboard' | 'champion';

export interface BuzzScoring {
  preset: BuzzPreset;
  rightBoth: number;
  rightTitle: number;
  rightArtist: number;
  wrong: number;
  floor: number;
}

export interface Settings {
  mode: Mode;
  categories: Category[];
  targetScore: number;
  /** cards mode: board size that wins (starter counts as 1) */
  targetCards: number;
  /** 0 = loop indefinitely (timeline always wants 0) */
  listenLoops: number;
  /** seconds per player placement, 0 = off */
  perPlayerTimer: number;
  strictness: Strictness;
  yearMin: number;
  yearMax: number;
  freshnessDays: number;
  freshnessCount: number;
  hideGuesses: boolean;
  allowNegative: boolean;
  mercyBands: boolean;
  buzzScoring: BuzzScoring;
  ruleset: Ruleset;
  solo: boolean;
  soloParRounds: number;
}

export interface Player {
  id: string;
  seat: number;
  name: string;
  color: string;
}

export interface PlayerState {
  player: Player;
  score: number;
  streak: number;
}

export interface Track {
  id: string;
  deezerId: number | null;
  itunesId: number | null;
  title: string;
  rawTitle?: string;
  artist: string;
  album?: string;
  year: number;
  cover?: string;
  category: Category;
  flags?: string[];
  /** stable iTunes preview URL (fallback); never a signed Deezer URL */
  itunesPreviewUrl?: string | null;
  hasDeezer: boolean;
}

export interface Guess {
  playerId: string;
  seat: number;
  year: number | null;
  text: string | null;
  vote: 'a' | 'b' | null;
  distance: number | null;
  points: number;
  correctLevel: CorrectLevel | null;
  buzzedMs: number | null;
  /** per-player placement timer ticks used (auto-lock) */
  autoLocked: boolean;
  /** cards mode: insertion gap index the player picked (0 = before all) */
  gap?: number | null;
}

export interface Round {
  seq: number;
  tracks: Track[];
  phase: 'listen' | 'answer' | 'revealed';
  firstSeat: number;
  /** seat whose turn it is (timeline placement, vote); null = nobody may act */
  activeSeat: number | null;
  guesses: Record<string, Guess>;
  buzzWinnerId: string | null;
  buzzLockedSeats: number[];
  listenLoopsUsed: number;
  skipped: boolean;
  startedAt: number;
  /** race mode: index into RACE_STEPS */
  raceStage?: number;
  /** solo hint ladder: playerId -> hints taken this round (each costs 1pt) */
  hintsUsed?: Record<string, number>;
}

/** Cards mode: latest placement verdict — drives the inline board animation. */
export interface LastPlacement {
  playerId: string;
  gap: number;
  correct: boolean;
  trackId: string;
  year: number;
  seq: number;
  /** identity of the placed/discarded mystery — the board reveals it when the card misses */
  title: string;
  artist: string;
}

export interface Game {
  id: string;
  code: string;
  mode: Mode;
  settings: Settings;
  players: PlayerState[];
  rounds: Round[];
  status: 'lobby' | 'playing' | 'finished';
  winnerId: string | null;
  createdAt: number;
  updatedAt: number;
  /** deezerIds used this game — in-game freshness hard rule */
  usedTrackIds: number[];
  /** cards mode: playerId -> chronologically sorted board (starter + placed) */
  boards: Record<string, Track[]>;
  lastPlacement: LastPlacement | null;
  soloDone: boolean;
}

export type GameEvent =
  | { type: 'placed'; playerId: string; seat: number; year: number }
  | { type: 'placedCard'; playerId: string; seat: number; gap: number; correct: boolean }
  | { type: 'buzzed'; seat: number; playerId: string }
  | { type: 'answered'; playerId: string; correctLevel: CorrectLevel; points: number }
  | { type: 'wrong'; playerId: string; points: number }
  | { type: 'overridden'; playerId: string; points: number }
  | { type: 'stage'; roundSeq: number; stage: number }
  | { type: 'voted'; playerId: string; vote: 'a' | 'b' }
  | { type: 'hint'; playerId: string; level: number }
  | { type: 'revealed'; roundSeq: number }
  | { type: 'skipped'; roundSeq: number }
  | { type: 'nextRound'; roundSeq: number }
  | { type: 'champion'; playerId: string }
  | { type: 'pacing'; message: string };