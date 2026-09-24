import { describe, it, expect } from 'vitest';
import { normalize, levenshtein, stripGuessSplit, tokenSet } from '../../src/lib/core/norm';
import { titleSimilar, judgeText, passForStrictness, buzzPointsFor } from '../../src/lib/core/judge';
import type { Track } from '../../src/lib/core/types';

function track(over: Partial<Track> = {}): Track {
  return {
    id: 't1',
    deezerId: 1,
    itunesId: null,
    title: 'Satisfaction',
    artist: 'The Rolling Stones',
    year: 1965,
    category: 'rock',
    hasDeezer: true,
    ...over
  };
}

describe('normalize', () => {
  it('strips remaster/version parens, feat, diacritics and punctuation', () => {
    // parentheticals are stripped for matching, so the prefix vanishes too
    expect(normalize('(I Can\'t Get No) Satisfaction (Remastered 2002)')).toBe('satisfaction');
    expect(normalize('Café del Mar — feat. Nïco')).toBe('cafe del mar nico');
    expect(normalize('  A$AP   & friends ')).toBe('a ap and friends');
  });

  it('keeps apostrophes and inner spaces', () => {
    expect(normalize('Don\'t Stop Me Now')).toBe('don\'t stop me now');
  });
});

describe('levenshtein', () => {
  it('handles empty and equal strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('smoke', 'smoke')).toBe(0);
    expect(levenshtein('abc', 'abx')).toBe(1);
  });
});

describe('titleSimilar', () => {
  it('is true for identical titles', () => {
    expect(titleSimilar('Uptown Funk', 'Uptown Funk')).toBe(true);
  });

  it('is true for containment (parens-wrapped or extra suffix)', () => {
    expect(titleSimilar('Satisfaction', "(I Can't Get No) Satisfaction")).toBe(true);
    expect(titleSimilar('Blinded by the Light', 'Blinded by the Light')).toBe(true);
  });

  it('is true for small typos within threshold', () => {
    expect(titleSimilar('Smells Like Teen Spirit', 'Smells Like Teen Sprit')).toBe(true);
  });

  it('is false for unrelated titles', () => {
    expect(titleSimilar('Shape of You', 'Bohemian Rhapsody')).toBe(false);
  });
});

describe('stripGuessSplit', () => {
  it('splits "artist - title"', () => {
    expect(stripGuessSplit('The Beatles - Here Comes the Sun')).toEqual({
      title: 'here comes the sun',
      artist: 'the beatles'
    });
  });

  it('falls back to a bare title', () => {
    expect(stripGuessSplit('  Here Comes the Sun  ')).toEqual({ title: 'here comes the sun', artist: null });
  });
});

describe('judgeText', () => {
  it('matches title only when only title is given', () => {
    const v = judgeText('Satisfaction', track());
    expect(v.correctLevel).toBe('title');
    expect(v.matchedField).toBe('title');
  });

  it('matches artist only via the "artist - …" form', () => {
    const v = judgeText('The Rolling Stones - Never Gonna Give You Up', track());
    expect(v.correctLevel).toBe('artist');
    expect(v.matchedField).toBe('artist');
  });

  it('matches both when artist - title is given', () => {
    const v = judgeText('The Rolling Stones - Satisfaction', track());
    expect(v.correctLevel).toBe('both');
    expect(v.matchedField).toBe('both');
  });

  it('returns none for gibberish', () => {
    const v = judgeText('zzz qqq www', track());
    expect(v.correctLevel).toBe('none');
    expect(v.matchedField).toBe(null);
  });
});

describe('passForStrictness', () => {
  const t = track();
  it('lax accepts title or artist', () => {
    expect(passForStrictness(judgeText('Satisfaction', t).correctLevel, 'lax')).toBe(true);
    expect(passForStrictness(judgeText('The Rolling Stones - Anything', t).correctLevel, 'lax')).toBe(true);
  });
  it('normal requires a title match', () => {
    expect(passForStrictness(judgeText('Satisfaction', t).correctLevel, 'normal')).toBe(true);
    expect(passForStrictness(judgeText('The Rolling Stones', t).correctLevel, 'normal')).toBe(false);
  });
  it('strict requires both', () => {
    expect(passForStrictness(judgeText('Satisfaction', t).correctLevel, 'strict')).toBe(false);
    expect(passForStrictness(judgeText('The Rolling Stones - Satisfaction', t).correctLevel, 'strict')).toBe(true);
  });
});

describe('buzzPointsFor', () => {
  it('maps levels to configured points', () => {
    const s = { rightBoth: 5, rightTitle: 4, rightArtist: 3 };
    expect(buzzPointsFor('both', s)).toBe(5);
    expect(buzzPointsFor('title', s)).toBe(4);
    expect(buzzPointsFor('artist', s)).toBe(3);
    expect(buzzPointsFor('none', s)).toBe(0);
  });
});

describe('tokenSet', () => {
  it('drops stop words and 1-char tokens', () => {
    expect([...tokenSet('the night of the hunter')].sort()).toEqual(['hunter', 'night']);
  });
});