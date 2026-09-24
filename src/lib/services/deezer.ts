// Deezer runtime client: JSONP (works in-browser, no CORS) + resolve-at-use previews.
// Rules from the plan (§4.2): signed URLs never persist; resolve right before listen;
// on audio error, cache-bust refetch once; never trust an earlier fetch.
import type { Track } from '../core/types';

let seq = 0;
const activeScripts = new Map<string, HTMLScriptElement>();

export function deezerJsonp<T>(path: string, opts: { bust?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const cb = `__deja_cb_${++seq}`;
  const bustParam = opts.bust ? `&_=${Date.now()}_${seq}` : '';
  const url = `https://api.deezer.com/${path}?output=jsonp&callback=${cb}${bustParam}`;
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => cleanup(new Error('deezer timeout')), opts.timeoutMs ?? 6000);
    const cleanup = (err: Error | null) => {
      clearTimeout(timeout);
      const el = activeScripts.get(cb);
      if (el) {
        el.remove();
        activeScripts.delete(cb);
      }
      delete (window as unknown as Record<string, unknown>)[cb];
      if (err) reject(err);
    };
    (window as unknown as Record<string, unknown>)[cb] = (data: unknown) => {
      const d = data as { error?: { code: number; message: string } };
      if (d && d.error) cleanup(new Error(`deezer ${d.error.code}: ${d.error.message}`));
      else {
        cleanup(null);
        resolve(data as T);
      }
    };
    const el = document.createElement('script');
    el.src = url;
    el.async = true;
    el.onerror = () => cleanup(new Error('deezer script error'));
    activeScripts.set(cb, el);
    document.head.appendChild(el);
  });
}

export interface DeezerTrack {
  id: number;
  title?: string;
  title_short?: string;
  artist?: { name?: string };
  album?: { cover_big?: string; title?: string; release_date?: string };
  preview?: string;
}

/** Resolve a playable preview URL at point of use. demo mode returns a local tone. */
export async function resolvePreviewUrl(track: Track, opts: { demo?: boolean } = {}): Promise<string> {
  if (opts.demo) return demoPreviewUrl();
  if (track.deezerId !== null) {
    for (const attempt of [0, 1]) {
      try {
        const t = await deezerJsonp<DeezerTrack>(`track/${track.deezerId}`, { bust: attempt === 1 });
        if (t?.preview) return t.preview;
      } catch {
        /* retry once with cache-bust */
      }
    }
  }
  if (track.itunesPreviewUrl) return track.itunesPreviewUrl;
  throw new Error('no preview available');
}

let demoUrl: string | null = null;
function demoPreviewUrl(): string {
  if (demoUrl) return demoUrl;
  // 12 s of soft tone loop (fake playable file, no network)
  const rate = 44100;
  const seconds = 12;
  const samples = rate * seconds;
  const buf = new ArrayBuffer(44 + samples * 2);
  const dv = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  dv.setUint32(4, 36 + samples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  writeStr(36, 'data');
  dv.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    // soft 440hz with tremolo, very quiet
    const v = Math.sin(2 * Math.PI * 440 * t) * 0.05 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 2 * t));
    dv.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  demoUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return demoUrl;
}