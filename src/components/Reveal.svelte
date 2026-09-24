<script lang="ts">
  // The reveal: truth sweeps in, crown drops, points count, then the drop card.
  import { onMount, onDestroy } from 'svelte';
  import { store, advanceFromReveal, skipCurrent } from '../lib/store.svelte';
  import { audio } from '../lib/services/audio';
  import { RACE_STEPS } from '../lib/core/game';
  import { takeSfx, initials } from '../lib/services/ui';
  import CountUp from './CountUp.svelte';
  import type { PlayerState, Round } from '../lib/core/types';

  let { } = $props();

  // Snapshot engine reads on every event: Engine is mutated in place and not
  // Svelte-reactive, so plain $derived(eng.currentRound) would freeze (same
  // bug as RaceBoard stage). This also makes host-override points update live.
  let round = $state<Round | null>(null);
  let players = $state<PlayerState[]>([]);
  $effect(() => {
    void store.rev;
    round = store.engine?.currentRound ?? null;
    players = store.engine?.game.players ?? [];
  });
  const settings = $derived(store.engine?.game.settings ?? null);
  const yearMin = $derived(settings?.yearMin ?? 1955);
  const yearMax = $derived(settings?.yearMax ?? 2026);
  const range = $derived(Math.max(1, yearMax - yearMin));
  const mode = $derived(store.engine?.game.mode ?? 'timeline');
  const track = $derived(round?.tracks[0] ?? null);
  const hasTrack = $derived((round?.tracks.length ?? 0) > 0);
  const truthYear = $derived(track?.year ?? 2020);

  let phase = $state(0);
  let revealed = $state(false);
  let advDone = $state(false);
  let replaying = $state(false);
  let coverBroken = $state(false);
  // The countdown bar is driven per-frame, so it must NOT be reactive state —
  // writing `countdown` as $state at 60fps makes Svelte diff the whole reveal
  // tree every frame for the full 6.5s. Keep it a plain number and paint the
  // bar element directly; the rest of the reveal only re-renders on discrete
  // phase changes (150ms/1000ms/… steps), which is buttery on iPad.
  let countdown = 1;
  let countFill: HTMLDivElement | undefined;

  const posOf = (year: number) => ((year - yearMin) / range) * 100;

  let timers: ReturnType<typeof setTimeout>[] = [];
  let raf = 0;
  let deadline = 0;
  const DUR = 6500;

  function startCountdown(remaining = DUR): void {
    cancelAnimationFrame(raf);
    deadline = Date.now() + remaining;
    const step = () => {
      countdown = Math.max(0, (deadline - Date.now()) / DUR);
      if (countFill) countFill.style.transform = `scaleX(${countdown})`;
      if (countdown > 0) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  onMount(() => {
    void audio.stop();
    advDone = false;
    coverBroken = false;
    countdown = 1;
    startCountdown(DUR);
    timers = [
      setTimeout(() => { phase = 1; takeSfx('reveal'); }, 150),
      setTimeout(() => { phase = 2; takeSfx('chime'); }, 1000),
      setTimeout(() => { phase = 3; void audio.sfx('whoosh'); }, 1600),
      setTimeout(() => { revealed = true; }, 1900),
      setTimeout(() => adv(), DUR)
    ];
    return () => { timers.forEach(clearTimeout); cancelAnimationFrame(raf); };
  });
  onDestroy(() => {
    timers.forEach(clearTimeout);
    cancelAnimationFrame(raf);
  });

  function adv(): void {
    if (advDone) return;
    if (store.engine?.view !== 'reveal') return;
    advDone = true;
    timers.forEach(clearTimeout);
    cancelAnimationFrame(raf);
    takeSfx('vote');
    advanceFromReveal();
  }

  async function replay(ev: Event): Promise<void> {
    ev.stopPropagation();
    const t = track;
    if (!t || replaying) return;
    replaying = true;
    try {
      await audio.playTrack(t, { demo: store.demo });
    } catch {
      /* preview may be gone — non-fatal */
    } finally {
      replaying = false;
    }
  }

  function override(ev: Event, playerId: string, correct: boolean): void {
    ev.stopPropagation();
    store.engine?.overrideCorrect(playerId, correct);
    takeSfx(correct ? 'chime' : 'wrong');
    store.rev++;
    // Give the host time to review after an override — restart the countdown.
    timers.forEach(clearTimeout);
    timers = [setTimeout(() => adv(), DUR)];
    startCountdown(DUR);
  }

  const crownSeats = $derived.by(() => {
    if (mode !== 'timeline') return new Set<number>();
    const dists = players
      .map((p) => round?.guesses[p.player.id]?.distance)
      .filter((d): d is number => typeof d === 'number');
    if (!dists.length) return new Set<number>();
    const min = Math.min(...dists);
    return new Set(players.filter((p) => round?.guesses[p.player.id]?.distance === min).map((p) => p.player.seat));
  });
</script>

<section class="reveal" aria-label="Round reveal" data-testid="reveal-screen">
  {#if !hasTrack}
    <div class="tap-card error-card" role="alert">
      <p>No song available for this round — the pool may be empty or offline.</p>
      <div class="err-actions">
        <button class="pill pill--cta" onclick={() => { store.rev++; }}>↻ Retry</button>
        <button class="pill pill--ghost" onclick={() => { void skipCurrent(); }}>⏭ Skip song</button>
      </div>
    </div>
  {/if}
  {#if phase >= 1 && mode === 'timeline' && hasTrack}
    <div class="board-mini rich-card">
      <div class="labels">
        <span class="y tnum" style={`left:${posOf(truthYear)}%`} data-testid="truth-year">{truthYear}</span>
        {#each players as ps (ps.player.id)}
          {@const g = round?.guesses[ps.player.id]}
          {#if g?.year != null}
            <span class="pname" style={`left:${posOf(g.year)}%; --pc:${ps.player.color}`}>
              {initials(ps.player.name)}
            </span>
          {/if}
        {/each}
      </div>
      <div class="rastro">
        <div class="truthmark" class:on={phase >= 2} style={`left:${posOf(truthYear)}%`}>
          <span class="crown" aria-hidden="true">👑</span>
        </div>
        {#each players as ps (ps.player.id)}
          {@const g = round?.guesses[ps.player.id]}
          {#if g?.year != null}
            <div class="pin" style={`left:${posOf(g.year)}%; --pc:${ps.player.color}`}>
              <span class="pin-in">{initials(ps.player.name)}</span>
              <span class="pts tnum" class:crown={crownSeats.has(ps.player.seat)}>
                {#if phase >= 3}
                  {g.points > 0 ? `+${g.points}` : g.points}
                {/if}
              </span>
              {#if revealed}
                <span class="override-row">
                  <button class="pill pill--ghost mini" onclick={(e) => override(e, ps.player.id, true)} title="Host override: credit full marks">✓</button>
                  <button class="pill pill--ghost mini" onclick={(e) => override(e, ps.player.id, false)} title="Host override: zero this guess">✗</button>
                </span>
              {/if}
            </div>
          {/if}
        {/each}
        <div class="sweep" class:on={phase >= 2} style={`left:${posOf(truthYear)}%`}></div>
      </div>
    </div>
  {/if}

  {#if phase >= 3 && (mode === 'buzz' || mode === 'race') && round?.buzzWinnerId}
    <div class="buzz-verdict">
      {#each players as ps (ps.player.id)}
        {@const g = round?.guesses[ps.player.id]}
        {#if g?.text}
          <div class="vline" style={`--vc:${ps.player.color}`}>
            <span class="dot">{initials(ps.player.name)}</span>
            <span class="txt">“{g.text}”</span>
            <span class="verdict">
              {#if g.correctLevel === 'both'}<span class="ok">✅ title + artist</span>
              {:else if g.correctLevel === 'title'}<span class="ok">✅ title</span>
              {:else if g.correctLevel === 'artist'}<span class="ok">✅ artist</span>
              {:else}<span class="no">❌ wrong</span>{/if}
              <span class="pts tnum">{g.points > 0 ? `+${g.points}` : g.points}</span>
              {#if revealed}
                <button class="pill pill--ghost mini" onclick={(e) => override(e, ps.player.id, true)} title="Host override: accept as correct">✓ Accept</button>
                <button class="pill pill--ghost mini" onclick={(e) => override(e, ps.player.id, false)} title="Host override: keep as wrong">✗ Wrong</button>
              {/if}
            </span>
          </div>
        {/if}
      {/each}
      {#if mode === 'race' && round}
        <p class="race-note">Won at {RACE_STEPS[Math.min(round.raceStage ?? 0, RACE_STEPS.length - 1)]}s snippet</p>
      {/if}
    </div>
  {/if}

  {#if phase >= 3 && mode === 'first' && round}
    <div class="chain">
      {#each round.tracks as t, i (t.id)}
        <div class="chainlink">
          <span class="cl">{i === 0 ? 'A' : 'B'}</span>
          <CountUp value={t.year} duration={600} />
        </div>
        {#if i === 0}
          <span class="vs">vs</span>
        {/if}
      {/each}
      <div class="chainvotes">
        {#each players as ps (ps.player.id)}
          {@const g = round?.guesses[ps.player.id]}
          <span class="cv" style={`--vc:${ps.player.color}`}>
            {initials(ps.player.name)} {g?.vote === 'a' ? 'A' : g?.vote === 'b' ? 'B' : '·'} {g?.points || ''}
            {#if revealed && g}
              <button class="pill pill--ghost mini" onclick={(e) => override(e, ps.player.id, true)} title="Host override: mark correct">✓</button>
              <button class="pill pill--ghost mini" onclick={(e) => override(e, ps.player.id, false)} title="Host override: mark wrong">✗</button>
            {/if}
          </span>
        {/each}
      </div>
    </div>
  {/if}

  {#if phase >= 3 && mode === 'cards' && round}
    {@const gs = Object.values(round.guesses)}
    {@const gp = gs[0]}
    {@const owner = gp ? players.find((p) => p.player.id === gp.playerId) : undefined}
    {@const board = gp ? (store.engine?.game.boards[gp.playerId] ?? []) : []}
    {#if gp && owner}
      <div class="chain" data-testid="cards-verdict">
        <span class="dot">{initials(owner.player.name)}</span>
        <span class="cv" style={`--vc:${owner.player.color}`}>
          {owner.player.name} {gp.points > 0 ? '✅ card stays!' : '❌ discarded'}
        </span>
        {#if revealed}
          <span class="override-row">
            <button class="pill pill--ghost mini" onclick={(e) => override(e, owner.player.id, true)} title="Host override: card stays">✓ Stays</button>
            <button class="pill pill--ghost mini" onclick={(e) => override(e, owner.player.id, false)} title="Host override: discard card">✗ Discard</button>
          </span>
        {/if}
        <div class="chainvotes">
          {#each board as c (c.id)}
            <span class="cv tnum" title={`${c.title} — ${c.artist}`}>{c.year}</span>
          {/each}
        </div>
      </div>
    {/if}
  {/if}

  {#if track}
    <div class="drop rich-card" class:show={revealed} data-testid="reveal-card">
      {#if track.cover && !coverBroken}
        <img class="cover" src={track.cover} alt="" loading="lazy" onerror={() => (coverBroken = true)} />
      {:else}
        <div class="cover fallback font-display">{track.title.slice(0, 1)}</div>
      {/if}
      <div class="meta">
        <h2 class="title font-display" data-testid="reveal-title">{track.title}</h2>
        <p class="artist" data-testid="reveal-artist">{track.artist}</p>
        <p class="yr">Released <CountUp value={track.year} duration={900} /> · {track.category}</p>
        <button class="pill pill--ghost mini" onclick={replay} disabled={replaying}>
          {replaying ? 'Playing…' : '🔁 Replay clip'}
        </button>
      </div>
    </div>
  {/if}

  <div class="countbar" aria-hidden="true"><div class="countfill" bind:this={countFill}></div></div>

  {#if revealed}
    <button class="pill pill--ghost cont" data-testid="continue" onclick={adv}>Tap to continue →</button>
  {:else}
    <p class="wait" aria-hidden="true">…</p>
  {/if}
  <p class="sr-only" role="status" aria-live="assertive">{revealed ? `Reveal complete. ${track ? `${track.title} by ${track.artist}, ${track.year}.` : ''}` : ''}</p>
</section>

<style>
  .reveal {
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: center;
    width: 100%;
    max-width: 1080px;
    margin: 0 auto;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 2px;
  }
  .board-mini {
    width: 100%;
    padding: 22px 20px 16px;
  }
  .labels {
    position: relative;
    height: 18px;
    margin-bottom: 6px;
  }
  .y {
    position: absolute;
    transform: translateX(-50%);
    font-weight: 800;
    color: var(--amber);
    font-variant-numeric: tabular-nums;
  }
  .pname {
    position: absolute;
    bottom: 0;
    transform: translateX(-50%);
    font-size: 0.7rem;
    color: var(--pc);
    font-weight: 700;
  }
  .rastro {
    position: relative;
    height: 132px;
  }
  .pin {
    position: absolute;
    top: 8px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    transition: left 0.5s var(--ease-spring);
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
    font-size: 0.78rem;
  }
  .pts {
    font-size: 0.85rem;
    font-weight: 800;
    color: var(--mint);
    font-variant-numeric: tabular-nums;
  }
  .pts.crown {
    color: var(--amber);
  }
  .truthmark {
    position: absolute;
    top: -2px;
    transform: translateX(-50%);
    opacity: 0;
    transition: opacity var(--dur);
  }
  .truthmark.on {
    opacity: 1;
    animation: crown-in 0.5s var(--ease-spring);
  }
  @keyframes crown-in {
    from {
      transform: translateX(-50%) translateY(-14px) scale(0.5);
    }
    to {
      transform: translateX(-50%) translateY(0) scale(1);
    }
  }
  .crown {
    font-size: 1.6rem;
  }
  .sweep {
    position: absolute;
    top: 40px;
    width: 3px;
    height: 0;
    transform: translateX(-50%);
    background: linear-gradient(var(--amber), transparent);
    border-radius: 2px;
    transition: height 1.4s var(--ease-out);
  }
  .sweep.on {
    height: 64px;
  }
  .buzz-verdict {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .vline {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--card);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--r-card);
    padding: 12px 16px;
  }
  .dot {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--vc);
    color: #1a101d;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.75rem;
  }
  .txt {
    font-weight: 600;
  }
  .verdict {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ok {
    color: var(--mint);
    font-weight: 700;
  }
  .no {
    color: var(--err);
    font-weight: 700;
  }
  .pts {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    background: rgba(0, 0, 0, 0.35);
    border-radius: var(--r-pill);
    padding: 2px 10px;
  }
  .chain {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    justify-content: center;
    background: var(--card);
    border-radius: var(--r-card);
    padding: 16px 20px;
  }
  .chainlink {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
  }
  .cl {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--cta);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.95rem;
  }
  .vs {
    color: var(--text-mut);
    font-weight: 700;
  }
  .chainvotes {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    width: 100%;
  }
  .cv {
    background: var(--ink-2);
    border-radius: var(--r-pill);
    padding: 4px 12px;
    color: var(--vc);
    font-weight: 700;
    font-size: 0.85rem;
  }
  .drop {
    display: flex;
    gap: 18px;
    align-items: center;
    padding: 18px;
    max-width: 560px;
    width: 100%;
    opacity: 0;
    transform: translateY(18px);
    transition: opacity var(--dur-slow) var(--ease-out), transform var(--dur-slow) var(--ease-out);
  }
  .drop.show {
    opacity: 1;
    transform: none;
  }
  .cover {
    width: 96px;
    height: 96px;
    border-radius: 18px;
    object-fit: cover;
    background: var(--card-hi);
    flex: none;
    animation: cover-in var(--dur) var(--ease-out);
  }
  @keyframes cover-in {
    from {
      opacity: 0;
      transform: scale(0.94);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .cover.fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.4rem;
    color: var(--text-mut);
  }
  .meta {
    min-width: 0;
  }
  .title {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.1;
  }
  .artist {
    margin: 4px 0 6px;
    color: var(--text-mut);
    font-weight: 600;
  }
  .yr {
    margin: 0;
    color: var(--amber);
    font-weight: 700;
  }
  .cont {
    margin-top: 6px;
  }
  .mini { font-size: 0.8rem; padding: 6px 12px; }
  .override-row { display: inline-flex; gap: 6px; margin-top: 4px; }
  .race-note { color: var(--amber); font-weight: 700; text-align: center; width: 100%; }
  .countbar {
    width: 100%;
    max-width: 560px;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }
  .countfill {
    height: 100%;
    background: var(--amber);
    transform-origin: left;
    will-change: transform;
  }
  .wait {
    color: transparent;
    user-select: none;
  }
  .tap-card {
    background: var(--card-hi);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--r-card);
    padding: 20px;
    font-weight: 700;
    width: 100%;
  }
  .error-card { display: flex; flex-direction: column; gap: 12px; font-size: 1rem; }
  .error-card p { margin: 0; }
  .err-actions { display: flex; gap: 10px; flex-wrap: wrap; }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
