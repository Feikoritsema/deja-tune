// Text normalization shared by the fuzzy judge, dedupe and search.

export function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[&]/g, ' and ')
    .replace(/[’‘`]/g, "'")
    .replace(/feat\.|feat /g, ' ')
    .replace(/ft\./g, ' ')
    .replace(/\([^)]*\)/g, ' ') // version parens e.g. (remastered)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9 ']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripGuessSplit(raw: string): { title: string | null; artist: string | null } {
  // Split on a spaced separator ("Artist - Title", "Artist | Title") BEFORE
  // normalization. Bare hyphens inside names (Jay-Z, Twenty-One) must NOT split.
  const spaced = raw.split(/\s+(?:[-–—|])\s+/).filter((p) => p.length > 0);
  if (spaced.length >= 2) {
    const guess = normalize(spaced.pop()!);
    const artist = normalize(spaced.join(' '));
    return { title: guess || null, artist: artist || null };
  }
  const clean = normalize(raw);
  return { title: clean || null, artist: null };
}

export function tokenSet(s: string): Set<string> {
  const stops = new Set(['a', 'an', 'the', 'of', 'and', 'to', 'in', 'on', 'for', 'my', 'your', 'i', 'you', 'it', 'is', 'at']);
  return new Set(s.split(' ').filter((w) => w.length > 1 && !stops.has(w)));
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Uint32Array((m + 1) * (n + 1));
  const cell = (i: number, j: number): number => dp[i * (n + 1) + j]!; // values are always written (0..max(n,m))
  for (let i = 0; i <= m; i++) dp[i * (n + 1)] = i;
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i * (n + 1) + j] = Math.min(
        cell(i - 1, j) + 1,
        cell(i, j - 1) + 1,
        cell(i - 1, j - 1) + cost
      );
    }
  }
  return cell(m, n);
}

export function containmentIndex(container: string, needle: string): number {
  return container.indexOf(needle);
}