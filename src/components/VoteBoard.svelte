<script lang="ts">
  // Which Came First? — play both clips, then vote on the pass.
  import { onMount, onDestroy } from 'svelte';
  import { audio } from '../lib/services/audio';
  import { store, skipCurrent } from '../lib/store.svelte';
  import { takeSfx, initials } from '../lib/services/ui';
  import HoldSkip from './HoldSkip.svelte';
  import type { Guess, PlayerState, Round } from '../lib/core/types';

  let { } = $props();

  // The Engine is a plain class instance mutated in place (not Svelte-reactive), and
  // `$derived` only re-notifies when its VALUE differs by reference — deriveds over engine
  // internals freeze after the first render. Snapshot into $state on every engine event
  // (store.rev); $state assignments always notify, keeping the vote pass live.
  let round = $state<Round | null>(null);
  let players = $state<PlayerState[]>([]);
  let activePS = $state<PlayerState | null>(null);
  let guesses = $state<Record<string, Guess>>({});

  $effect(() => {
    void store.rev; // re-snapshot on every engine event
    const e = store.engine;
    const r = e?.currentRound ?? null;
    round = r;
    players = e?.game.players ?? [];
    activePS = r?.activeSeat != null ? e?.playerState(r.activeSeat) ?? null : null;
    guesses = r?.guesses ?? {};
  });

  const [trackA, trackB] = $derived(round?.tracks ?? []);
  const hasPair = $derived((round?.tracks.length ?? 0) >= 2);
  const votesLockedIn = $derived(
    activePS === null && !round?.buzzLockedSeats.length // all voted => activeSeat null
  );

  let playedB = $state(false);
  let playing = $state<'a' | 'b' | null>(null);
  let clipKey = '';
  let clipError = $state<string | null>(null);
  let failCount = $state(0);

  async function play(clip: 'a' | 'b'): Promise<void> {
    const t = clip === 'a' ? trackA : trackB;
    if (!t) return;
    playing = clip;
    clipError = null;
    try {
      await audio.playTrack(t, { demo: store.demo });
      if (clip === 'b') playedB = true;
      takeSfx('vote');
      failCount = 0;
    } catch {
      failCount += 1;
      clipError = `Clip ${clip.toUpperCase()} couldn’t load.${failCount >= 2 ? ' Try Skip — this pair may be unavailable.' : ' Retry below.'}`;
      takeSfx('wrong');
    } finally {
      playing = null;
    }
  }

  function vote(v: 'a' | 'b'): void {
    const e = store.engine;
    if (!e || !activePS) return;
    if (!playedB) return;
    e.vote(activePS.player.id, v);
    takeSfx('lock');
    if (navigator.vibrate) navigator.vibrate(10);
  }

  onMount(() => {
    audio.onended = null;
    audio.onerror = null;
    audio.stop();
    return () => {
      audio.onended = null;
      audio.onerror = null;
      audio.stop();
    };
  });
  onDestroy(() => {
    audio.onended = null;
    audio.onerror = null;
    audio.stop();
  });

  // auto-play clip A on round mount and after an in-round skip
  $effect(() => {
    const r = round;
    const rev = store.rev;
    const key = r?.tracks[0] ? `${r.seq}:${r.tracks[0].id}` : '';
    if (r && r.phase === 'answer') {
      if (key !== clipKey) {
        clipKey = key;
        playedB = false;
        clipError = null;
        void play('a');
      }
    } else {
      clipKey = '';
      playedB = false;
    }
    void rev;
  });
</script>

