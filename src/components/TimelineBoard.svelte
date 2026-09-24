<script lang="ts">
  // Timeline round: clip loops while everyone places their year on the shared ruler.
  import { onMount, onDestroy } from 'svelte';
  import { audio } from '../lib/services/audio';
  import { store, skipCurrent } from '../lib/store.svelte';
  import { takeSfx, clamp, initials } from '../lib/services/ui';
  import HoldSkip from './HoldSkip.svelte';
  import type { Guess, PlayerState, Round, Track } from '../lib/core/types';

  let { } = $props();

  // The Engine is a plain class instance mutated in place (not Svelte-reactive), and
  // `$derived` only re-notifies downstream when its VALUE differs by reference — so
  // deriveds over engine internals freeze after the first render. Instead we snapshot
  // engine reads into $state on every engine event (store.rev); $state assignments
  // always notify (safe-equal object compare), keeping the board live each turn.
  const settings = $derived(store.engine?.game.settings ?? null);
  const yearMin = $derived(settings?.yearMin ?? 1955);
  const yearMax = $derived(settings?.yearMax ?? 2026);
  const range = $derived(Math.max(1, yearMax - yearMin));
  const hide = $derived(settings?.hideGuesses ?? false);

  let round = $state<Round | null>(null);
  let players = $state<PlayerState[]>([]);
  let track = $state<Track | null>(null);
  let activePS = $state<PlayerState | null>(null);
  let guesses = $state<Record<string, Guess>>({});
  const catMeta = $derived({ pop: 'Pop', rock: 'Rock', guilty: 'Guilty' }[track?.category ?? 'pop']);

  $effect(() => {
    void store.rev; // re-snapshot on every engine event
    const e = store.engine;
    const r = e?.currentRound ?? null;
    round = r;
    players = e?.game.players ?? [];
    track = r?.tracks[0] ?? null;
    activePS = r?.activeSeat != null ? e?.playerState(r.activeSeat) ?? null : null;
    guesses = r?.guesses ?? {};
  });

  let draftYear = $state<number | null>(null);
  let dragging = $state(false);
  let rulerEl: HTMLDivElement | null = null;
  let tapToPlay = $state(false);
  let previewError = $state<string | null>(null);
  let failCount = $state(0);
  let lockPressed = $state(false);
  let lockHint = $state(false);

  const posOf = (year: number) => ((year - yearMin) / range) * 100;
  const yearOfFrac = (f: number) => Math.round(yearMin + f * range);

  // ---------- clip: play current track; loops forever (replay on ended); restarts on skip
  let clipKey = '';
  let unmounted = false;

  async function startClip(): Promise<void> {
    const t = track;
    if (!t) return;
    tapToPlay = false;
    previewError = null;
    audio.onended = () => {
      if (unmounted) return;
      if (store.engine?.currentRound?.phase === 'answer') {
        void audio.playTrack(t, { demo: store.demo }).catch(() => {
          failCount += 1;
          tapToPlay = true;
          previewError = 'Preview stopped — retry or skip.';
        });
      }
    };
    audio.onerror = () => {
      if (unmounted) return;
      failCount += 1;
      tapToPlay = true;
      previewError = 'Preview failed to load.';
    };
    try {
      await audio.playTrack(t, { demo: store.demo });
      failCount = 0;
    } catch {
      failCount += 1;
      tapToPlay = true;
      previewError = 'Couldn’t load preview.';
    }
  }

  onMount(() => {
    const onOff = () => { previewError = navigator.onLine ? previewError : 'You’re offline — already-loaded songs still work.'; };
    window.addEventListener('offline', onOff);
    window.addEventListener('online', onOff);
    return () => {
      unmounted = true;
      audio.onended = null;
      audio.onerror = null;
      audio.stop();
      window.removeEventListener('offline', onOff);
      window.removeEventListener('online', onOff);
    };
  });
  onDestroy(() => {
    unmounted = true;
    audio.onended = null;
    audio.onerror = null;
    audio.stop();
    if (timerTick) clearInterval(timerTick);
  });

  $effect(() => {
    const r = round;
    const rev = store.rev;
    const key = r?.tracks[0] ? `${r.seq}:${r.tracks[0].id}` : '';
    if (r && r.phase === 'answer') {
      if (key && key !== clipKey) {
        clipKey = key;
        void startClip();
      }
    } else {
      clipKey = '';
      audio.stop();
    }
    void rev; // re-run on every engine event so key changes are noticed
  });

  // ---------- drag interaction (ruler)
  function toYear(clientX: number): number {
    if (!rulerEl) return 0;
    const r = rulerEl.getBoundingClientRect();
    const f = clamp((clientX - r.left) / r.width, 0, 1);
    return yearOfFrac(f);
  }

  function onDown(e: PointerEvent): void {
    if (!activePS || store.engine?.currentRound?.phase !== 'answer') return;
    dragging = true;
    takeSfx('blip');
    rulerEl?.setPointerCapture(e.pointerId);
    const y = toYear(e.clientX);
    draftYear = y;
  }
  function onMove(e: PointerEvent): void {
    if (!dragging) return;
    const y = toYear(e.clientX);
    if (draftYear !== null && y !== draftYear) void audio.sfx('tick');
    draftYear = y;
  }
  function onUp(): void {
    dragging = false;
  }

  function snap(decade: number): void {
    draftYear = decade + 5;
    takeSfx('vote');
  }
  function step(d: number): void {
    draftYear = clamp((draftYear ?? yearMin) + d, yearMin, yearMax);
    takeSfx('tick');
  }

  function lockIn(): void {
    const e = store.engine;
    if (!e || !activePS) return;
    if (draftYear === null) {
      lockHint = true;
      takeSfx('wrong');
      if (navigator.vibrate) navigator.vibrate(20);
      setTimeout(() => (lockHint = false), 600);
      return;
    }
    draftYear = clamp(draftYear, yearMin, yearMax);
    e.placeYear(activePS.player.id, draftYear);
    lockPressed = true;
    takeSfx('lock');
    if (navigator.vibrate) navigator.vibrate(10);
    setTimeout(() => (lockPressed = false), 300);
    draftYear = null;
  }

  // ---------- per-player auto-lock timer
  let timerLeft = $state(0);
  let timerTick: ReturnType<typeof setInterval> | undefined;
  $effect(() => {
    const ps = activePS;
    const t = settings?.perPlayerTimer ?? 0;
    if (timerTick) { clearInterval(timerTick); timerTick = undefined; }
    if (!ps || !t || unmounted) {
      timerLeft = 0;
      return;
    }
    timerLeft = t;
    timerTick = setInterval(() => {
      if (unmounted) {
        if (timerTick) { clearInterval(timerTick); timerTick = undefined; }
        return;
      }
      timerLeft -= 1;
      if (timerLeft === 5) takeSfx('tick');
      if (timerLeft <= 0) {
        if (timerTick) { clearInterval(timerTick); timerTick = undefined; }
        takeSfx('wrong');
        store.engine?.autoLockSeat();
      }
    }, 1000);
  });

  const lockedCount = $derived(Object.keys(guesses).length);
  const totalCount = $derived(players.length);

  // ---------- keyboard a11y for the ruler
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      lockIn();
    }
  }

  function decades(): number[] {
    const out: number[] = [];
    for (let d = 1950; d <= 2020; d += 10) if (d + 9 >= yearMin && d <= yearMax + 5) out.push(d);
    return out;
  }
  const decVoices: Record<number, string> = {
    1950: '50s',
    1960: '60s',
    1970: '70s',
    1980: '80s',
    1990: '90s',
    2000: '00s',
    2010: '10s',
    2020: '20s'
  };
