// Pool builder CLI.
//   npm run pool:fixtures      -> offline deterministic pools (demo-only playback)
//   npm run pool:build         -> live Deezer build (real, playable pools)
//   npm run pool:build -- --target 2000 --category pop
// Custom rules: original year from Deezer album release_date; QA filter; era balance.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DeezerApi, type DzListingTrack } from './deezer';
import { JsonCache } from './cache';
import { CHARTS, PLAYLIST_QUERIES, MAX_PLAYLISTS_PER_QUERY, GUILTY_HAND, pickPlaylists } from './seeds';
import { fixturePool } from './fixtures';
import type { Category, Track } from '../../src/lib/core/types';
import { normalize } from '../../src/lib/core/norm';

const DEFAULT_TARGET = 2000;
const YEAR_MIN = 1950;
const YEAR_MAX = 2027;
const ARTIST_CAP_PER_CATEGORY = 5;
const MAX_RAW_PER_SOURCE = 400;
const MAX_RAW_PER_CATEGORY = 7000;

// Era weights: full span 1960s -> 2026 always represented, heavy focus on 1990-2026.
// 1990+ weights (3+3+3+3.5=12.5) vs pre-1990 (0.5+1+1.5+2=5) => ~71% modern.
const DECADE_WEIGHTS: Record<number, number> = {
  1950: 0.5,
  1960: 1,
  1970: 1.5,
  1980: 2,
  1990: 3,
  2000: 2.5,
  2010: 3.5,
  2020: 3.5
};

interface Args {
  mode: 'fixtures' | 'live';
  target: number;
  category?: Category;
  cacheDir: string;
  outDir: string;
  noLookup: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: 'live', target: DEFAULT_TARGET, cacheDir: 'tools/pool-builder/.cache', outDir: 'public/pool', noLookup: false };
  if (argv[0] === 'fixtures') args.mode = 'fixtures';
  else if (argv[0] === 'live') args.mode = 'live';
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--target') args.target = Number(argv[++i]);
    else if (a === '--category') args.category = argv[++i] as Category;
    else if (a === '--cache') args.cacheDir = argv[++i]!;
    else if (a === '--out') args.outDir = argv[++i]!;
    else if (a === '--no-lookup') args.noLookup = true;
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cats: Category[] = args.category ? [args.category] : ['pop', 'rock', 'guilty'];
  await mkdir(args.outDir, { recursive: true });

  if (args.mode === 'fixtures') {
    for (const cat of cats) await writePool(args.outDir, cat, fixturePool(cat));
    console.log(`fixtures written to ${args.outDir}`);
    return;
  }

  const api = new DeezerApi();
  const cache = new JsonCache(args.cacheDir);
  for (const cat of cats) {
    try {
      const existing = await loadExisting(args.outDir, cat);
      const pool = await buildCategory(api, cache, cat, args.target, args, existing);
      await writePool(args.outDir, cat, pool);
      printStats(cat, pool);
    } catch (err) {
      console.error(`[${cat}] live build failed, writing fixtures instead:`, (err as Error).message);
      await writePool(args.outDir, cat, fixturePool(cat));
    }
  }
}

/** Additive growth: keep the current catalog so a run only ever appends. */
async function loadExisting(outDir: string, cat: Category): Promise<Track[]> {
  try {
    const raw = await readFile(join(outDir, `${cat}.json`), 'utf8');
    const data = JSON.parse(raw) as Track[];
    // Fixture pools carry no deezerId — never treat them as keepable catalog.
    if (!data.some((t) => typeof t.deezerId === 'number' && t.deezerId > 0)) return [];
    return data.filter(
      (t) => typeof t.title === 'string' && typeof t.artist === 'string' && typeof t.year === 'number'
    );
  } catch {
    return [];
  }
}

