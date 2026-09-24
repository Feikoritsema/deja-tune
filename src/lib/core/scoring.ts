// Scoring: timeline bands + crown, buzz points with floor, vote streaks.
import type { BuzzScoring } from './types';
import { buzzPointsFor } from './judge';
import type { CorrectLevel } from './types';

/** Timeline bands A: |Δ| 0→5, 1-2→4, 3-5→3, 6-10→2, 11-20→1, >20→0 */
export function timelineBands(distance: number, mercy: boolean): number {
  if (mercy) {
    // decades_easy: coarser bands
    if (distance === 0) return 5;
    if (distance <= 2) return 4;
    if (distance <= 5) return 3;
    if (distance <= 15) return 2;
    if (distance <= 30) return 1;
    return 0;
  }
  if (distance === 0) return 5;
  if (distance <= 2) return 4;
  if (distance <= 5) return 3;
  if (distance <= 10) return 2;
  if (distance <= 20) return 1;
  return 0;
}

/** exact-year bonus for closest player(s). */
export function crownBonus(distances: (number | null)[]): (number | null)[] {
  const valid = distances.filter((d): d is number => d !== null);
  if (valid.length === 0) return distances.map(() => null);
  const min = Math.min(...valid);
  return distances.map((d) => (d === min ? 1 : null));
}

export function applyFloor(value: number, floor: number, allowNegative: boolean): number {
  if (!allowNegative) return Math.max(0, value);
  return Math.max(floor, value);
}

export function buzzPoints(level: CorrectLevel, scoring: BuzzScoring, allowNegative: boolean): number {
  if (level === 'none') return applyFloor(scoring.wrong, scoring.floor, allowNegative);
  return buzzerPositive(level, scoring, allowNegative);
}

export function buzzerPositive(level: CorrectLevel, scoring: BuzzScoring, allowNegative: boolean): number {
  const p = buzzPointsFor(level, scoring);
  return allowNegative ? p : Math.max(0, p);
}

export function firstVotePoints(correct: boolean, streakAfter: number): number {
  if (!correct) return 0;
  let p = 2;
  if (streakAfter >= 3) p += 1;
  return Math.min(3, p);
}

/** Opening Bars Race: snippet grows per stage, early buzz pays more. */
export const RACE_TABLE: Record<CorrectLevel, number[]> = {
  both: [8, 6, 5, 4, 3],
  title: [6, 5, 4, 3, 2],
  artist: [4, 3, 2, 2, 1],
  none: [0, 0, 0, 0, 0]
};

export function racePoints(level: CorrectLevel, stage: number, allowNegative: boolean): number {
  const table = RACE_TABLE[level] ?? [0, 0, 0, 0, 0];
  const p = table[Math.min(stage, table.length - 1)] ?? 0;
  return allowNegative ? p : Math.max(0, p);
}

export function hasReachedTarget(score: number, target: number): boolean {
  return score >= target;
}

/** Champion rule: someone ≥ target and strictly above everyone else (sudden death resolves ties). */
export function findWinner(scores: number[], target: number): number | null {
  const over = scores.map((s, i) => (s >= target ? i : -1)).filter((i) => i >= 0);
  if (over.length === 0) return null;
  const leader = scores.indexOf(Math.max(...scores));
  // strict leader among all players
  const strictly = scores.every((s, i) => i === leader || s < scores[leader]!);
  if (strictly) return leader;
  return null;
}