<script lang="ts">
  // Lightweight canvas confetti — palette mirrors the player colors.
  import { onMount } from 'svelte';

  let {
    burst = 120,
    colors = ['#A475FF', '#FF5D8F', '#FF7A59', '#FFB020', '#5CD68B', '#2ED3B6', '#4DA6FF']
  }: { burst?: number; colors?: string[] } = $props();

  let canvas: HTMLCanvasElement;
  let raf = 0;

  interface P {
    x: number;
    y: number;
    vx: number;
    vy: number;
    rot: number;
    vr: number;
    size: number;
    color: string;
    life: number;
    maxLife: number;
  }

  onMount(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    const W = canvas.width;
    const H = canvas.height;
    const count = Math.min(burst, 160);
    const parts: P[] = [];
    for (let i = 0; i < count; i++) {
      const life = 1.8 + Math.random() * 1.2;
      const fromLeft = Math.random() < 0.5;
      parts.push({
        x: fromLeft ? -10 : W + 10,
        y: H * (0.2 + 0.4 * Math.random()),
        vx: (fromLeft ? 1 : -1) * (2 + Math.random() * 5),
        vy: -(4 + Math.random() * 7),
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        size: 5 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)]!,
        life,
        maxLife: life
      });
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        p.vy += 0.35 * dt * 60;
        p.rot += p.vr;
        p.life -= dt;
        if (p.life <= 0 || p.y > H + 20) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, Math.min(1, (p.life / p.maxLife) * 2));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (parts.some((p) => p.life > 0 && p.y <= H + 20)) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  });
</script>

<canvas class="confetti" bind:this={canvas} aria-hidden="true"></canvas>

<style>
  .confetti {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 40;
  }
</style>