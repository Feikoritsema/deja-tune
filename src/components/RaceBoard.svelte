<script lang="ts">
  // Opening Bars Race: one mystery song, snippet grows 0.7s → 12s.
  // Buzz early for max points; wrong = lockout + clip keeps growing.
  import { onMount, onDestroy } from 'svelte';
  import { audio } from '../lib/services/audio';
  import { store, skipCurrent } from '../lib/store.svelte';
  import { RACE_STEPS } from '../lib/core/game';
  import { takeSfx, initials } from '../lib/services/ui';
  import HoldSkip from './HoldSkip.svelte';
  import type { Guess, PlayerState, Round, Track } from '../lib/core/types';

  let { } = $props();

  // Snapshot pattern (same as other boards): Engine is mutated in place and not
  // Svelte-reactive, so a $derived reading engine internals directly would freeze.
  // Derive stage from the snapshotted round instead.
  let round = $state<Round | null>(null);
  let players = $state<PlayerState[]>([]);
  let track = $state<Track | null>(null);
  let winnerPS = $state<PlayerState | null>(null);
  let guesses = $state<Record<string, Guess>>({});

  $effect(() => {
    void store.rev;
    const e = store.engine;
    const r = e?.currentRound ?? null;
    round = r;
    players = e?.game.players ?? [];
    track = r?.tracks[0] ?? null;
    winnerPS = r?.buzzWinnerId ? e?.playerStateById(r.buzzWinnerId) ?? null : null;
    guesses = r?.guesses ?? {};
  });

  const stage = $derived(round?.raceStage ?? 0);
  const heardSecs = $derived(RACE_STEPS[Math.min(stage, RACE_STEPS.length - 1)] ?? 0.7);
  const solo = $derived(store.engine?.game.settings.solo ?? false);
  const soloId = $derived(solo ? (players[0]?.player.id ?? null) : null);
  const hintLevel = $derived(soloId && round ? (round.hintsUsed?.[soloId] ?? 0) : 0);
  const hintText = $derived.by(() => {
    if (!track || hintLevel <= 0) return null;
    const parts: string[] = [];
    if (hintLevel >= 1 && track.year) parts.push(`Decade: ${Math.floor(track.year / 10) * 10}s`);
    if (hintLevel >= 2 && track.artist) parts.push(`Artist starts with “${track.artist.trim().slice(0, 1).toUpperCase()}”`);
    if (hintLevel >= 3 && track.title) parts.push(`Title starts with “${track.title.trim().slice(0, 1).toUpperCase()}”`);
    return parts.join(' · ');
  });

  function takeHint(): void {
    if (!soloId) return;
    store.engine?.useHint(soloId);
    takeSfx('blip');
  }

  let answer = $state('');
  let tapToPlay = $state(false);
  let previewError = $state<string | null>(null);
  let failCount = $state(0);
  let winFlash = $state<string | null>(null);
  let answerInput = $state<HTMLInputElement | null>(null);
  let clipKey = '';
  let unmounted = false;
  let stageTimer: ReturnType<typeof setTimeout> | undefined;
  let answerLeft = $state(0);
  let answerTimer: ReturnType<typeof setInterval> | undefined;
  let emptyHint = $state(false);

  function clearStageTimer(): void {
    if (stageTimer) { clearTimeout(stageTimer); stageTimer = undefined; }
  }
  function stopAnswerTimer(): void {
    if (answerTimer) { clearInterval(answerTimer); answerTimer = undefined; }
  }
  function startAnswerTimer(): void {
    stopAnswerTimer();
    answerLeft = 25;
    answerTimer = setInterval(() => {
      answerLeft -= 1;
      if (answerLeft === 5) takeSfx('tick');
      if (answerLeft <= 0) {
        stopAnswerTimer();
        giveUp(true);
      }
    }, 1000);
  }

  async function playStage(): Promise<void> {
    const t = track;
    const e = store.engine;
    if (!t || !e) return;
    const r = e.currentRound;
    if (!r || r.phase !== 'answer' || r.buzzWinnerId) return;
    clearStageTimer();
    tapToPlay = false;
    previewError = null;
    const secs = RACE_STEPS[Math.min(r.raceStage ?? 0, RACE_STEPS.length - 1)] ?? 0.7;
    try {
      await audio.playTrack(t, { demo: store.demo });
      failCount = 0;
      // Snippet window: pause after `secs`, then grow to the next stage.
      stageTimer = setTimeout(() => {
        audio.pause();
        const cur = store.engine?.currentRound;
        if (!cur || cur.phase !== 'answer' || cur.buzzWinnerId || unmounted) return;
        if ((cur.raceStage ?? 0) >= RACE_STEPS.length - 1) {
          store.engine?.raceExhaustStages();
          return;
        }
        store.engine?.raceAdvanceStage();
        takeSfx('blip');
        setTimeout(() => { if (!unmounted) void playStage(); }, 900);
      }, Math.round(secs * 1000));
    } catch {
      failCount += 1;
      tapToPlay = true;
      previewError = 'Couldn’t load preview.';
    }
  }

  onMount(() => {
    const onOff = () => { if (!navigator.onLine) { previewError = 'You’re offline.'; tapToPlay = true; } };
    window.addEventListener('offline', onOff);
    window.addEventListener('online', onOff);
    return () => {
      unmounted = true;
      clearStageTimer();
      stopAnswerTimer();
      audio.onended = null;
      audio.onerror = null;
      audio.stop();
      window.removeEventListener('offline', onOff);
      window.removeEventListener('online', onOff);
    };
  });
  onDestroy(() => {
    unmounted = true;
    clearStageTimer();
    stopAnswerTimer();
    audio.onended = null;
    audio.onerror = null;
    audio.stop();
  });

  let lastWinnerKey = '';
  $effect(() => {
    void store.rev;
    const key = winnerPS ? `${round?.seq ?? 0}:${winnerPS.player.id}` : '';
    if (answerInput && winnerPS) answerInput.focus();
    if (key && key !== lastWinnerKey) {
      lastWinnerKey = key;
      if (winnerPS) startAnswerTimer();
    }
    if (!winnerPS) {
      lastWinnerKey = '';
      stopAnswerTimer();
    }
  });

  $effect(() => {
    const r = round;
    const rev = store.rev;
    const key = r?.tracks[0] ? `${r.seq}:${r.tracks[0].id}` : '';
    if (r && r.phase === 'answer') {
      if (key && key !== clipKey) {
        clipKey = key;
        void playStage();
      }
    } else {
      clipKey = '';
      clearStageTimer();
      audio.stop();
    }
    void rev;
  });

  function onZoneDown(ev: PointerEvent, ps: PlayerState): void {
    if (!round || round.phase !== 'answer') return;
    if (round.buzzLockedSeats.includes(ps.player.seat)) return;
    if (round.buzzWinnerId) return;
    const ok = store.engine?.buzz(ps.player.seat, ps.player.id, ev.timeStamp) ?? false;
    if (ok) {
      takeSfx('buzz');
      if (navigator.vibrate) navigator.vibrate(15);
      clearStageTimer();
      void audio.pause();
      answer = '';
    }
  }

  function giveUp(auto = false): void {
    const e = store.engine;
    if (!e || !winnerPS) return;
    stopAnswerTimer();
    e.releaseBuzz(winnerPS.player.id);
    takeSfx('wrong');
    answer = '';
    setTimeout(() => { if (!unmounted) void playStage(); }, auto ? 700 : 300);
  }

  async function submit(): Promise<void> {
    const e = store.engine;
    if (!e || !winnerPS) return;
    if (!answer.trim()) {
      emptyHint = true;
      setTimeout(() => (emptyHint = false), 600);
      return;
    }
    stopAnswerTimer();
    clearStageTimer();
    const ok = e.submitAnswer(winnerPS.player.id, answer);
    takeSfx(ok ? 'chime' : 'wrong');
    if (navigator.vibrate) navigator.vibrate(ok ? 10 : 30);
    if (!ok) {
      winFlash = winnerPS.player.seat === null ? null : String(winnerPS.player.seat);
      setTimeout(() => (winFlash = null), 600);
      setTimeout(() => { if (!unmounted) void playStage(); }, 700);
    }
    answer = '';
  }
