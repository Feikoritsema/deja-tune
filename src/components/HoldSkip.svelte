<script lang="ts">
  // Hold-to-skip: press and hold 400ms to skip. Prevents fat-finger skips on iPad.
  // A quick tap skips nothing — it teaches the gesture instead (the label briefly
  // becomes "hold to skip…"), so the button never looks broken on touch.
  import { onDestroy } from 'svelte';
  import { skipCurrent } from '../lib/store.svelte';
  import { takeSfx } from '../lib/services/ui';

  let { label = '⏭ Skip' }: { label?: string } = $props();

  let holding = $state(false);
  let filling = $state(false);
  let tapHint = $state(false);
  let downAt = 0;
  let holdTimeout: ReturnType<typeof setTimeout> | undefined;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  const HOLD_MS = 400;

  function clear(): void {
    if (holdTimeout) clearTimeout(holdTimeout);
    holdTimeout = undefined;
    holding = false;
    filling = false;
  }

  function teachTap(): void {
    tapHint = true;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => (tapHint = false), 1800);
  }

  function down(): void {
    if (holding) return;
    holding = true;
    filling = true;
    downAt = Date.now();
    takeSfx('blip');
    holdTimeout = setTimeout(() => {
      void skipCurrent();
      takeSfx('whoosh');
      clear();
    }, HOLD_MS);
  }

  function up(): void {
    // Released before the hold threshold → a plain tap: no skip, one-time hint.
    const wasHolding = holding;
    const elapsed = Date.now() - downAt;
    clear();
    if (wasHolding && elapsed < HOLD_MS) teachTap();
  }

  onDestroy(() => {
    if (hintTimer) clearTimeout(hintTimer);
  });
</script>

<button
  class="pill pill--ghost skip hold"
  style={`--hold-ms:${HOLD_MS}ms`}
  class:holding
  class:filling
  class:hinting={tapHint}
  onpointerdown={down}
  onpointerup={up}
  onpointercancel={clear}
  onpointerleave={clear}
  oncontextmenu={(e) => e.preventDefault()}
  aria-label="Press and hold to skip song"
  title="Press and hold to skip"
  data-testid="skip"
>
  <span class="lbl">{tapHint ? '✋ hold to skip…' : label}</span>
</button>

<style>
  .hold {
    position: relative;
    overflow: visible;
    touch-action: none;
    user-select: none;
  }
  /* keep the label crisp above the fill */
  .lbl {
    position: relative;
    z-index: 1;
  }
  /* progress fill — animated entirely by the compositor (CSS transition over
     the same duration as the hold), so it can't drop frames like JS pumping. */
  .hold::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--amber) 65%, transparent),
      color-mix(in srgb, var(--amber) 35%, transparent)
    );
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--amber) 60%, transparent);
    transform: scaleX(0);
    transform-origin: left;
    will-change: transform;
    pointer-events: none;
  }
  .hold.filling::after {
    transform: scaleX(1);
    transition: transform var(--hold-ms) linear;
  }
  .hold.holding {
    border-color: var(--amber);
    box-shadow: 0 0 18px color-mix(in srgb, var(--amber) 35%, transparent);
  }
  .hold.hinting {
    border-color: var(--amber);
    animation: skip-hint 0.4s var(--ease-out);
  }
  @keyframes skip-hint {
    30% { transform: scale(1.06); }
    100% { transform: none; }
  }
</style>