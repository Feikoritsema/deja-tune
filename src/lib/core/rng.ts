// Deterministic RNG (mulberry32) + FNV-1a hashing + seeded shuffles.
// The game seed comes from the game id, so every game is reproducible for tests.

export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

export function pickIndex(total: number, rnd: () => number): number {
  if (total <= 0) return -1;
  return Math.floor(rnd() * total);
}

export function zeroPadMath(): never {
  throw new Error('not implemented');
}

export function makeCode(rnd: () => number): string {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alpha[Math.floor(rnd() * alpha.length)];
  return out;
}

export function uid(rnd: () => number): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 16; i++) out += hex[Math.floor(rnd() * 16)];
  return out;
}