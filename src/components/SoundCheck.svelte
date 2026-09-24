<script lang="ts">
  import { audio } from '../lib/services/audio';
  import { resolvePreviewUrl } from '../lib/services/deezer';
  import { store, skipCurrent } from '../lib/store.svelte';
  import { takeSfx } from '../lib/services/ui';

  let { } = $props();

  let unlocked = $state(false);
  let checking = $state(false);
  let unlockError = $state<string | null>(null);
  let songState = $state<'idle' | 'checking' | 'ok' | 'fail'>('idle');
  let songDetail = $state<string | null>(null);

  async function tap(): Promise<void> {
    checking = true;
    unlockError = null;
    try {
      await audio.unlock();
      unlocked = true;
      if (store.audioOn) void audio.sfx('chime');
      void checkSong();
    } catch {
      unlockError = 'Sound is still blocked — tap again or Skip sound check.';
    } finally {
      checking = false;
    }
  }

  async function checkSong(): Promise<void> {
    const tracks = store.engine?.currentRound?.tracks ?? [];
    if (tracks.length === 0) {
      songState = 'fail';
      songDetail = 'No song in the pool for this round.';
      return;
    }
    songState = 'checking';
    songDetail = null;
    try {
      for (const t of tracks) {
        await resolvePreviewUrl(t, { demo: store.demo });
      }
      songState = 'ok';
      songDetail = tracks.length > 1 ? 'Both clips ready.' : 'Song ready.';
    } catch {
      songState = 'fail';
      songDetail = 'First song failed to load — hold Skip to draw the next one, or continue anyway.';
    }
  }

  async function skipAndRecheck(): Promise<void> {
    await skipCurrent();
    void checkSong();
  }

  function go(): void {
    takeSfx('chime');
    store.screen = 'game';
  }
</script>

<div class="screen soundcheck">
  <h1 class="h1">One tap for sound{store.demo ? ' (demo)' : ''}</h1>
  <p class="sub">Tap the button so the iPad is allowed to play music. Your ears are about to be tested.</p>

  <button
    class="dial"
    class:done={unlocked}
    class:busy={checking}
    onclick={tap}
    aria-label="Sound check"
    data-testid="soundcheck"
  >
    <span class="glyph">{unlocked ? '♪' : checking ? '…' : '🔊'}</span>
  </button>

  {#if unlockError}
    <p class="err" role="alert">{unlockError}</p>
  {/if}
  {#if unlocked}
    <div class="confirm pop-in">
      <p class="ok">You can hear me. Let’s go.</p>
      {#if songState === 'checking'}
        <p class="mut">Checking the first song…</p>
      {:else if songState === 'ok'}
        <p class="ok small">{songDetail}</p>
      {:else if songState === 'fail'}
        <p class="err" role="alert">{songDetail}</p>
        <button class="pill pill--ghost" onclick={skipAndRecheck}>Draw next song</button>
      {:else}
        <button class="pill pill--ghost" onclick={checkSong}>Check first song</button>
      {/if}
      <button class="pill pill--cta" onclick={go} data-testid="go">Start the game →</button>
    </div>
  {/if}

  <button
    class="pill pill--ghost skip"
    onclick={go}
    style={unlocked ? 'visibility:hidden' : ''}
  >Skip sound check</button>
</div>

<style>
  .soundcheck {
    justify-content: center;
    text-align: center;
    gap: 10px;
  }
  .dial {
    width: 180px;
    height: 180px;
    border-radius: 50%;
    border: none;
    background: var(--card);
    border: 3px solid rgba(255, 255, 255, 0.16);
    margin: 20px 0;
    transition: transform var(--dur-fast) var(--ease-spring), border-color var(--dur);
    touch-action: manipulation;
  }
  .dial:active {
    transform: scale(0.94);
  }
  .dial.done {
    border-color: var(--mint);
    box-shadow: 0 0 40px rgba(92, 214, 139, 0.35);
  }
  /* confirm block: transparent, no card/glow — it must melt into the page bg */
  .confirm {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    background: transparent;
    border: none;
    box-shadow: none;
    margin-top: 6px;
  }
  .busy {
    animation: pulse 0.9s infinite;
  }
  @keyframes pulse {
    50% {
      transform: scale(0.96);
    }
  }
  .glyph {
    font-size: 3.4rem;
  }
  .ok {
    color: var(--mint);
    font-weight: 700;
  }
  .ok.small {
    font-size: 0.9rem;
  }
  .mut {
    color: var(--text-mut);
  }
  .err { color: var(--err); font-size: 0.9rem; }
  .skip {
    margin-top: 26px;
  }
</style>
