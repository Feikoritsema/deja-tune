<script lang="ts">
  import { store, resumeGame, abandonGame } from '../lib/store.svelte';
  import { gameStore, hofStore } from '../lib/services/storage';
  import { takeSfx } from '../lib/services/ui';
  import HallOfFame from './HallOfFame.svelte';

  let { } = $props();

  // localStorage is not reactive — re-read on every store event so actions taken
  // while Home is mounted (e.g. Abandon) update the card instantly, no refresh.
  const resume = $derived((void store.rev, gameStore.load()));
  const hof = $derived((void store.rev, hofStore.load()));

  const modeLabel = $derived(
    ({ timeline: 'Timeline', buzz: 'Buzz!', race: 'Opening Bars', first: 'Which came first?', cards: 'Timeline Cards' } as const)[
      resume?.game.mode ?? 'timeline'
    ]
  );

  let showHof = $state(false);

  function newGame(solo: boolean): void {
    takeSfx('chime');
    store.settings.solo = solo;
    store.screen = 'setup';
  }

  function doResume(): void {
    takeSfx('chime');
    resumeGame();
  }

  function abandon(): void {
    takeSfx('buzz');
    abandonGame();
  }
</script>

{#if showHof}
  <div class="screen screen--wide">
    <div class="row">
      <h1 class="h1">Hall of fame</h1>
      <button class="pill pill--ghost" onclick={() => { showHof = false; takeSfx('chime'); }}>← Back</button>
    </div>
    <HallOfFame />
  </div>
{:else}
  <div class="screen home">
    <div class="brand">
      <div class="logo" aria-hidden="true">
        <span class="disc"><span class="inner"></span></span>
      </div>
      <h1 class="h1 title">Déjà&nbsp;Tune</h1>
      <p class="sub">Guess the song. Place the year. Own the table.</p>
    </div>

    {#if store.loading}
      <div class="skel-row" aria-hidden="true">
        <div class="skel" style="height:60px"></div>
        <div class="skel" style="height:60px"></div>
        <div class="skel" style="height:60px"></div>
      </div>
      <div class="loading">Warming up the turntable…</div>
    {:else}
      <div class="menu">
        <button class="pill pill--cta big" onclick={() => newGame(false)}>
          ▶&nbsp; Party&nbsp;game
        </button>
        <button class="pill big" onclick={() => newGame(true)}>🎯&nbsp; Solo&nbsp;practice</button>
        <button class="pill pill--ghost big" onclick={() => { showHof = true; takeSfx('chime'); }}>
          🏆&nbsp; Hall&nbsp;of&nbsp;fame
        </button>
      </div>
    {/if}

    {#if !store.loading && hof.length > 0 && !resume}
      <p class="hint">…and {hof.length} legendary {hof.length === 1 ? 'game' : 'games'} in the books.</p>
    {/if}

    {#if store.loadError}
      <p class="err" role="alert">{store.loadError}</p>
    {/if}

    {#if resume && !store.loading}
      <div class="resume rich-card pop-in">
        <div class="resume-info">
          <strong class="font-display">A game is in progress</strong>
          <span class="mut">{modeLabel} · {resume.game.rounds.length} round{resume.game.rounds.length === 1 ? '' : 's'} · {resume.game.players.length}p · code {resume.game.code}</span>
        </div>
        <div class="resume-actions">
          <button class="pill pill--cta" onclick={doResume}>Resume</button>
          <button
            class="pill pill--ghost"
            onclick={() => { abandon(); }}
          >Abandon</button>
        </div>
      </div>
    {/if}

    {#if store.demo}
      <p class="mut tiny">● demo mode (local audio)</p>
    {/if}
  </div>
{/if}

<style>
  .home {
    justify-content: center;
    text-align: center;
    gap: 28px;
  }
  .logo {
    width: 92px;
    height: 92px;
    margin: 0 auto 10px;
  }
  .disc {
    display: block;
    width: 92px;
    height: 92px;
    border-radius: 50%;
    background:
      repeating-radial-gradient(circle, #0d0812 0 3px, #1b1226 3px 6px);
    border: 6px solid var(--cta, transparent);
    box-shadow: 0 12px 40px rgba(255, 93, 143, 0.35);
    animation: spin 14s linear infinite;
  }
  .inner {
    position: absolute;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--amber);
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .title {
    letter-spacing: -0.03em;
  }
  .menu {
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: center;
  }
  .big {
    min-width: min(320px, 80vw);
    font-size: 1.15rem;
    padding: 18px 28px;
  }
  .resume {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 22px;
    max-width: min(480px, 90vw);
    align-items: stretch;
  }
  .resume-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .resume-actions {
    display: flex;
    gap: 10px;
  }
  .mut {
    color: var(--text-mut);
  }
  .tiny {
    font-size: 0.72rem;
  }
  .hint {
    color: var(--text-mut);
    font-size: 0.85rem;
  }
  .err {
    color: var(--err);
    font-size: 0.9rem;
    max-width: min(480px, 90vw);
  }
  .loading {
    color: var(--text-mut);
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }
  .disc {
    position: relative;
  }
</style>