import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_BUZZ, BUZZ_PRESETS, presetFor } from '../../src/lib/core/settings';

describe('DEFAULT_SETTINGS', () => {
  it('has a sane, complete default', () => {
    expect(DEFAULT_SETTINGS.mode).toBe('timeline');
    expect(DEFAULT_SETTINGS.categories).toEqual(['pop', 'rock']);
    expect(DEFAULT_SETTINGS.targetScore).toBe(10);
    expect(DEFAULT_SETTINGS.freshnessCount).toBe(50);
    expect(DEFAULT_SETTINGS.strictness).toBe('normal');
    expect(DEFAULT_SETTINGS.solo).toBe(false);
    expect(DEFAULT_SETTINGS.buzzScoring).toEqual(DEFAULT_BUZZ);
  });
});

describe('BUZZ_PRESETS', () => {
  it('exposes standard / gentle / cutthroat', () => {
    for (const key of ['standard', 'gentle', 'cutthroat']) {
      expect(BUZZ_PRESETS[key]).toBeDefined();
      expect(BUZZ_PRESETS[key]!.preset).toBe(key);
    }
  });

  it('gentle has a zero floor (no negative)', () => {
    expect(BUZZ_PRESETS.gentle!.floor).toBe(0);
    expect(BUZZ_PRESETS.gentle!.wrong).toBe(-1);
  });

  it('cutthroat swings harder', () => {
    expect(BUZZ_PRESETS.cutthroat!.rightTitle).toBe(5);
    expect(BUZZ_PRESETS.cutthroat!.wrong).toBe(-2);
  });
});

describe('presetFor', () => {
  it('deep-clones the preset (mutations do not leak)', () => {
    const a = presetFor('standard');
    a.rightTitle = 99;
    expect(presetFor('standard').rightTitle).toBe(DEFAULT_BUZZ.rightTitle);
    expect(DEFAULT_BUZZ.rightTitle).not.toBe(99);
  });

  it('falls back to standard for unknown presets', () => {
    expect(presetFor('custom' as 'standard').preset).toBe('standard');
  });
});