</script>

<div class="board">
  <div class="topline">
    <span class="cat">{catMeta}</span>
    <HoldSkip label="⏭ Skip song" />
  </div>

  {#if !track}
    <div class="tap-card error-card" role="alert">
      <p>No song available — the pool may be empty or offline.</p>
      <div class="err-actions">
        <button class="pill pill--ghost" onclick={() => { void skipCurrent(); takeSfx('whoosh'); }}>⏭ Skip song</button>
      </div>
    </div>
  {:else if tapToPlay}
    <div class="tap-card error-card">
      <p>{previewError ?? 'Couldn’t load preview.'}{failCount >= 2 ? ' Try skipping — this song may be unavailable.' : ''}</p>
      <div class="err-actions">
        <button class="pill pill--cta" onclick={startClip}>↻ Retry</button>
        <button class="pill pill--ghost" onclick={() => { void skipCurrent(); takeSfx('whoosh'); }}>⏭ Skip song</button>
      </div>
    </div>
  {:else if activePS}
    {#key activePS.player.id + ':' + (round?.seq ?? 0)}
      <div class="turn-banner pop-in" style={`--tc:${activePS.player.color}`}>
        <span class="dot">{initials(activePS.player.name)}</span>
        <span class="tname">{activePS.player.name}</span>
        <span>— place your year</span>
        <span class="tcount tnum">{lockedCount}/{totalCount} locked</span>
        {#if timerLeft > 0}
          <span class="tcount tnum">{timerLeft}s</span>
        {/if}
      </div>
    {/key}
  {:else}
    <div class="turn-banner mut">All locks are in…</div>
  {/if}

  <div class="rulercard rich-card" class:disabled={!activePS}>
    <div
      class="ruler"
      bind:this={rulerEl}
      role="slider"
      aria-label={`Year ruler ${yearMin} to ${yearMax}`}
      aria-valuemin={yearMin}
      aria-valuemax={yearMax}
      aria-valuenow={draftYear ?? Math.round((yearMin + yearMax) / 2)}
      tabindex="0"
      onkeydown={onKey}
      onpointerdown={onDown}
      onpointermove={onMove}
      onpointerup={onUp}
      onpointercancel={onUp}
      data-testid="ruler"
    >
      <div class="decades">
        {#each decades() as d (d)}
          <span class="dec" style={`left:${posOf(d + 5)}%`}>{decVoices[d] ?? `${String(d).slice(2)}s`}</span>
        {/each}
      </div>
      <div class="trackline"></div>

      <!-- placed pins: hidden during 'answer' so the active player can't base
           their year on previous locks; Reveal shows every pin + the truth. -->
      {#if round?.phase !== 'answer'}
        {#each players as ps (ps.player.id)}
          {#if guesses[ps.player.id]?.year != null}
            <div
              class="pin"
              style={`--pc:${ps.player.color}; left:${posOf(guesses[ps.player.id]!.year!)}%`}
              data-testid={`pin-${ps.player.seat}`}
            >
              <span class="pin-in">{initials(ps.player.name)}</span>
              {#if !hide}<span class="pin-y tnum">{guesses[ps.player.id]!.year}</span>{/if}
            </div>
          {/if}
        {/each}
      {/if}

      <!-- active drag draft -->
      {#if activePS && draftYear !== null}
        <div class="draft" style={`left:${posOf(draftYear)}%`}>
          <div class="bubble tnum" style={`--pc:${activePS.player.color}`}>{draftYear}</div>
          <div class="stem" style={`background:${activePS.player.color}`}></div>
        </div>
      {/if}
    </div>

    <div class="ctrl">
      <button class="step arrow" onclick={() => step(-10)} aria-label="Earlier by 10">−10</button>
      <button class="step arrow" onclick={() => step(-1)} aria-label="Earlier by 1">−1</button>
      <div class="decchips">
        {#each decades() as d (d)}
          <button class="decchip" onclick={() => snap(d)}>{decVoices[d] ?? String(d).slice(2)}s</button>
        {/each}
      </div>
      <button class="step arrow" onclick={() => step(1)} aria-label="Later by 1">+1</button>
      <button class="step arrow" onclick={() => step(10)} aria-label="Later by 10">+10</button>
      <button class="pill pill--cta lock" class:press={lockPressed} class:shake={lockHint} disabled={!activePS} onclick={lockIn} data-testid="lock-year">
        🔒 Lock {draftYear ?? 'your year'}
      </button>
      {#if lockHint}<span class="lock-hint">Drag the ruler or tap a decade first</span>{/if}
    </div>
  </div>
</div>

<style>
  .board {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 1080px;
    margin: 0 auto;
    flex: 1;
    min-height: 0;
  }
  .topline {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex: none;
  }
  .cat {
    background: var(--card);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--r-pill);
    padding: 6px 14px;
    font-weight: 800;
    font-size: 0.85rem;
  }
  .turn-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 1rem;
    font-weight: 600;
    padding: 8px 14px;
    border-radius: var(--r-card);
    background: color-mix(in srgb, var(--tc, var(--grape)) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--tc, var(--grape)) 40%, transparent);
    flex: none;
  }
  .turn-banner.mut {
    color: var(--text-mut);
    background: var(--card);
    border-color: transparent;
  }
  .dot {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--tc);
    color: #1a101d;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.78rem;
    flex: none;
  }
  .tname {
    font-family: var(--font-display);
    font-weight: 700;
  }
  .tcount {
    margin-left: auto;
    background: rgba(0, 0, 0, 0.4);
    border-radius: var(--r-pill);
    padding: 2px 10px;
    font-variant-numeric: tabular-nums;
  }
  .rulercard {
    padding: 14px 14px 12px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    flex: 1;
    min-height: 0;
  }
  .rulercard.disabled .ruler {
    opacity: 0.6;
  }
  .ruler {
    position: relative;
    height: 150px;
    touch-action: none;
    cursor: ew-resize;
  }
  .decades {
    position: absolute;
    top: 8px;
    left: 0;
    right: 0;
    height: 22px;
  }
  .dec {
    position: absolute;
    transform: translateX(-50%);
    color: color-mix(in srgb, var(--text-mut) 55%, transparent);
    font-size: 0.72rem;
    font-weight: 700;
  }
  .trackline {
    position: absolute;
    top: 88px;
    left: 0;
    right: 0;
    height: 3px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--grape), var(--coral), var(--amber));
    opacity: 0.8;
  }
  .pin {
    position: absolute;
    top: 44px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transition: left 0.4s var(--ease-spring);
  }
  .pin-in {
    width: 34px;
    height: 34px;
    border-radius: 12px 12px 12px 4px;
    background: var(--pc);
    color: #1a101d;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.8rem;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  }
  .pin-y {
    background: rgba(0, 0, 0, 0.55);
    border-radius: 6px;
    padding: 1px 7px;
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
  }
  .draft {
    position: absolute;
    top: 44px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    z-index: 5;
  }
  .bubble {
    background: var(--pc, var(--coral));
    color: #1a101d;
    font-weight: 800;
    border-radius: 10px;
    padding: 4px 10px;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
  }
  .stem {
    width: 3px;
    height: 40px;
  }
  .ctrl {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: center;
  }
  .step {
    border-radius: var(--r-pill);
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: var(--ink-2);
    color: var(--text);
    padding: 8px 12px;
    font-weight: 700;
    touch-action: manipulation;
  }
  .arrow {
    min-width: 44px;
  }
  .decchips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .decchip {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: var(--card);
    border-radius: var(--r-pill);
    padding: 6px 10px;
    font-size: 0.8rem;
    color: var(--text-mut);
  }
  .lock {
    font-size: 1rem;
    padding: 12px 24px;
  }
  .lock.press {
    transform: scale(0.95);
  }
  .tap-card {
    background: var(--card-hi);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--r-card);
    padding: 22px;
    font-size: 1.15rem;
    font-weight: 700;
  }
  .error-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 1rem;
  }
  .error-card p { margin: 0; }
  .err-actions { display: flex; gap: 10px; flex-wrap: wrap; }
  .lock.shake { animation: shake 0.4s; }
  @keyframes shake {
    20% { transform: translateX(-5px); }
    40% { transform: translateX(5px); }
    60% { transform: translateX(-3px); }
    80% { transform: translateX(3px); }
  }
  .lock-hint { color: var(--amber); font-size: 0.85rem; font-weight: 700; }
</style>