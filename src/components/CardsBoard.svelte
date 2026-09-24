<script lang="ts">
  // Timeline Cards: the active player hears one mystery song and slots it into
  // their own board. Judging animates INLINE — no page switches: the card pops
  // into its slot (or shakes out to the discard), a verdict banner names names,
  // and the next mystery flows straight in. Only the winning placement takes
  // the reveal → champion ceremony.
  // The mystery track's title/year must NEVER render before placement.
  import { onMount, onDestroy } from 'svelte';
  import { audio } from '../lib/services/audio';
  import { store, skipCurrent, notifyError, getActivePool } from '../lib/store.svelte';
  import { freshnessStore } from '../lib/services/storage';
  import { windowRecent } from '../lib/core/freshness';
  import { takeSfx, initials } from '../lib/services/ui';
  import HoldSkip from './HoldSkip.svelte';
  import type { PlayerState, Round, Track } from '../lib/core/types';

  let { } = $props();

  // Same snapshot pattern as the other boards: the Engine instance is not
  // Svelte-reactive, so mirror its reads into $state on every engine event.
  let round = $state<Round | null>(null);
  let players = $state<PlayerState[]>([]);
  let mystery = $state<Track | null>(null);
  let activePS = $state<PlayerState | null>(null);
  let boards = $state<Record<string, Track[]>>({});
  let target = $state(10);
  let lastPlacement = $state<{ playerId: string; gap: number; correct: boolean; trackId: string; year: number; seq: number } | null>(null);
  const catMeta = $derived({ pop: 'Pop', rock: 'Rock', guilty: 'Guilty' }[mystery?.category ?? 'pop']);

  $effect(() => {
    void store.rev; // re-snapshot on every engine event
    const e = store.engine;
    const r = e?.currentRound ?? null;
    round = r;
    players = e?.game.players ?? [];
    mystery = r?.tracks[0] ?? null;
    activePS = r?.activeSeat != null ? e?.playerState(r.activeSeat) ?? null : null;
    boards = e?.game.boards ?? {};
    target = e?.game.settings.targetCards ?? 10;
    lastPlacement = e?.game.lastPlacement ?? null;
  });

  const myBoard = $derived(activePS ? (boards[activePS.player.id] ?? []) : []);
  const others = $derived(players.filter((p) => p.player.id !== activePS?.player.id));
  const ownerOf = (pid: string): PlayerState | undefined => players.find((p) => p.player.id === pid);

  // ---------- inline verdict: animate each fresh placement once, then dismiss
  let verdict = $state<typeof lastPlacement>(null);
  let seenSeq = -1;
  let verdictTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const lp = lastPlacement;
    if (lp && lp.seq !== seenSeq) {
      seenSeq = lp.seq;
      verdict = lp;
      takeSfx(lp.correct ? 'lock' : 'wrong');
      if (verdictTimer) clearTimeout(verdictTimer);
      verdictTimer = setTimeout(() => (verdict = null), 2000);
    }
  });
  onDestroy(() => {
    if (verdictTimer) clearTimeout(verdictTimer);
  });

  function shortTitle(t: string): string {
    const s = t.trim();
    return s.length > 20 ? `${s.slice(0, 19)}…` : s;
  }

  // ---------- clip: loop the mystery song; restart when the round changes
  let clipKey = '';
  let unmounted = false;
  let tapToPlay = $state(false);
  let previewError = $state<string | null>(null);
  let placing = $state(false);

  async function startClip(): Promise<void> {
    const t = mystery;
    if (!t) return;
    tapToPlay = false;
    previewError = null;
    audio.onended = () => {
      if (unmounted) return;
      if (store.engine?.currentRound?.phase === 'answer') {
        void audio.playTrack(t, { demo: store.demo }).catch(() => {
          tapToPlay = true;
          previewError = 'Preview stopped — retry or skip.';
        });
      }
    };
    audio.onerror = () => {
      if (unmounted) return;
      tapToPlay = true;
      previewError = 'Preview failed to load.';
    };
    try {
      await audio.playTrack(t, { demo: store.demo });
    } catch {
      tapToPlay = true;
      previewError = 'Couldn’t load preview.';
    }
  }

  onMount(() => () => {
    unmounted = true;
    audio.onended = null;
    audio.onerror = null;
    audio.stop();
  });
  onDestroy(() => {
    unmounted = true;
    audio.onended = null;
    audio.onerror = null;
    audio.stop();
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
    void rev;
  });

  async function place(gap: number): Promise<void> {
    const e = store.engine;
    if (!e || !activePS || round?.phase !== 'answer' || placing) return;
    if (!mystery) {
      notifyError('No mystery song loaded — retry or skip.');
      return;
    }
    placing = true;
    try {
      const all = getActivePool() ?? [];
      if (all.length === 0) throw new Error('pool not loaded');
      const recent = windowRecent(freshnessStore.load(), e.game.settings.freshnessDays, e.game.settings.freshnessCount);
      const correct = e.placeCard(activePS.player.id, gap, all, recent);
      takeSfx(correct ? 'lock' : 'wrong');
      if (navigator.vibrate) navigator.vibrate(correct ? 10 : 30);
    } catch {
      notifyError('Couldn’t place card — check connection and retry.');
    } finally {
      placing = false;
    }
  }
