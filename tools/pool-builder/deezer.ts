// Server-side Deezer client for the pool builder (Node fetch — no CORS here,
// so we get plain JSON, not JSONP). Concurrency-limited + retry with backoff.
export interface DzListingTrack {
  id: number;
  title?: string;
  title_short?: string;
  title_version?: string;
  artist?: { name?: string };
  album?: { title?: string; cover_big?: string; cover_medium?: string };
  preview?: string;
  rank?: number;
}

export interface DzTrackDetail {
  id: number;
  title?: string;
  title_short?: string;
  artist?: { name?: string };
  album?: { title?: string; cover_big?: string; cover_medium?: string; release_date?: string };
  preview?: string;
}

export interface DzPlaylistSummary {
  id: number;
  title?: string;
  nb_tracks?: number;
  public?: boolean;
}

// Deezer allows only a trickle of anonymous calls: keep a global pace of ~1.6
// req/s (600ms spacing, max 2 in flight) and back off hard on 429/quota errors.
// The pool build fans out over dozens of playlists, so this is the only thing
// standing between us and a temp IP ban.
const DEFAULT_INTERVAL_MS = 600;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_RETRIES = 5;

export class DeezerApi {
  private intervalMs: number;
  private concurrency: number;
  private running = 0;
  private queue: (() => void)[] = [];
  private lastStart = 0;

  constructor(intervalMs = DEFAULT_INTERVAL_MS, concurrency = DEFAULT_CONCURRENCY) {
    this.intervalMs = intervalMs;
    this.concurrency = concurrency;
  }

  private async acquire(): Promise<void> {
    while (this.running >= this.concurrency) {
      await new Promise<void>((r) => this.queue.push(r));
    }
    this.running++;
    const wait = this.lastStart + this.intervalMs - Date.now();
    // Small jitter avoids lockstep bursts when several awaits resolve together.
    if (wait > 0) await sleep(wait + Math.random() * 150);
    this.lastStart = Date.now();
  }

  private release(): void {
    this.running--;
    this.queue.shift()?.();
  }

  async getJson<T>(path: string, retries = DEFAULT_RETRIES): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await this.acquire();
      try {
        const res = await fetch(`https://api.deezer.com/${path}`);
        // 429 / 5xx: back off (honor Retry-After) and retry instead of hammering.
        if (res.status === 429 || res.status >= 500) {
          if (attempt >= retries) throw new Error(`deezer ${path}: HTTP ${res.status}`);
          const retryAfter = Number(res.headers.get('retry-after') ?? '0');
          const base = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * Math.pow(2, attempt);
          await sleep(base + Math.random() * 500);
          continue;
        }
        const data = (await res.json()) as T & { error?: { code: number; message?: string } };
        if (data && (data as { error?: unknown }).error) {
          // Deezer quota errors also arrive as 200 + {error:{code:4}} — treat like 429.
          const code = (data as { error?: { code?: number } }).error?.code;
          if ((code === 4 || code === 700) && attempt < retries) {
            await sleep(1500 * Math.pow(2, attempt) + Math.random() * 500);
            continue;
          }
          throw new Error(`deezer ${path}: ${JSON.stringify((data as { error?: unknown }).error)}`);
        }
        return data;
      } catch (err) {
        if (attempt >= retries) throw err;
        await sleep(600 * Math.pow(2, attempt) + Math.random() * 250);
      } finally {
        this.release();
      }
    }
  }

  /** `/chart/{id}/tracks` paged via index; stops when a page is empty. */
  async chartTracks(chartId: number, cap = 1200): Promise<DzListingTrack[]> {
    const out: DzListingTrack[] = [];
    for (let index = 0; out.length < cap; index += 100) {
      const page = await this.getJson<{ data: DzListingTrack[] }>(
        `chart/${chartId}/tracks?limit=100&index=${index}`
      );
      if (!page.data || page.data.length === 0) break;
      out.push(...page.data);
      if (page.data.length < 100) break;
    }
    return out.slice(0, cap);
  }

  /** Nearly all variables are prior — playlists by query, largest first. */
  async searchPlaylists(q: string, limit = 10): Promise<DzPlaylistSummary[]> {
    const res = await this.getJson<{ data: DzPlaylistSummary[] }>(
      `search/playlist?q=${encodeURIComponent(q)}&limit=${limit}`
    );
    return res.data ?? [];
  }

  async playlistTracks(playlistId: number, cap = 800): Promise<DzListingTrack[]> {
    const out: DzListingTrack[] = [];
    for (let index = 0; out.length < cap; index += 100) {
      const page = await this.getJson<{ data: DzListingTrack[] }>(
        `playlist/${playlistId}/tracks?limit=100&index=${index}`
      );
      if (!page.data || page.data.length === 0) break;
      out.push(...page.data);
      if (page.data.length < 100) break;
    }
    return out.slice(0, cap);
  }

  async trackDetail(id: number): Promise<DzTrackDetail> {
    return this.getJson<DzTrackDetail>(`track/${id}`);
  }

  async searchTracks(q: string, limit = 6): Promise<DzListingTrack[]> {
    const res = await this.getJson<{ data: DzListingTrack[] }>(
      `search?q=${encodeURIComponent(q)}&limit=${limit}`
    );
    return res.data ?? [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}