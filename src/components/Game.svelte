<script lang="ts">
  // Game controller: reads engine view and mounts the matching board.
  // Layout contract: the game is a fixed 100dvh shell — Rail on top, one board
  // filling the rest. Boards stretch (flex:1, min-height:0) and own any internal
  // scrolling, so the page itself never scrolls on iPad.
  import { store } from '../lib/store.svelte';
  import Rail from './Rail.svelte';
  import TimelineBoard from './TimelineBoard.svelte';
import CardsBoard from './CardsBoard.svelte';
  import BuzzBoard from './BuzzBoard.svelte';
  import RaceBoard from './RaceBoard.svelte';
  import VoteBoard from './VoteBoard.svelte';
  import HowToPlay from './HowToPlay.svelte';
  import { isHowtoDismissed, dismissHowto, reopenHowto } from '../lib/services/howto';
  import Reveal from './Reveal.svelte';
  import Scoreboard from './Scoreboard.svelte';
  import Champion from './Champion.svelte';

  let { } = $props();

  const eng = $derived(store.engine);
  // consume store.rev so every engine event re-renders here, then read the real view
  const view = $derived<string>(eng ? (void store.rev, eng.view) : 'lobby');
  const gameMode = $derived(eng?.game.mode ?? 'timeline');
  const roundSeq = $derived((void store.rev, eng?.currentRound?.seq ?? 0));

  // Round-1 rules sheet: shows once per game unless dismissed for the mode.
  // Overlay by design — it floats above the board and never pushes layout.
  let howtoGameKey = $state('');
  let howtoOpen = $state(false);
  $effect(() => {
    const e = eng;
    void store.rev;
    const key = e ? `${e.game.id}:${e.game.mode}` : '';
    if (key && key !== howtoGameKey) {
      howtoGameKey = key;
      howtoOpen = e?.view === 'answer' && (e?.currentRound?.seq ?? 0) === 0 && !isHowtoDismissed(e?.game.mode ?? 'timeline');
    }
    if (e && (e.currentRound?.seq ?? 0) > 0 && howtoOpen) howtoOpen = false;
  });
  function closeHowto(): void {
    if (eng) dismissHowto(eng.game.mode);
    howtoOpen = false;
  }
  function openHowto(): void {
    if (eng) reopenHowto(eng.game.mode);
    howtoOpen = true;
  }
</script>

{#if eng}
  <div class="game-shell">
    <Rail />
    <main class="wrap">
      {#if view === 'answer' && roundSeq === 0 && !howtoOpen}
        <button class="pill pill--ghost howto-link" onclick={openHowto} data-testid="howto-reopen">
          ⓘ How to play
        </button>
      {/if}
      {#if view === 'answer'}
        {#if eng.game.mode === 'timeline'}
          <TimelineBoard />
        {:else if eng.game.mode === 'cards'}
          <CardsBoard />
        {:else if eng.game.mode === 'buzz'}
          <BuzzBoard />
        {:else if eng.game.mode === 'race'}
          <RaceBoard />
        {:else}
          <VoteBoard />
        {/if}
      {:else if view === 'reveal'}
        <Reveal />
      {:else if view === 'scoreboard'}
        <Scoreboard />
      {:else if view === 'champion'}
        <Champion />
      {/if}
    </main>
    {#if view === 'answer' && roundSeq === 0}
      {#if howtoOpen}
        <div class="howto-sheet" role="dialog" aria-label="How to play">
          <HowToPlay mode={gameMode} onclose={closeHowto} />
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .game-shell {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 10px clamp(8px, 3vw, 40px) calc(var(--safe-b) + 12px);
    width: 100%;
    max-width: 1080px;
    margin: 0 auto;
    overflow: hidden;
  }
  .howto-link {
    align-self: flex-start;
    flex: none;
    font-size: 0.8rem;
    padding: 8px 16px;
  }
  .howto-sheet {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 35;
    display: flex;
    justify-content: center;
    padding: 12px clamp(8px, 3vw, 40px) calc(var(--safe-b) + 12px);
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.55));
    pointer-events: none;
  }
  .howto-sheet > :global(*) {
    pointer-events: auto;
    width: 100%;
    max-width: 720px;
    max-height: 46dvh;
    overflow-y: auto;
  }
</style>
