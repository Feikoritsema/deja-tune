<script lang="ts">
  import { fade } from 'svelte/transition';
  import { store, abandonGame } from './lib/store.svelte';
  import Home from './components/Home.svelte';
  import Setup from './components/Setup.svelte';
  import SoundCheck from './components/SoundCheck.svelte';
  import Game from './components/Game.svelte';

  let { } = $props();

  let crashed = $state<string | null>(null);

  $effect(() => {
    const onErr = (ev: ErrorEvent) => {
      crashed = ev.message || 'Something broke';
    };
    const onRej = (ev: PromiseRejectionEvent) => {
      // Deezer JSONP / audio failures are handled locally per board;
      // only surface truly unhandled crashes.
      const msg = String((ev.reason as Error)?.message ?? ev.reason ?? '');
      if (/deezer|preview|audio|network|fetch/i.test(msg)) return;
      crashed = msg || 'Something broke';
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  });

  function reload(): void {
    location.reload();
  }
  function goHome(): void {
    crashed = null;
    abandonGame();
  }
</script>

<div class="app-bg" aria-hidden="true"></div>
{#if store.offline}
  <div class="offline" role="status" transition:fade={{ duration: 200 }}>Offline — already-loaded songs still work. Skip needs no network.</div>
{/if}
{#if store.toast}
  <div class="toast" role="status" aria-live="polite" transition:fade={{ duration: 180 }}>{store.toast}</div>
{/if}
{#if crashed}
  <div class="screen screen--wide">
    <div class="rich-card crash" role="alert">
      <h1 class="h1">Hiccup on the turntable</h1>
      <p class="sub">The game hit an unexpected error but your progress is saved. Reload to resume where you left off.</p>
      <p class="mut tiny">{crashed}</p>
      <div class="row">
        <button class="pill pill--cta" onclick={reload}>Reload</button>
        <button class="pill pill--ghost" onclick={goHome}>Abandon to menu</button>
      </div>
    </div>
  </div>
{:else}
  {#key store.screen}
    {#if store.screen === 'home'}
      <Home />
    {:else if store.screen === 'setup'}
      <Setup />
    {:else if store.screen === 'soundcheck'}
      <SoundCheck />
    {:else}
      <Game />
    {/if}
  {/key}
{/if}

<style>
  .offline {
    position: sticky;
    top: 0;
    z-index: 55;
    text-align: center;
    background: color-mix(in srgb, var(--amber) 18%, var(--card));
    border-bottom: 1px solid color-mix(in srgb, var(--amber) 45%, transparent);
    color: var(--text);
    font-weight: 700;
    font-size: 0.85rem;
    padding: calc(var(--safe-t) + 8px) 14px;
  }
  .crash {
    padding: 28px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    text-align: center;
    margin-top: 12vh;
  }
  .row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .mut {
    color: var(--text-mut);
  }
  .tiny {
    font-size: 0.75rem;
  }
</style>
