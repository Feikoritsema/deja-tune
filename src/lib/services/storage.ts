// localStorage persistence: active game snapshot, freshness records, hall of fame.
import type { EngineSnapshot } from '../core/game';
import type { FreshRecord } from '../core/freshness';
import type { Track } from '../core/types';

const K = {
  game: 'deja:tune:game:v1',
  freshness: 'deja:tune:freshness:v1',
  hof: 'deja:tune:hof:v1',
  lastPlayers: 'deja:tune:lastplayers:v1'
};

export interface HoFEntry {
  id: string;
  mode: string;
  winnerName: string;
  players: string[];
  rounds: number;
  date: number;
  solo: boolean;
  score: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* non-fatal */
  }
}

export const gameStore = {
  load(): EngineSnapshot | null {
    return read<EngineSnapshot | null>(K.game, null);
  },
  save(s: EngineSnapshot): void {
    write(K.game, s);
  },
  clear(): void {
    try {
      localStorage.removeItem(K.game);
    } catch {
      /* noop */
    }
  }
};

export const freshnessStore = {
  load(): FreshRecord[] {
    return read<FreshRecord[]>(K.freshness, []);
  },
  add(track: Track): void {
    const list = read<FreshRecord[]>(K.freshness, []);
    if (track.deezerId === null) return;
    list.push({ deezerId: track.deezerId, playedAt: Date.now() });
    // cap growth to ~last 400 records (~8 weeks of heavy play)
    const trimmed = list.sort((a, b) => b.playedAt - a.playedAt).slice(0, 400);
    write(K.freshness, trimmed);
  }
};

export const hofStore = {
  load(): HoFEntry[] {
    return read<HoFEntry[]>(K.hof, []);
  },
  add(entry: HoFEntry): void {
    const list = read<HoFEntry[]>(K.hof, []).filter((x) => x.id !== entry.id);
    list.unshift(entry);
    write(K.hof, list.slice(0, 100));
  }
};

export const lastPlayersStore = {
  load(): string[] {
    return read<string[]>(K.lastPlayers, []);
  },
  save(names: string[]): void {
    write(K.lastPlayers, names.slice(0, 8));
  }
};