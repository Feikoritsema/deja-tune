<script lang="ts">
  // Champion podium: winner + confetti + rematch/menu.
  import { onMount } from 'svelte';
  import { store, rematch } from '../lib/store.svelte';
  import { gameStore } from '../lib/services/storage';
  import { audio } from '../lib/services/audio';
  import { takeSfx, initials } from '../lib/services/ui';
  import Confetti from './Confetti.svelte';

  let { } = $props();

  const eng = $derived(store.engine);
  const winner = $derived(eng?.game.winnerId ? eng?.playerStateById(eng.game.winnerId) : undefined);
  const solo = $derived(eng?.game.settings.solo ?? false);
  const par = $derived(eng?.game.settings.soloParRounds ?? 12);
  const target = $derived(eng?.game.settings.targetScore ?? 10);
  const rounds = $derived(eng?.game.rounds.length ?? 0);
  const score = $derived(winner?.score ?? 0);

  onMount(() => {
    void audio.stop();
    void audio.sfx('fanfare');
    gameStore.clear(); // finished — no resume card for this one
    const t = setTimeout(() => takeSfx('chime'), 900);
    return () => clearTimeout(t);
  });

  async function doRematch(): Promise<void> {
    takeSfx('whoosh');
    await rematch();
  }

  function goMenu(): void {
    takeSfx('chime');
    store.engine = null;
    store.screen = 'home';
    store.rev++;
  }
</script>

<div class="champ" data-testid="champion" style={winner ? `--wc:${winner.player.color}` : ''}>
  <Confetti burst={solo ? 140 : 200} />
  <h1 class="h1">{solo ? (score >= target ? 'Par knocked!' : 'Session done') : 'Champion!'}</h1>
  {#if winner}
    <div class="podium rich-card">
      <span class="big">{initials(winner.player.name)}</span>
      <span class="nm font-display">{winner.player.name}</span>
      {#if solo}
        <p class="sub">
          {score} points in {rounds} round{rounds === 1 ? '' : 's'} · par {par} round{par === 1 ? '' : 's'}
        </p>
      {:else}
        <p class="sub">…and the table shall remember.</p>
      {/if}
      <p class="score tnum">{score}</p>
    </div>
  {/if}

  <div class="actions">
    <button class="pill pill--cta" onclick={doRematch} data-testid="rematch" disabled={store.loading}>
      {store.loading ? 'Loading…' : '⟳ Rematch'}
    </button>
    <button class="pill" onclick={goMenu}>Menu</button>
  </div>
  {#if store.loadError}
    <p class="err" role="alert">{store.loadError}</p>
  {/if}
</div>

<style>
  .champ {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    text-align: center;
    width: 100%;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px;
  }
  .podium {
    padding: 28px 34px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-width: min(320px, 82vw);
    border-color: color-mix(in srgb, var(--wc) 60%, transparent);
    box-shadow: 0 0 60px color-mix(in srgb, var(--wc) 30%, transparent);
    animation: pop-in calc(var(--dur) * 1.5) var(--ease-spring);
  }
  .big {
    width: 108px;
    height: 108px;
    border-radius: 34px;
    background: var(--wc);
    color: #1a101d;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 2.2rem;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.45);
  }
  .nm {
    font-size: 2rem;
  }
  .score {
    font-size: 2.6rem;
    font-weight: 800;
    color: var(--amber);
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .err { color: var(--err); font-size: 0.9rem; }
</style>