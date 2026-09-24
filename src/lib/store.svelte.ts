// App store: screen routing, engine handle, settings, resume. Runes via .svelte.ts.
import { Engine } from './core/game';
import { loadSettings, saveSettings } from './core/settings';
import { windowRecent } from './core/freshness';
import type { Settings, Track } from './core/types';
import { getPools } from './services/registry';
import { freshnessStore, gameStore, hofStore, lastPlayersStore } from './services/storage';
import type { HoFEntry } from './services/storage';

export const store = $state({
  rev: 0,
  demo: false,
  screen: 'home' as 'home' | 'setup' | 'soundcheck' | 'game',
  settings: loadSettings(),
  engine: null as Engine | null,
  loading: false,
  loadError: null as string | null,
  toast: null as string | null,
  toastTimer: 0 as number | undefined,
  audioOn: true,
  offline: typeof navigator !== 'undefined' ? !navigator.onLine : false
});

if (typeof window !== 'undefined') {
  const syncOnline = (): void => {
    const was = store.offline;
    store.offline = !navigator.onLine;
    if (was && !store.offline) notify('Back online.');
    else if (store.offline) notify('You are offline — already-loaded songs still work.');
  };
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
}

/** In-memory pool for the active game — skip/place reuse it instead of refetching. */
let activePool: Track[] | null = null;
export function getActivePool(): Track[] | null {
  return activePool;
}

export function boot(): void {
  store.demo = typeof window !== 'undefined' && new URLSearchParams(location.search).has('demo');
}

function notify(msg: string): void {
  toastQueue.push(msg);
  pumpToast();
}

function pumpToast(): void {
  if (store.toast) return;
  const next = toastQueue.shift();
  if (!next) return;
  store.toast = next;
  window.clearTimeout(store.toastTimer);
  store.toastTimer = window.setTimeout(() => {
    store.toast = null;
    // brief gap before the next queued toast
    window.setTimeout(pumpToast, 150);
  }, 2600);
}

const toastQueue: string[] = [];

export { notify };
export function notifyError(msg: string): void {
  notify(msg);
}

let poolBusy = false;

/** Resolve track list for skip/next/place: active pool first, else fetch. */
async function ensurePoolTracks(cats: Settings['categories']): Promise<Track[]> {
  if (activePool && activePool.length > 0) return activePool;
  const pools = await getPools(cats, store.demo);
  const all: Track[] = [...pools.values()].flat();
  if (all.length > 0) activePool = all;
  return all;
}

async function loadPoolsOrToast(cats: Settings['categories']): Promise<Track[]> {
  try {
    return await ensurePoolTracks(cats);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    store.loadError = msg;
    notify(`Couldn't load songs (${msg}) — check connection and retry.`);
    throw err;
  }
}

export function isSnapshotValid(snap: unknown): boolean {
  if (!snap || typeof snap !== 'object') return false;
  const s = snap as { game?: unknown; view?: unknown };
  if (!s.game || typeof s.game !== 'object') return false;
  const g = s.game as { players?: unknown; rounds?: unknown; settings?: unknown; status?: unknown };
  if (!Array.isArray(g.players) || !Array.isArray(g.rounds)) return false;
  if (!g.settings || typeof g.settings !== 'object') return false;
  if (s.view !== undefined && !['lobby', 'answer', 'reveal', 'scoreboard', 'champion'].includes(s.view as string)) return false;
  return true;
}

export async function startGame(names: string[], settings: Settings): Promise<void> {
  saveSettings(settings);
  store.settings = structuredClone(settings);
  store.loading = true;
  store.loadError = null;
  try {
    activePool = null;
    const pools = await getPools(settings.categories, store.demo);
    const all: Track[] = [...pools.values()].flat();
    if (all.length === 0) throw new Error('Pool is empty — run the pool builder first (npm run pool:build)');
    activePool = all;
    const recent = windowRecent(freshnessStore.load(), settings.freshnessDays, settings.freshnessCount);
    const engine = Engine.create({
      names,
      settings,
      pool: all,
      recentIds: recent,
      onEvent: (e) => {
        store.rev++;
        if (e.type === 'pacing') notify(e.message);
        // Persist AFTER the engine finishes mutating: events fire mid-mutation (e.g. 'placed'
        // is emitted before the seat advances), so a synchronous snapshot here would capture a
        // half-applied round and corrupt resume/reload. A microtask runs once the call stack
        // unwinds, after the engine has fully applied the event.
        queueMicrotask(persist);
      },
      onReveal: (t) => freshnessStore.add(t)
    });
    store.engine = engine;
    lastPlayersStore.save(names);
    store.screen = 'soundcheck';
  } catch (err) {
    store.loadError = err instanceof Error ? err.message : String(err);
  } finally {
    store.loading = false;
  }
}