async function buildCategory(
  api: DeezerApi,
  cache: JsonCache,
  cat: Category,
  target: number,
  args: Args,
  existing: Track[] = []
): Promise<Track[]> {
  const raw = new Map<number, DzListingTrack>();
  const haveIds = new Set<number>();
  for (const t of existing) if (typeof t.deezerId === 'number') haveIds.add(t.deezerId);

  // Already at target — no API calls needed.
  if (existing.length >= target) {
    console.log(`[${cat}] existing=${existing.length} >= target=${target}, skipping fetch`);
    return existing.slice(0, target);
  }

  // 1) genre chart (paged; empirically ~300 max)
  const chartId = CHARTS[cat];
  if (chartId) {
    const tracks = await api.chartTracks(chartId, MAX_RAW_PER_SOURCE);
    for (const t of tracks) if (t.preview) raw.set(t.id, t);
  }

  // 2) curated playlist registry (search -> largest public lists)
  const queries = PLAYLIST_QUERIES[cat] ?? [];
  for (const q of queries) {
    const summaries = await api.searchPlaylists(q, 10);
    const ids = pickPlaylists(summaries, MAX_PLAYLISTS_PER_QUERY);
    for (const pid of ids) {
      const tracks = await api.playlistTracks(pid, MAX_RAW_PER_SOURCE);
      for (const t of tracks) if (t.preview) raw.set(t.id, t);
      if (raw.size >= MAX_RAW_PER_CATEGORY) break;
    }
    if (raw.size >= MAX_RAW_PER_CATEGORY) break;
  }

  // 3) guilty hand seeds — search + artist disambiguation
  if (cat === 'guilty') {
    for (const [title, artist] of GUILTY_HAND) {
      const results = await api.searchTracks(`${title}`, 6);
      const hit = results.find((r) => r.preview && normalize(r.artist?.name ?? '') === normalize(artist));
      if (hit) raw.set(hit.id, hit);
    }
  }

  // 4) dedupe by normalized title+artist (keep earliest source order),
  // excluding anything already in the catalog so API budget goes to new tracks
  const byKey = new Map<string, DzListingTrack>();
  const existingKeys = new Set(existing.map((t) => `${normalize(t.title)}|${normalize(t.artist)}`));
  for (const t of raw.values()) {
    if (haveIds.has(t.id)) continue;
    const key = `${normalize(t.title_short ?? t.title ?? '')}|${normalize(t.artist?.name ?? '')}`;
    if (existingKeys.has(key)) continue;
    if (!byKey.has(key)) byKey.set(key, t);
  }
  const unique = [...byKey.values()];

  // 5) enrich: original release year via /track (cached per id)
  const tracks: Track[] = [];
  let skippedNoYear = 0;
  for (const t of unique) {
    let year: number | null = null;
    const cached = await cache.get<{ year: number }>(`dz-year-${t.id}`);
    if (cached) year = cached.year;
    else if (!args.noLookup) {
      try {
        const detail = await api.trackDetail(t.id);
        const rd = detail.album?.release_date;
        if (rd) {
          const m = rd.match(/^(\d{4})/);
          year = m ? Number(m[1]) : null;
        }
        await cache.set(`dz-year-${t.id}`, { year });
      } catch {
        /* keep year null -> will drop */
      }
    }
    const title = t.title_short ?? t.title ?? '';
    const artist = t.artist?.name ?? '';
    if (!year || year < YEAR_MIN || year > YEAR_MAX) {
      skippedNoYear++;
      continue;
    }
    if (!title || !artist) continue;
    const normalizedTitle = normalize(title);
    if (/remaster|live|karaoke|instrumental|re-?issue|demo version|radio edit/i.test(`${title} ${t.title_version ?? ''}`)) continue;
    tracks.push({
      id: `dz${t.id}`,
      deezerId: t.id,
      itunesId: null,
      title,
      artist,
      album: t.album?.title,
      year,
      cover: t.album?.cover_medium ?? t.album?.cover_big,
      category: cat,
      hasDeezer: true,
      itunesPreviewUrl: null
    });
  }
  console.log(`[${cat}] raw=${raw.size} unique=${unique.length} enrich-ok=${tracks.length} dropped-no-year=${skippedNoYear} existing=${existing.length}`);

  // 6) QA + era balance + artist cap + trim to target — additive: the existing
  // catalog stays untouched, new tracks fill the remaining decade quotas so the
  // final pool keeps the predefined era distribution.
  if (existing.length >= target) return existing.slice(0, target);
  const additions = balanceAdditions(existing, tracks, target - existing.length, ARTIST_CAP_PER_CATEGORY, cat);
  const merged = [...existing, ...additions];
  console.log(`[${cat}] kept=${existing.length} added=${additions.length} final=${merged.length}`);
  return merged;
}

