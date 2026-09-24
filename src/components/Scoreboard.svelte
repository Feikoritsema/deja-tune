<script lang="ts">
  // Scoreboard between rounds — FLIP reorder feel, leader glow, next round.
  // Layout: fixed shell (title + scrollable rows + sticky action bar) so the
  // Next button can never fall off-screen, even at 8 players in landscape.
  import { flip } from 'svelte/animate';
  import { store, nextRoundAdvance } from '../lib/store.svelte';
  import { takeSfx } from '../lib/services/ui';
  import CountUp from './CountUp.svelte';

  let { } = $props();

  const eng = $derived(store.engine);
  const players = $derived(eng?.game.players.map((p) => ({ ...p })).sort((a, b) => b.score - a.score) ?? []);
  const target = $derived(eng?.game.settings.targetScore ?? 10);
  const isCards = $derived(eng?.game.mode === 'cards');
  const cardsTarget = $derived(eng?.game.settings.targetCards ?? 10);
  const solo = $derived(eng?.game.settings.solo ?? false);
  const dense = $derived(players.length > 6);

  async function next(): Promise<void> {
    takeSfx('whoosh');
    await nextRoundAdvance();
  }

  const leaderScore = $derived(players[0]?.score ?? 0);
</script>

<div class="score" class:dense data-testid="scoreboard">
  <h1 class="h1">{solo ? 'Good round' : 'Standings'}</h1>
  {#if !solo}
    <p class="sub">{isCards ? `First to ${cardsTarget} cards on the board.` : `First to ${target}. Who’s got ears of gold?`}</p>
  {:else}
    <p class="sub">Your ears so far.</p>
  {/if}

  <div class="rows">
    {#each players as ps (ps.player.id)}
      <div class="row rich-card" animate:flip={{ duration: 320 }} class:lead={ps.score === leaderScore && !solo} style={`--rc:${ps.player.color}`}>
        <span class="medal">
          {#if ps.score === leaderScore && !solo}👑{:else}{players.indexOf(ps) + 1}{/if}
        </span>
        <span class="nm">{ps.player.name}</span>
        <span class="bar"><span class="fill" style={`width:${Math.min(100, (ps.score / Math.max(isCards ? cardsTarget : target, 1)) * 100)}%; background:${ps.player.color}`}></span></span>
        <span class="pts tnum">
          <CountUp value={ps.score} duration={520} />
        </span>
      </div>
    {/each}
  </div>

  <div class="actions">
    <button class="pill pill--cta next" onclick={next} data-testid="next-round" disabled={store.loading}>
      {store.loading ? 'Loading…' : 'Next round →'}
    </button>
    {#if store.loadError}
      <p class="err" role="alert">{store.loadError}</p>
    {/if}
  </div>
</div>

<style>
  .score {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
    flex: 1;
    min-height: 0;
  }
  .score .h1 {
    margin: 0;
    font-size: clamp(1.6rem, 4.5vmin, 3rem);
  }
  .score .sub {
    margin: 0;
  }
  .rows {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 2px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    transition: transform var(--dur) var(--ease-spring);
    animation: pop-in var(--dur) var(--ease-out);
    flex: none;
  }
  .dense {
    gap: 8px;
  }
  .dense .h1 {
    font-size: clamp(1.3rem, 3.6vmin, 2rem);
  }
  .dense .sub {
    font-size: 0.85rem;
    margin: 0;
  }
  .dense .rows {
    gap: 6px;
  }
  .dense .row {
    padding: 7px 14px;
    gap: 10px;
  }
  .dense .medal {
    width: 30px;
    height: 30px;
    font-size: 0.85rem;
  }
  .dense .bar {
    height: 8px;
  }
  .dense .pts {
    font-size: 1rem;
  }
  .row.lead {
    border-color: var(--amber);
    box-shadow: 0 0 26px rgba(255, 176, 32, 0.22);
  }
  .medal {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--card-hi);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    flex: none;
  }
  .nm {
    font-weight: 700;
    min-width: 6ch;
  }
  .bar {
    flex: 1;
    height: 12px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.3);
    overflow: hidden;
    min-width: 80px;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 8px;
    transition: width var(--dur) var(--ease-out);
  }
  .pts {
    font-size: 1.25rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    min-width: 3ch;
    text-align: right;
  }
  .actions {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding-top: 2px;
  }
  .next {
    font-size: 1.1rem;
    padding: 14px 30px;
  }
  .dense .next {
    font-size: 1rem;
    padding: 12px 26px;
  }
  .err { color: var(--err); font-size: 0.9rem; margin: 0; }
</style>