function persist(): void {
  if (!store.engine) return;
  // Local-first: the snapshot in localStorage IS the save game. Resume reads
  // only this — no backend involved.
  gameStore.save(store.engine.serialize());
}

export function resumeGame(): void {
  const snap = gameStore.load();
  if (!snap) {
    store.screen = 'home';
    return;
  }
  if (!isSnapshotValid(snap)) {
    gameStore.clear();
    store.loadError = 'Saved game was corrupt — started fresh.';
    notify('Saved game was corrupt — started fresh.');
    store.screen = 'home';
    store.rev++;
    return;
  }
  store.loading = true;
  store.loadError = null;
  const settings = snap.game.settings;
  getPools(settings.categories, store.demo)
    .then((pools) => {
      activePool = [...pools.values()].flat();
      const engine = new Engine(snap);
      engine.setHandlers({
        onEvent: (e) => {
          store.rev++;
          if (e.type === 'pacing') notify(e.message);
          // see startGame: snapshot after the engine finishes mutating, not inside the event
          queueMicrotask(persist);
        },
        onReveal: (t) => freshnessStore.add(t)
      });
      if (engine.view === 'lobby') {
        store.screen = 'home';
        store.loading = false;
        return;
      }
      store.engine = engine;
      store.screen = 'game';
      store.loading = false;
      store.rev++;
    })
    .catch(() => {
      store.loadError = 'Could not load the saved game. Check your connection and retry.';
      notify('Could not load the saved game. Check your connection and retry.');
      store.loading = false;
    });
}

export function abandonGame(): void {
  gameStore.clear();
  activePool = null;
  store.engine = null;
  store.screen = 'home';
  store.rev++;
}

/** Leave to the main menu mid-game. The snapshot is kept (persisted first),
 * so the home screen offers Resume — leave never destroys a game. */
export function leaveGame(): void {
  persist();
  // keep activePool so an instant Resume does not refetch
  store.engine = null;
  store.screen = 'home';
  store.rev++;
}

export function addHoF(entry: HoFEntry): void {
  hofStore.add(entry);
}

export function setAudioOn(on: boolean): void {
  store.audioOn = on;
}

/** Skip the current song — replace using the in-memory pool. */
export async function skipCurrent(): Promise<void> {
  const eng = store.engine;
  if (!eng || eng.view !== 'answer') return;
  if (poolBusy) return;
  poolBusy = true;
  store.loading = true;
  try {
    const all = await loadPoolsOrToast(eng.game.settings.categories);
    const recent = windowRecent(freshnessStore.load(), eng.game.settings.freshnessDays, eng.game.settings.freshnessCount);
    eng.skipRound(all, recent);
  } catch {
    /* loadError + toast already set */
  } finally {
    poolBusy = false;
    store.loading = false;
  }
}

/** Reveal → scoreboard/champion transition (post-choreography). */
export function advanceFromReveal(): void {
  const e = store.engine;
  if (!e) return;
  e.advanceAfterReveal();
  store.rev++;
  persist();
  if (e.game.status === 'finished' && !recordedHof.has(e.game.id)) {
    recordedHof.add(e.game.id);
    recordWinner(e);
  }
}

/** Scoreboard → next round (or champion when target hit). */
export async function nextRoundAdvance(): Promise<void> {
  const e = store.engine;
  if (!e || e.game.status === 'finished') {
    advanceFromReveal();
    return;
  }
  if (poolBusy) return;
  poolBusy = true;
  store.loading = true;
  try {
    const all = await loadPoolsOrToast(e.game.settings.categories);
    const recent = windowRecent(freshnessStore.load(), e.game.settings.freshnessDays, e.game.settings.freshnessCount);
    e.nextRound(all, recent);
    store.rev++;
    persist();
  } catch {
    /* toast already set */
  } finally {
    poolBusy = false;
    store.loading = false;
  }
}

/** Same crew, seats rotate, straight into the next game. */
export async function rematch(): Promise<void> {
  const e = store.engine;
  if (!e) return;
  if (poolBusy) return;
  const names = e.game.players.map((p) => p.player.name);
  const rotated = names.length > 1 ? [...names.slice(1), names[0]!] : names;
  gameStore.clear();
  await startGame(rotated, e.game.settings);
  if (!store.loadError) store.screen = 'game';
  else notify(store.loadError);
}

const recordedHof = new Set<string>();

function recordWinner(e: Engine): void {
  const winner = e.game.winnerId ? e.playerStateById(e.game.winnerId) : undefined;
  if (!winner) return;
  addHoF({
    id: e.game.id,
    mode: e.game.mode,
    winnerName: winner.player.name,
    players: e.game.players.map((p) => p.player.name),
    rounds: e.game.rounds.length,
    date: Date.now(),
    solo: e.game.settings.solo,
    score: winner.score
  });
}