function balanceAndTrim(tracks: Track[], target: number, artistCap: number, cat: string): Track[] {
  const buckets = new Map<number, Track[]>();
  for (const t of tracks) {
    const dec = Math.floor(t.year / 10) * 10;
    (buckets.get(dec) ?? buckets.set(dec, []).get(dec)!).push(t);
  }
  const decades = [...buckets.keys()].sort((a, b) => a - b);
  const artistCount = new Map<string, number>();
  const selected: Track[] = [];
  // weighted per-decade quotas: guarantees every present decade (incl. 1960s/1970s)
  // gets a floor, while 1990-2026 takes ~71% of the target.
  const totalWeight = decades.reduce((s, d) => s + (DECADE_WEIGHTS[d] ?? 1), 0);
  const quotas = new Map<number, number>();
  for (const d of decades) {
    const w = DECADE_WEIGHTS[d] ?? 1;
    quotas.set(d, Math.max(5, Math.floor((target * w) / Math.max(1, totalWeight))));
  }
  // Hard per-decade ceiling so the fill phase can't flood one era (the 2000s
  // bulge): mirrors validate.ts ceilings with margin (0.38 pop/rock, 0.48 guilty).
  const maxShare = cat === 'guilty' ? 0.48 : 0.38;
  const ceilings = new Map<number, number>();
  for (const d of decades) ceilings.set(d, Math.max(8, Math.floor(target * maxShare)));
  const capFor = (dec: number): number => Math.min(quotas.get(dec) ?? target, ceilings.get(dec) ?? target);
  const queues = new Map<number, number>();
  // round-robin across decades until target (or exhaustion)
  let added = true;
  while (selected.length < target && added) {
    added = false;
    for (const dec of decades) {
      const q = buckets.get(dec)!;
      const idx = queues.get(dec) ?? 0;
      if (selected.length >= target) break;
      if (idx >= q.length) continue;
      const t = q[idx]!;
      queues.set(dec, idx + 1);
      if (selected.length >= target) break;
      // decade quota + hard ceiling + artist cap
      const inDec = selected.filter((s) => Math.floor(s.year / 10) * 10 === dec).length;
      if (inDec >= capFor(dec)) continue;
      const ac = artistCount.get(t.artist) ?? 0;
      if (ac >= artistCap) continue;
      selected.push(t);
      artistCount.set(t.artist, ac + 1);
      added = true;
    }
    // loosen decade quota after full pass (fill remaining from any decade,
    // still respecting the hard ceiling)
    if (!added) added = fillRemaining(selected, buckets, queues, target, artistCount, artistCap, ceilings);
  }
  return selected;
}

function fillRemaining(
  selected: Track[],
  _buckets: Map<number, Track[]>,
  queues: Map<number, number>,
  target: number,
  artistCount: Map<string, number>,
  artistCap: number,
  ceilings: Map<number, number>
): boolean {
  let added = false;
  const decades = [...queues.keys()].sort((a, b) => a - b);
  const countIn = (dec: number): number =>
    selected.reduce((n, s) => n + (Math.floor(s.year / 10) * 10 === dec ? 1 : 0), 0);
  for (const dec of decades) {
    if (selected.length >= target) break;
    const ceil = ceilings.get(dec) ?? target;
    if (countIn(dec) >= ceil) continue;
    const q = _buckets.get(dec)!;
    let idx = queues.get(dec) ?? 0;
    while (idx < q.length && selected.length < target && countIn(dec) < ceil) {
      const t = q[idx++]!;
      const ac = artistCount.get(t.artist) ?? 0;
      if (ac < artistCap) {
        selected.push(t);
        artistCount.set(t.artist, ac + 1);
        added = true;
      }
    }
    queues.set(dec, idx);
  }
  return added;
}

