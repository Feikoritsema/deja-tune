<script lang="ts">
  import { store, leaveGame } from '../lib/store.svelte';
  import { audio } from '../lib/services/audio';
  import { takeSfx } from '../lib/services/ui';
  import PlayerChip from './PlayerChip.svelte';
  import type { PlayerState } from '../lib/core/types';

  let { } = $props();

  // The Engine is a plain class instance mutated in place (not Svelte-reactive) — `$derived`
  // over it would freeze after the first render. Snapshot mutable bits into $state on each
  // engine event (store.rev); $state assignments always notify.
  const isCards = $derived(store.engine?.game.mode === 'cards');
  const target = $derived(
    isCards ? (store.engine?.game.settings.targetCards ?? 0) : (store.engine?.game.settings.targetScore ?? 0)
  );
  const code = $derived(store.engine?.game.code ?? '');
  const solo = $derived(store.engine?.game.settings.solo ?? false);
  const par = $derived(solo ? store.engine?.game.settings.soloParRounds ?? 0 : 0);
  const modeLabel = $derived(({ timeline: 'Timeline', buzz: 'Buzz!', race: 'Race', first: 'First?', cards: 'Cards' } as const)[store.engine?.game.mode ?? 'timeline']);

  let players = $state<PlayerState[]>([]);
  let roundNo = $state(0);

  $effect(() => {
    void store.rev; // re-snapshot on every engine event
    players = store.engine?.game.players ?? [];
    roundNo = store.engine?.game.rounds.length ?? 0;
  });

  const many = $derived(players.length > 4);

  function toggleSfx(): void {
    store.audioOn = !store.audioOn;
    audio.setMuted(!store.audioOn);
  }
</script>

<header class="rail" class:many>
  <div class="left">
    <span class="code tnum" title="room code">{code}</span>
    <span class="meta">
      {#if solo && par}
        par {players[0]?.score ?? 0}/{target} in {roundNo}/{par}
      {:else}
        {modeLabel} · r{roundNo} · →{target}
      {/if}
    </span>
  </div>
  <div class="chips" role="list">
    {#each players as p (p.player.id)}
      <PlayerChip
        name={p.player.name}
        color={p.player.color}
        score={p.score}
        active={false}
        leader={p.score === Math.max(...players.map((x) => x.score)) && players.length > 1}
        compact={false}
        dense={many}
      />
    {/each}
  </div>
  <div class="actions">
    <button class="menu" onclick={() => { leaveGame(); takeSfx('chime'); }} aria-label="Leave to main menu" title="Main menu (game is kept)">
      🏠
    </button>
    <button class="snd" onclick={toggleSfx} aria-label={store.audioOn ? 'Mute effects' : 'Unmute effects'}>
      {store.audioOn ? '🔊' : '🔇'}
    </button>
  </div>
</header>

<style>
  .rail {
    flex: none;
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: calc(var(--safe-t) + 8px) 12px 8px;
    background: color-mix(in srgb, var(--ink) 82%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-wrap: nowrap;
    animation: rail-in var(--dur) var(--ease-out);
  }
  @keyframes rail-in {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .left {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    flex: none;
  }
  .code {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 0.85rem;
    letter-spacing: 0.12em;
  }
  .meta {
    color: var(--text-mut);
    font-size: 0.68rem;
    white-space: nowrap;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: nowrap;
    overflow-x: auto;
    margin-left: auto;
    min-width: 0;
    padding: 2px;
    scrollbar-width: none;
  }
  .chips::-webkit-scrollbar {
    display: none;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }
  .snd,
  .menu {
    background: none;
    border: none;
    font-size: 1.1rem;
    padding: 6px;
  }
  .menu:active {
    transform: scale(0.9);
  }
</style>