<div class="board">
  <div class="topline">
    <span class="ctx-title">
      <span class="dot">🍑</span>
      <div>
        <strong>Which came first?</strong>
        <p>Two clips — pick the one released earlier. Votes land on the board.</p>
      </div>
    </span>
    <HoldSkip label="⏭ Skip" />
  </div>

  <div class="clips">
    <div class="clipcard rich-card">
      <span class="twinkle">✦</span>
      <span class="clabel">Clip A</span>
      <button class="pill pill--cta" onclick={() => void play('a')} disabled={playing === 'a'}>
        {playing === 'a' ? 'Playing…' : '▶ Play A'}
      </button>
    </div>
    <div class="clipcard rich-card" class:alive={playedB}>
      <span class="twinkle">✦</span>
      <span class="clabel">Clip B</span>
      <button class="pill pill--cta" onclick={() => void play('b')} disabled={playing === 'b'}>
        {playing === 'b' ? 'Playing…' : playedB ? '🔁 Replay B' : '▶ Play B'}
      </button>
    </div>
  </div>

  {#if !hasPair}
    <div class="hint-card error">⚠ This pair is unavailable (missing clip). Skip to draw a fresh pair.
      <div class="err-actions">
        <button class="pill pill--ghost" onclick={() => { void skipCurrent(); takeSfx('whoosh'); }}>⏭ Skip</button>
      </div>
    </div>
  {:else if clipError}
    <div class="hint-card error">⚠ {clipError}
      <div class="err-actions">
        <button class="pill pill--ghost" onclick={() => void play(playedB ? 'a' : 'b')}>↻ Retry</button>
      </div>
    </div>
  {/if}
  {#if hasPair && !playedB}
    <div class="hint-card">Listen to <strong>B</strong> — then the vote opens.</div>
  {:else if hasPair && activePS}
    <div class="turn" style={`--tc:${activePS.player.color}`}>
      <span class="dot sm">{initials(activePS.player.name)}</span>
      <span class="tname">{activePS.player.name}</span>
      <span>— which is older?</span>
      <span class="actions">
        <button class="pill va" data-testid="vote-a" onclick={() => vote('a')} style={'background:linear-gradient(135deg,#FF7A59,#FFB020)'}>A is older</button>
        <button class="pill vb" data-testid="vote-b" onclick={() => vote('b')} style={'background:linear-gradient(135deg,#4DA6FF,#2ED3B6)'}>B is older</button>
      </span>
    </div>
  {:else if votesLockedIn}
    <div class="hint-card">All votes are in…</div>
  {/if}

  <div class="votes">
    {#each players as ps (ps.player.id)}
      {@const g = guesses[ps.player.id]}
      <div class="vchip" style={`--vc:${ps.player.color}`} data-testid={`vote-${ps.player.seat}`}>
        <span class="v-dot">{initials(ps.player.name)}</span>
        <span class="v-letter">{g?.vote ? (g.vote === 'a' ? 'A' : 'B') : '—'}</span>
      </div>
    {/each}
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
  .ctx-title {
    display: flex;
    gap: 12px;
    align-items: center;
    flex: 1;
    min-width: 0;
  }
  .topline {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
  }
  .ctx-title p {
    margin: 2px 0 0;
    color: var(--text-mut);
  }
  .dot {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: var(--card);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
  }
  .dot.sm {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    font-size: 0.75rem;
    background: var(--tc);
    color: #1a101d;
    font-weight: 800;
  }
  .clips {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
    flex: none;
  }
  .clipcard {
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .clipcard.alive {
    border-color: rgba(255, 176, 32, 0.6);
    box-shadow: 0 0 24px rgba(255, 176, 32, 0.18);
  }
  .twinkle {
    font-size: 1.6rem;
    color: var(--amber);
  }
  .clabel {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.2rem;
  }
  .hint-card {
    background: var(--card);
    border-radius: var(--r-card);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 14px 18px;
    text-align: center;
    color: var(--text-mut);
  }
  .hint-card.error { border-color: var(--err); color: var(--text); }
  .err-actions { margin-top: 10px; display: flex; gap: 10px; justify-content: center; }
  .vchip { animation: pop-in var(--dur-fast) var(--ease-spring); }
  .turn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: var(--r-card);
    background: color-mix(in srgb, var(--tc) 13%, transparent);
    border: 1px solid color-mix(in srgb, var(--tc) 38%, transparent);
    font-weight: 600;
    flex-wrap: wrap;
  }
  .tname {
    font-family: var(--font-display);
    font-weight: 700;
  }
  .actions {
    margin-left: auto;
    display: flex;
    gap: 10px;
  }
  .va,
  .vb {
    color: #1a101d;
    font-weight: 800;
  }
  .votes {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    align-content: flex-start;
  }
  .vchip {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--card);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--r-pill);
    padding: 6px 14px 6px 6px;
  }
  .v-dot {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--vc);
    color: #1a101d;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.7rem;
  }
  .v-letter {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
</style>