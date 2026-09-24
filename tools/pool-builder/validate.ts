// pool:check — CI-style validator for emitted pools.
//   npm run pool:check [-- --live-check]
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Category, Track } from '../../src/lib/core/types';

const POOL_DIR = join(process.cwd(), 'public/pool');
const FRESHNESS_WINDOW = 50; // plan §7.7 default
const MIN_POOL = FRESHNESS_WINDOW * 6; // headroom assertion

interface DeckReport {
  file: string;
  count: number;
  duplicateIds: number;
  badRows: number;
  yearsOk: boolean;
  histogramOk: boolean;
  headroomOk: boolean;
  livePool: boolean;
  decadeSpread: string;
}

async function checkOne(file: string): Promise<DeckReport> {
  const cat = file.replace('.json', '') as Category;
  const raw = await readFile(join(POOL_DIR, file), 'utf8');
  const data = JSON.parse(raw) as Track[];
  const ids = new Set<number>();
  let duplicateIds = 0;
  let badRows = 0;
  const decades = new Map<number, number>();
  let yearsOk = true;
  for (const t of data) {
    const ok =
      typeof t.id === 'string' &&
      typeof t.title === 'string' &&
      typeof t.artist === 'string' &&
      typeof t.year === 'number' &&
      typeof t.category === 'string';
    if (!ok) badRows++;
    if (typeof t.deezerId === 'number' && t.deezerId > 0) {
      if (ids.has(t.deezerId)) duplicateIds++;
      ids.add(t.deezerId);
    }
    if (!ok || !(t.year >= 1950 && t.year <= 2027)) yearsOk = false;
    const dec = Math.floor(t.year / 10) * 10;
    decades.set(dec, (decades.get(dec) ?? 0) + 1);
  }
  const maxDecade = Math.max(0, ...decades.values());
  // decade-balance ceiling. "guilty" is inherently modern-skewed (the meme/genre
  // didn't exist for the 60s), so allow a looser ceiling there; pop/rock stay strict.
  const ceiling = data.length * (cat === 'guilty' ? 0.5 : 0.4);
  const histogramOk = maxDecade <= Math.max(2, Math.ceil(ceiling));
  // fixture pools (no deezer ids) are dev-only — skip scale assertions for them
  const livePool = data.some((t) => typeof t.deezerId === 'number' && t.deezerId > 0);
  const headroomOk = !livePool || data.length >= MIN_POOL;
  const spread = [...decades.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d}s:${n}`).join(' ');
  return {
    file,
    count: data.length,
    duplicateIds,
    badRows,
    yearsOk,
    histogramOk,
    headroomOk,
    livePool,
    decadeSpread: spread || '(empty)'
  };
}

async function main(): Promise<void> {
  const files = (await readdir(POOL_DIR)).filter((f) => f.endsWith('.json')).sort();
  let failed = false;
  for (const f of files) {
    const r = await checkOne(f);
    const live = process.argv.includes('--live-check') ? await liveSampleCheck(f.replace('.json', '') as Category) : 'skipped';
    console.log(
      `${f}: ${r.count} tracks | dup=${r.duplicateIds} bad=${r.badRows} years=${r.yearsOk} histogram=${r.histogramOk} headroom=${r.headroomOk} live=${live}`
    );
    console.log(`   spread: ${r.decadeSpread}`);
    if (r.badRows || r.duplicateIds || !r.yearsOk || (r.livePool && (!r.histogramOk || !r.headroomOk))) {
      failed = true;
    }
  }
  if (failed) {
    console.error('pool:check FAILED');
    process.exit(1);
  }
  console.log('pool:check OK');
}

async function liveSampleCheck(cat: Category): Promise<string> {
  try {
    const { DeezerApi } = await import('./deezer');
    const api = new DeezerApi(400, 1);
    const raw = await readFile(join(POOL_DIR, `${cat}.json`), 'utf8');
    const tracks = JSON.parse(raw) as Track[];
    const samples = tracks.filter((t) => t.deezerId).slice(0, 5);
    let ok = 0;
    for (const t of samples) {
      const d = await api.getJson<{ preview?: string }>(`track/${t.deezerId}`);
      if (d?.preview) ok++;
    }
    return `${ok}/${samples.length}`;
  } catch {
    return 'error';
  }
}

void main();