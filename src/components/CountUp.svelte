<script lang="ts">
  // Tabular count-up for scores/years. aria-hidden: the final value is announced separately.
  import { onMount } from 'svelte';

  let { value = 0, duration = 600 }: { value?: number; duration?: number } = $props();

  let shown = $state(0);

  onMount(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shown = value;
      return;
    }
    const start = performance.now();
    const from = shown;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      shown = Math.round(from + (value - from) * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
</script>

<span class="tnum" aria-hidden="true">{shown}</span>
<span class="sr-only">{value}</span>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>