/**
 * Additive fill: seed counts from the kept catalog, then distribute the `need`
 * new slots across decades using the same DECADE_WEIGHTS quotas scaled to the
 * final target. Underrepresented decades fill first; overflow goes anywhere
 * under the per-decade ceiling. Artist cap counts the kept catalog too.
 */
function balanceAdditions(
  existing: Track[],
  candidates: Track[],
  need: number,
  artistCap: number,
  cat: string
): Track[] {
  const finalTarget = existing.length + need;
  const maxShare = cat === 'guilty' ? 0.48 : 0.38;
  const buckets = new Map<number, Track[]>();
  for (const t of candidates) {
    const dec = Math.floor(t.year / 10) * 10;
    (buckets.get(dec) ?? buckets.set(dec, []).get(dec)!).push(t);
  }
  const decades = [...new Set([...existing.map((t) => Math.floor(t.year / 10) * 10), ...buckets.keys()])].sort(
    (a, b) => a - b
  );
  const totalWeight = decades.reduce((s, d) => s + (DECADE_WEIGHTS[d] ?? 1), 0);
  const quotaFor = (d: number): number => {
    const w = DECADE_WEIGHTS[d] ?? 1;
    return Math.max(5, Math.floor((finalTarget * w) / Math.max(1, totalWeight)));
  };
  const ceilFor = (d: number): number => Math.max(8, Math.floor(finalTarget * maxShare));
  const inDec = new Map<number, number>();
  for (const t of existing) {
    const dec = Math.floor(t.year / 10) * 10;
    inDec.set(dec, (inDec.get(dec) ?? 0) + 1);
  }
  const artistCount = new Map<string, number>();
  for (const t of existing) artistCount.set(t.artist, (artistCount.get(t.artist) ?? 0) + 1);

  const selected: Track[] = [];
  const queues = new Map<number, number>();
  // Pass 1: round-robin up to remaining quota per decade (quota minus kept).
  let added = true;
  while (selected.length < need && added) {
    added = false;
    for (const dec of decades) {
      if (selected.length >= need) break;
      const remaining = quotaFor(dec) - (inDec.get(dec) ?? 0);
      if (remaining <= 0) continue;
      const q = buckets.get(dec);
      if (!q) continue;
      const idx = queues.get(dec) ?? 0;
      if (idx >= q.length) continue;
      const t = q[idx]!;
      queues.set(dec, idx + 1);
      if ((inDec.get(dec) ?? 0) >= Math.min(quotaFor(dec), ceilFor(dec))) continue;
      const ac = artistCount.get(t.artist) ?? 0;
      if (ac >= artistCap) continue;
      selected.push(t);
      artistCount.set(t.artist, ac + 1);
      inDec.set(dec, (inDec.get(dec) ?? 0) + 1);
      added = true;
    }
  }
  // Pass 2: fill leftovers from any decade under the hard ceiling.
  if (selected.length < need) {
    let progress = true;
    while (selected.length < need && progress) {
      progress = false;
      for (const dec of decades) {
        if (selected.length >= need) break;
        if ((inDec.get(dec) ?? 0) >= ceilFor(dec)) continue;
        const q = buckets.get(dec);
        if (!q) continue;
        let idx = queues.get(dec) ?? 0;
        while (idx < q.length && selected.length < need && (inDec.get(dec) ?? 0) < ceilFor(dec)) {
          const t = q[idx++]!;
          const ac = artistCount.get(t.artist) ?? 0;
          if (ac < artistCap) {
            selected.push(t);
            artistCount.set(t.artist, ac + 1);
            inDec.set(dec, (inDec.get(dec) ?? 0) + 1);
            progress = true;
          }
        }
        queues.set(dec, idx);
      }
    }
  }
  return selected;
}

function printStats(cat: Category, pool: Track[]): void {
  const hist = new Map<number, number>();
  for (const t of pool) {
    const dec = Math.floor(t.year / 10) * 10;
    hist.set(dec, (hist.get(dec) ?? 0) + 1);
  }
  const spread = [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d}s:${n}`).join(' ');
  console.log(`[${cat}] final=${pool.length} | ${spread}`);
}

async function writePool(outDir: string, cat: Category, pool: Track[]): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, `${cat}.json`), JSON.stringify(pool), 'utf8');
}

void main();