</script>

<div class="cboard" data-testid="cards-board">
  <div class="topline">
    <span class="cat">🃏 {catMeta}</span>
    <span class="goal tnum">first to {target} 🃏</span>
    <HoldSkip label="⏭ Skip song" />
  </div>

  {#if !mystery}
    <div class="tap-card error-card" role="alert">
      <p>No mystery song available — the pool may be empty or offline.</p>
      <div class="err-actions">
        <button class="pill pill--ghost" onclick={() => { void skipCurrent(); takeSfx('whoosh'); }}>⏭ Skip song</button>
      </div>
    </div>
  {:else if tapToPlay}
    <div class="tap-card error-card">
      <p>{previewError ?? 'Couldn’t load preview.'}</p>
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
        <span>— hear it, then slot it in</span>
        <span class="have tnum">{myBoard.length}/{target}</span>
      </div>
    {/key}

    {#if verdict}
      {@const owner = ownerOf(verdict.playerId)}
      {@const isMine = verdict.playerId === activePS?.player.id}
      <div
        class="verdict verdict-in"
        class:good={verdict.correct}
        class:bad={!verdict.correct}
        style={owner ? `--vc:${owner.player.color}` : ''}
        data-testid="verdict"
      >
        {#if verdict.correct}
          <span>✅ <strong>{owner?.player.name ?? 'Someone'}</strong> slotted it in!{isMine ? '' : ` Next: ${activePS?.player.name ?? ''}`}</span>
        {:else}
          <span>❌ <strong>{owner?.player.name ?? 'Someone'}</strong> missed — discarded.{isMine ? '' : ` Next: ${activePS?.player.name ?? ''}`}</span>
        {/if}
      </div>
    {/if}

    <div class="mystery rich-card" data-testid="mystery-card">
      <div class="qmark" aria-hidden="true">?</div>
      <div class="mmeta">
        <p class="mtitle font-display">Mystery song</p>
        <p class="msub">{catMeta} · year hidden until you place it</p>
      </div>
      <button class="pill listen" onclick={startClip}>↻ replay</button>
    </div>

    <div class="boardlane" class:shake={verdict && !verdict.correct} data-testid={`board-${activePS.player.seat}`}>
      {#each myBoard as c, i (c.id)}
        <button class="gap" onclick={() => place(i)} aria-label={`Place before ${c.title}`} data-testid={`gap-${i}`}>
          <span>+</span>
        </button>
        <div class="card" class:fresh={verdict?.correct && verdict.trackId === c.id}>
          <span class="yr tnum">{c.year}</span>
          <span class="tt">{c.title}</span>
          <span class="aa">{c.artist}</span>
        </div>
      {/each}
      <button class="gap" onclick={() => place(myBoard.length)} aria-label="Place after the last card" data-testid={`gap-${myBoard.length}`}>
        <span>+</span>
      </button>
    </div>
  {:else}
    <div class="turn-banner mut">All turns are in…</div>
  {/if}

  {#if others.length > 0}
    <div class="table" class:many={others.length > 3}>
      {#each others as ps (ps.player.id)}
        {@const b = boards[ps.player.id] ?? []}
        <div class="ministrip" style={`--tc:${ps.player.color}`} data-testid={`ministrip-${ps.player.seat}`} title={b.map((c) => `${c.year} ${c.title}`).join(' · ')}>
          <div class="minihead">
            <span class="dot sm">{initials(ps.player.name)}</span>
            <span class="mname">{ps.player.name}</span>
            <span class="mcount tnum">{b.length}/{target}</span>
          </div>
          <div class="minicards">
            {#each b as c (c.id)}
              <span class="minicard" title={`${c.title} — ${c.artist}`}>
                <span class="myr tnum">{c.year}</span>
                <span class="mtt">{shortTitle(c.title)} · {c.artist}</span>
              </span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cboard {
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
    gap: 10px;
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
  .goal {
    color: var(--text-mut);
    font-weight: 700;
    font-size: 0.9rem;
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
  .dot.sm {
    width: 24px;
    height: 24px;
    font-size: 0.65rem;
  }
  .tname {
    font-family: var(--font-display);
    font-weight: 700;
  }
  .have {
    margin-left: auto;
    background: rgba(0, 0, 0, 0.4);
    border-radius: var(--r-pill);
    padding: 2px 10px;
    font-variant-numeric: tabular-nums;
  }
  .verdict {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 1rem;
    font-weight: 600;
    padding: 12px 18px;
    border-radius: var(--r-card);
    border: 1px solid transparent;
  }
  .verdict.good {
    background: color-mix(in srgb, var(--mint) 13%, transparent);
    border-color: color-mix(in srgb, var(--mint) 45%, transparent);
  }
  .verdict.bad {
    background: color-mix(in srgb, var(--err) 13%, transparent);
    border-color: color-mix(in srgb, var(--err) 45%, transparent);
  }
  .verdict-in {
    animation: verdict-in 0.45s var(--ease-spring);
  }
  @keyframes verdict-in {
    from {
      opacity: 0;
      transform: translateY(-14px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .mystery {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    flex: none;
  }
  .qmark {
    width: 44px;
    height: 44px;
    flex: none;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    font-weight: 800;
    font-family: var(--font-display);
    color: #1a101d;
    background: linear-gradient(135deg, var(--grape), var(--coral));
    animation: q-breathe 2.6s ease-in-out infinite;
  }
  @keyframes q-breathe {
    50% {
      transform: scale(1.05);
    }
  }
  .mmeta {
    min-width: 0;
    flex: 1;
  }
  .mtitle {
    margin: 0;
    font-size: 1.2rem;
  }
  .msub {
    margin: 2px 0 0;
    color: var(--text-mut);
    font-size: 0.85rem;
  }
  .listen {
    flex: none;
  }
  .boardlane {
    display: flex;
    align-items: stretch;
    gap: 6px;
    overflow-x: auto;
    padding: 10px;
    background: var(--card);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--r-card);
    min-height: 118px;
    flex: none;
  }
  .boardlane.shake {
    animation: lane-shake 0.45s var(--ease-out);
    border-color: color-mix(in srgb, var(--err) 55%, transparent);
  }
  @keyframes lane-shake {
    20% { transform: translateX(-9px); }
    45% { transform: translateX(7px); }
    70% { transform: translateX(-4px); }
    100% { transform: none; }
  }
  .card {
    flex: none;
    width: 108px;
    border-radius: 12px;
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
    text-align: center;
    background: linear-gradient(160deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
    border: 1px solid rgba(255, 255, 255, 0.16);
    animation: pop-in var(--dur) var(--ease-out);
  }
  .card.fresh {
    border-color: var(--mint);
    box-shadow: 0 0 22px rgba(92, 214, 139, 0.45);
    animation: card-slot 0.55s var(--ease-spring);
  }
  @keyframes card-slot {
    from {
      opacity: 0;
      transform: translateY(-26px) scale(0.85) rotate(-4deg);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .card .yr {
    font-weight: 800;
    color: var(--amber);
    font-variant-numeric: tabular-nums;
  }
  .card .tt {
    font-weight: 700;
    font-size: 0.72rem;
    line-height: 1.15;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card .aa {
    color: var(--text-mut);
    font-size: 0.65rem;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gap {
    flex: none;
    align-self: stretch;
    width: 34px;
    border-radius: 10px;
    border: 1px dashed rgba(255, 255, 255, 0.25);
    background: transparent;
    color: var(--text-mut);
    font-size: 1.2rem;
    font-weight: 800;
    touch-action: manipulation;
    transition: transform var(--dur-fast) var(--ease-spring), background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast), box-shadow var(--dur-fast);
  }
  .gap:hover {
    border-color: var(--mint);
    color: var(--mint);
    box-shadow: 0 0 14px rgba(92, 214, 139, 0.25);
  }
  .gap:active {
    transform: scale(1.15);
    background: rgba(255, 255, 255, 0.12);
    color: var(--text);
  }
  .table {
    display: flex;
    gap: 8px;
    flex: none;
    min-height: 0;
    overflow-x: auto;
  }
  .table.many {
    flex-wrap: nowrap;
  }
  .table:not(.many) {
    flex-direction: column;
    overflow-x: visible;
  }
  .ministrip {
    background: var(--card);
    border: 1px solid color-mix(in srgb, var(--tc, transparent) 30%, transparent);
    border-radius: var(--r-card);
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: none;
  }
  .table.many .ministrip {
    min-width: 148px;
    max-width: 190px;
  }
  .table.many .mtt {
    display: none;
  }
  .table.many .minicards {
    flex-wrap: nowrap;
    overflow: hidden;
  }
  .minihead {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
  }
  .mname {
    font-family: var(--font-display);
  }
  .mcount {
    margin-left: auto;
    color: var(--text-mut);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  .minicards {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .minicard {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 3px 9px;
    font-size: 0.78rem;
    max-width: 100%;
  }
  .minicard .myr {
    font-weight: 800;
    color: var(--amber);
    font-variant-numeric: tabular-nums;
    flex: none;
  }
  .minicard .mtt {
    color: var(--text-mut);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 22ch;
  }
  .tap-card {
    background: var(--card-hi);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--r-card);
    padding: 22px;
    font-size: 1.15rem;
    font-weight: 700;
  }
</style>
