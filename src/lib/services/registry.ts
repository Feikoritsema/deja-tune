// Pool registry: lazy fetch + validation of per-category JSON emitted by the builder.
import type { Category, Track } from '../core/types';

export interface CategoryMeta {
  key: Category;
  label: string;
  blurb: string;
  gradient: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { key: 'pop', label: 'Pop', blurb: 'Chart-topping pop across the decades', gradient: 'linear-gradient(135deg,#FF5D8F,#FF7A59)' },
  { key: 'rock', label: 'Rock', blurb: 'Riffs, anthems & garage legends', gradient: 'linear-gradient(135deg,#A475FF,#FF5D8F)' },
  { key: 'guilty', label: 'Guilty', blurb: 'Sweet, sweet guilty pleasures', gradient: 'linear-gradient(135deg,#FFB020,#FF7A59)' }
];

const cache = new Map<Category, Promise<Track[]>>();

function validate(list: unknown, cat: Category): Track[] {
  if (!Array.isArray(list)) throw new Error(`pool ${cat}: not an array`);
  const out: Track[] = [];
  for (const raw of list) {
    const t = raw as Track;
    if (
      typeof t?.title === 'string' &&
      typeof t?.artist === 'string' &&
      typeof t?.year === 'number' &&
      typeof t?.category === 'string' &&
      typeof t?.id === 'string'
    ) {
      out.push(t);
    }
  }
  return out;
}

export function getPool(cat: Category, demo = false): Promise<Track[]> {
  if (cache.has(cat)) return cache.get(cat)!;
  const p = fetch(`${import.meta.env.BASE_URL}pool/${cat}.json`, { cache: demo ? 'no-cache' : 'default' })
    .then((r) => {
      if (!r.ok) throw new Error(`pool ${cat}: HTTP ${r.status}`);
      return r.json();
    })
    .then((list) => validate(list, cat))
    .catch((err) => {
      // Never cache rejections — a transient failure must not poison the session.
      cache.delete(cat);
      throw err;
    });
  cache.set(cat, p);
  return p;
}

export function clearPoolCache(): void {
  cache.clear();
}

export async function getPools(cats: Category[], demo = false): Promise<Map<Category, Track[]>> {
  const results = await Promise.allSettled(cats.map(async (c) => [c, await getPool(c, demo)] as const));
  const ok = results
    .filter((r): r is PromiseFulfilledResult<readonly [Category, Track[]]> => r.status === 'fulfilled')
    .map((r) => r.value);
  const failed = results.filter((r) => r.status === 'rejected');
  if (ok.length === 0 && failed.length > 0) {
    const first = failed[0] as PromiseRejectedResult;
    throw first.reason instanceof Error ? first.reason : new Error(String(first.reason));
  }
  return new Map(ok);
}