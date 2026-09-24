<script lang="ts">
  // Hold-to-skip: press and hold 400ms to skip. Prevents fat-finger skips on iPad.
  import { skipCurrent } from '../lib/store.svelte';
  import { takeSfx } from '../lib/services/ui';

  let { label = '⏭ Skip' }: { label?: string } = $props();

  let holding = $state(false);
  let progress = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;
  let holdTimeout: ReturnType<typeof setTimeout> | undefined;
  const HOLD_MS = 400;

  function clear(): void {
    if (timer) clearInterval(timer);
    if (holdTimeout) clearTimeout(holdTimeout);
    timer = undefined;
    holdTimeout = undefined;
    holding = false;
    progress = 0;
  }

  function down(): void {
    if (holding) return;
    holding = true;
    progress = 0;
    const t0 = Date.now();
    takeSfx('blip');
    timer = setInterval(() => {
      progress = Math.min(1, (Date.now() - t0) / HOLD_MS);
      if (progress >= 1 && timer) clearInterval(timer);
    }, 16);
    holdTimeout = setTimeout(() => {
      void skipCurrent();
      takeSfx('whoosh');
      clear();
    }, HOLD_MS);
  }
</script>

<button
  class="pill pill--ghost skip hold"
  style={`--p:${progress}`}
  class:holding
  onpointerdown={down}
  onpointerup={clear}
  onpointercancel={clear}
  onpointerleave={clear}
  oncontextmenu={(e) => e.preventDefault()}
  aria-label="Press and hold to skip song"
  title="Press and hold to skip"
>
  {label}
</button>

<style>
  .hold {
    position: relative;
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }
  .hold::after {
    content: '';
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--amber) 30%, transparent);
    transform: scaleX(var(--p, 0));
    transform-origin: left;
    pointer-events: none;
  }
  .hold.holding {
    border-color: var(--amber);
  }
</style>