</script>

<div class="board">
  <div class="topline">
    <span class="cat">🏁 Opening Bars</span>
    <span class="loops tnum">heard {heardSecs}s · stage {Math.min(stage + 1, RACE_STEPS.length)}/{RACE_STEPS.length}</span>
    <HoldSkip label="⏭ Skip" />
  </div>

  <div class="stages" aria-hidden="true">
    {#each RACE_STEPS as s, i (s)}
      <span class="stage" class:on={i <= stage} style={`--w:${(s / 12) * 100}%`}>{s}s</span>
    {/each}
  </div>
  <div class="progress" aria-hidden="true"><div class="fill" style={`width:${((stage + 1) / RACE_STEPS.length) * 100}%`}></div></div>

  {#if solo && !winnerPS && round?.phase === 'answer' && track}
    <div class="hintbar">
      <button class="pill pill--ghost" onclick={takeHint} disabled={hintLevel >= 3} title="Each hint costs 1 point">
        💡 Hint ({hintLevel}/3 · −1pt)
      </button>
      {#if hintText}<span class="hinttxt">{hintText}</span>{/if}
    </div>
  {/if}

  {#if !track}
    <div class="tap-card error-card" role="alert">
      <p>No song available — the pool may be empty or offline.</p>
      <div class="err-actions">
        <button class="pill pill--ghost" onclick={() => { void skipCurrent(); takeSfx('whoosh'); }}>⏭ Skip</button>
      </div>
    </div>
  {:else if tapToPlay}
    <div class="tap-card error-card">
      <p>{previewError ?? 'Couldn’t load preview.'}{failCount >= 2 ? ' This song may be unavailable — skip it.' : ''}</p>
      <div class="err-actions">
        <button class="pill pill--cta" onclick={playStage}>↻ Retry</button>
        <button class="pill pill--ghost" onclick={() => { void skipCurrent(); takeSfx('whoosh'); }}>⏭ Skip</button>
      </div>
    </div>
  {/if}

  {#if winnerPS}
    <div class="winner-overlay" role="dialog" aria-label="Buzz winner">
    <div class="winner rich-card" style={`--wc:${winnerPS.player.color}`} data-testid="buzz-winner">
      <div class="w-title">
        <span class="w-dot">{initials(winnerPS.player.name)}</span>
        <strong data-testid="winner-name">{winnerPS.player.name}</strong>
        <span>buzzed at {heardSecs}s! Name it:</span>
        <span class="tcount tnum" data-testid="answer-timer">{answerLeft}s</span>
      </div>
      <form class="w-form" onsubmit={(ev) => { ev.preventDefault(); void submit(); }}>
        <input
          placeholder="Song title…"
          bind:value={answer}
          bind:this={answerInput}
          data-testid="buzz-input"
          class:shake={emptyHint}
          maxlength={200}
        />
        <button class="pill pill--cta" type="submit" data-testid="buzz-submit">Check</button>
        <button class="pill pill--ghost" type="button" data-testid="buzz-giveup" onclick={() => giveUp()}>Give up</button>
      </form>
      {#if emptyHint}<p class="hint err">Type something first — or Give up to release the floor.</p>{/if}
      <p class="hint">Earlier buzz = more points (8 → 3 for both). Tip: “title” or “artist - title”</p>
    </div>
    </div>
  {/if}

  <div
    class="zones"
    class:dimmed={!!winnerPS}
    style={`--zcols:${players.length <= 3 ? players.length : players.length === 4 ? 2 : players.length <= 6 ? 3 : 4}; --zrows:${players.length <= 3 ? 1 : 2}`}
  >
    {#each players as ps (ps.player.id)}
      {@const locked = round?.buzzLockedSeats.includes(ps.player.seat) ?? false}
      {@const buzzState = winnerPS?.player.id === ps.player.id}
      <button
        class="zone"
        class:locked
        class:flash={winFlash === String(ps.player.seat) && locked}
        style={`--zc:${ps.player.color}`}
        data-testid={`zone-${ps.player.seat}`}
        onpointerdown={(e) => onZoneDown(e, ps)}
        oncontextmenu={(e) => e.preventDefault()}
        disabled={locked || (!!winnerPS && !buzzState) || round?.phase !== 'answer'}
      >
        <span class="z-dot">{initials(ps.player.name)}</span>
        <span class="z-name">{ps.player.name}</span>
        {#if locked}
          <span class="z-badge">❌ out</span>
        {:else if buzzState}
          <span class="z-badge">🔔!</span>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .board { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 1080px; margin: 0 auto; flex: 1; min-height: 0; }
  .topline { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex: none; }
  .cat {
    background: var(--card);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--r-pill);
    padding: 6px 14px;
    font-weight: 800;
  }
  .loops { color: var(--text-mut); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
  .stages { display: flex; gap: 8px; flex-wrap: wrap; flex: none; }
  .stage {
    background: var(--card);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--r-pill);
    padding: 4px 12px;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-mut);
  }
  .stage.on { border-color: var(--amber); color: var(--amber); box-shadow: 0 0 14px rgba(255, 176, 32, 0.25); }
  .progress { height: 6px; border-radius: 4px; background: rgba(255,255,255,0.1); overflow: hidden; flex: none; }
  .progress .fill { display: block; height: 100%; background: linear-gradient(90deg, var(--amber), var(--coral)); transition: width var(--dur) var(--ease-out); }
  .hintbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    background: var(--card);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--r-card);
    padding: 10px 14px;
    flex: none;
  }
  .hinttxt {
    color: var(--amber);
    font-weight: 700;
    font-size: 0.9rem;
  }
  .winner-overlay {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.55);
  }
  .winner-overlay .winner {
    width: 100%;
    max-width: 560px;
  }
  .winner {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-color: color-mix(in srgb, var(--wc) 55%, transparent);
    animation: pop-in var(--dur) var(--ease-out);
  }
  .w-title { display: flex; align-items: center; gap: 10px; font-size: 1.05rem; flex-wrap: wrap; }
  .w-dot {
    width: 34px; height: 34px; border-radius: 50%;
    background: var(--wc); color: #1a101d;
    display: inline-flex; align-items: center; justify-content: center; font-weight: 800;
  }
  .tcount { margin-left: auto; background: rgba(0, 0, 0, 0.4); border-radius: var(--r-pill); padding: 2px 10px; font-variant-numeric: tabular-nums; }
  .w-form { display: flex; gap: 10px; }
  .w-form input {
    flex: 1; min-width: 0;
    background: var(--ink-2);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: var(--text);
    border-radius: var(--r-pill);
    padding: 14px 18px;
    font-size: 1.05rem;
  }
  .w-form input.shake { animation: shake 0.4s; border-color: var(--err); }
  .hint { color: var(--text-mut); font-size: 0.8rem; margin: 0; }
  .hint.err { color: var(--err); }
  .zones { display: grid; grid-template-columns: repeat(var(--zcols, 2), 1fr); grid-template-rows: repeat(var(--zrows, 1), 1fr); align-content: stretch; gap: 12px; flex: 1; min-height: 0; }
  .zones.dimmed .zone:not(.won) { opacity: 0.55; }
  .zone {
    position: relative;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
    padding: clamp(10px, 2.2vmin, 26px) 12px;
    min-height: 0;
    border-radius: 22px;
    border: 2px solid color-mix(in srgb, var(--zc) 60%, transparent);
    background:
      radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--zc) 22%, transparent), transparent 65%),
      var(--card);
    touch-action: none;
    transition: transform var(--dur-fast) var(--ease-spring), opacity var(--dur-fast), filter var(--dur);
  }
  .zone:not(.locked):active { transform: scale(0.94); }
  .zone.locked { filter: grayscale(0.9); opacity: 0.5; border-color: rgba(255, 255, 255, 0.12); }
  .zone.flash { animation: shake 0.4s; }
  @keyframes shake {
    20% { transform: translateX(-5px); }
    40% { transform: translateX(5px); }
    60% { transform: translateX(-3px); }
    80% { transform: translateX(3px); }
  }
  .z-dot {
    width: clamp(40px, 7vmin, 52px); height: clamp(40px, 7vmin, 52px);
    border-radius: 50%;
    background: var(--zc); color: #1a101d;
    display: inline-flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: clamp(0.9rem, 2.4vmin, 1.1rem);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    flex: none;
  }
  .z-name { font-weight: 700; font-size: 1.02rem; }
  .z-badge { font-size: 0.8rem; font-weight: 800; color: var(--text-mut); }
  .tap-card {
    background: var(--card-hi);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--r-card);
    padding: 20px;
    font-size: 1.1rem;
    font-weight: 700;
  }
  .error-card { display: flex; flex-direction: column; gap: 12px; font-size: 1rem; }
  .error-card p { margin: 0; }
  .err-actions { display: flex; gap: 10px; flex-wrap: wrap; }
</style>
