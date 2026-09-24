// Settings: typed defaults + presets, persisted to localStorage.
import type { BuzzScoring, Settings } from './types';

export const DEFAULT_BUZZ: BuzzScoring = {
  preset: 'standard',
  rightBoth: 5,
  rightTitle: 4,
  rightArtist: 3,
  wrong: -1,
  floor: -3
};

export const BUZZ_PRESETS: Record<string, BuzzScoring> = {
  standard: DEFAULT_BUZZ,
  gentle: { preset: 'gentle', rightBoth: 4, rightTitle: 3, rightArtist: 2, wrong: -1, floor: 0 },
  cutthroat: { preset: 'cutthroat', rightBoth: 6, rightTitle: 5, rightArtist: 4, wrong: -2, floor: -10 }
};

export const DEFAULT_SETTINGS: Settings = {
  mode: 'timeline',
  categories: ['pop', 'rock'],
  targetScore: 10,
  targetCards: 10,
  listenLoops: 2,
  perPlayerTimer: 0,
  strictness: 'normal',
  yearMin: 1955,
  yearMax: 2026,
  freshnessDays: 7,
  freshnessCount: 50,
  hideGuesses: false,
  allowNegative: true,
  mercyBands: false,
  buzzScoring: DEFAULT_BUZZ,
  ruleset: 'classic',
  solo: false,
  soloParRounds: 12
};

const KEY = 'deja:tune:settings:v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...structuredClone(DEFAULT_SETTINGS), ...parsed };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full / private mode — non-fatal */
  }
}

export function presetFor(preset: BuzzScoring['preset']): BuzzScoring {
  return structuredClone(BUZZ_PRESETS[preset] ?? DEFAULT_BUZZ);
}