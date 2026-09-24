// Audio bus: one shared <audio> for clips + WebAudio-synthesized SFX (zero asset files).
// iOS unlock happens on the tap that reaches the Sound Check screen.
import { resolvePreviewUrl } from './deezer';
import type { Track } from '../core/types';

export type Sfx =
  | 'tick'
  | 'lock'
  | 'whoosh'
  | 'chime'
  | 'buzz'
  | 'wrong'
  | 'fanfare'
  | 'blip'
  | 'vote'
  | 'reveal';

class AudioBus {
  private clip: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private onendedHandler: (() => void) | null = null;
  private onerrorHandler: (() => void) | null = null;
  private listeners = new Map<'ended' | 'error', Set<() => void>>();

  private emitEvt(name: 'ended' | 'error'): void {
    for (const fn of this.listeners.get(name) ?? []) {
      try {
        fn();
      } catch {
        /* listener errors are non-fatal */
      }
    }
    if (name === 'ended') this.onendedHandler?.();
    else this.onerrorHandler?.();
  }

  /** Multi-subscriber API — prefer over the legacy onended/onerror setters. */
  onEvt(name: 'ended' | 'error', fn: () => void): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
    };
  }

  get isUnlocked(): boolean {
    return this.ctx !== null;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    // Mute the music clip too — previously only SFX were gated, so the
    // rail mute icon appeared broken while songs kept playing.
    if (this.clip) this.clip.muted = m;
  }

  /** Call from a user gesture — unlocks audio + tests it with a blip. */
  async unlock(): Promise<void> {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    await this.sfx('blip');
  }

  async playTrack(track: Track, opts: { demo?: boolean } = {}): Promise<void> {
    if (!this.clip) {
      this.clip = document.createElement('audio');
      this.clip.preload = 'none';
      (this.clip as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      this.clip.addEventListener('ended', () => this.emitEvt('ended'));
      this.clip.addEventListener('error', () => this.emitEvt('error'));
    }
    try {
      const url = await resolvePreviewUrl(track, opts);
      this.clip.src = url;
      this.clip.muted = this.muted;
      this.clip.loop = opts.demo ? true : false;
      await this.clip.play();
    } catch (err) {
      this.emitEvt('error');
      // reset so a retry can attach a fresh src / buffer
      try {
        this.clip.removeAttribute('src');
        this.clip.load();
      } catch {
        /* noop */
      }
      throw err; // let callers surface the tap-to-play fallback
    }
  }

  pause(): void {
    this.clip?.pause();
  }

  resume(): void {
    this.clip?.play().catch(() => undefined);
  }

  stop(): void {
    if (this.clip) {
      this.clip.pause();
      this.clip.removeAttribute('src');
      this.clip.load();
    }
  }

  set onended(fn: (() => void) | null) {
    this.onendedHandler = fn;
  }
  set onerror(fn: (() => void) | null) {
    this.onerrorHandler = fn;
  }

  /** Synthesized SFX. Each is a tiny envelope; no assets to load. */
  async sfx(name: Sfx): Promise<void> {
    try {
      if (this.muted || !this.ctx || !this.master) return;
      const c = this.ctx;
      if (c.state === 'closed') return;
      const master = this.master;
    const to = c.currentTime;
    const env = (dur: number, peak: number) => {
      const g = c.createGain();
      g.gain.setValueAtTime(0, to);
      g.gain.linearRampToValueAtTime(peak, to + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, to + dur);
      g.connect(master);
      return g;
    };
    const tone = (freq: number, dur: number, peak = 0.2, type: OscillatorType = 'sine', delay = 0) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = env(dur, peak);
      o.connect(g);
      o.start(to + delay);
      o.stop(to + delay + dur + 0.05);
    };
    switch (name) {
      case 'tick':
        tone(1200, 0.04, 0.06);
        break;
      case 'lock':
        tone(220, 0.12, 0.25, 'triangle');
        tone(330, 0.1, 0.2, 'triangle', 0.05);
        break;
      case 'whoosh': {
        const dur = 0.5;
        const b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-3 * i / d.length);
        const src = c.createBufferSource();
        src.buffer = b;
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(200, to);
        f.frequency.exponentialRampToValueAtTime(2400, to + dur);
        f.connect(this.master);
        const g = env(dur + 0.1, 0.35);
        src.connect(f);
        f.connect(g);
        src.start(to);
        break;
      }
      case 'chime':
        tone(659.25, 0.5, 0.2);
        tone(830.61, 0.5, 0.18, 'sine', 0.08);
        tone(987.77, 0.6, 0.15, 'sine', 0.16);
        break;
      case 'buzz':
        tone(140, 0.15, 0.45, 'square');
        break;
      case 'wrong':
        tone(220, 0.2, 0.3, 'sawtooth');
        tone(180, 0.25, 0.3, 'sawtooth', 0.05);
        break;
      case 'vote':
        tone(523.25, 0.12, 0.2);
        break;
      case 'reveal':
        tone(440, 0.4, 0.2);
        tone(554.37, 0.4, 0.18, 'sine', 0.1);
        tone(659.25, 0.5, 0.16, 'sine', 0.2);
        break;
      case 'blip':
        tone(523.25, 0.15, 0.25, 'triangle');
        tone(784, 0.2, 0.2, 'triangle', 0.08);
        break;
      case 'fanfare':
        tone(523.25, 0.25, 0.3);
        tone(659.25, 0.25, 0.28, 'sine', 0.12);
        tone(783.99, 0.25, 0.26, 'sine', 0.24);
        tone(1046.5, 0.6, 0.3, 'sine', 0.36);
        break;
    }
    } catch {
      /* WebAudio closed/suspended — non-fatal, never reject to callers */
    }
  }
}

export const audio = new AudioBus();
