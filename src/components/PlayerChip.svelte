<script lang="ts">
  import { initials } from '../lib/services/ui';

  let {
    name,
    color,
    score = null,
    active = false,
    leader = false,
    compact = false,
    dense = false,
    icon = null
  }: {
    name: string;
    color: string;
    score?: number | null;
    active?: boolean;
    leader?: boolean;
    compact?: boolean;
    dense?: boolean;
    icon?: string | null;
  } = $props();
</script>

<span
  class="chip"
  class:active
  class:leader
  class:compact
  class:dense
  style={color ? `--pc: ${color}` : ''}
  role="listitem"
>
  <span class="dot">{icon ?? initials(name)}</span>
  {#if !compact}<span class="nm">{name}</span>{/if}
  {#if score != null}<span class="sc tnum" data-testid="score">{score}</span>{/if}
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--card);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--r-pill);
    padding: 6px 12px 6px 6px;
    font-weight: 700;
    transition: border-color var(--dur-fast), box-shadow var(--dur-fast), transform var(--dur-fast);
  }
  .dot {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--pc, var(--grape));
    color: #1a101d;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.78rem;
    font-weight: 800;
    flex: none;
  }
  .nm {
    max-width: 9ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.92rem;
  }
  .sc {
    background: rgba(0, 0, 0, 0.35);
    border-radius: var(--r-pill);
    padding: 2px 9px;
    font-variant-numeric: tabular-nums;
  }
  .active {
    border-color: var(--pc);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--pc) 35%, transparent);
    animation: breathe 1.4s ease-in-out infinite;
  }
  .leader .dot {
    outline: 3px solid var(--amber);
    outline-offset: 1px;
  }
  .leader {
    border-color: color-mix(in srgb, var(--amber) 55%, transparent);
  }
  .compact {
    padding: 4px;
  }
  .compact .nm {
    display: none;
  }
  .dense {
    gap: 6px;
    padding: 3px 9px 3px 3px;
  }
  .dense .dot {
    width: 22px;
    height: 22px;
    font-size: 0.62rem;
  }
  .dense .nm {
    max-width: 7ch;
    font-size: 0.8rem;
  }
  .dense .sc {
    padding: 1px 7px;
    font-size: 0.8rem;
  }
  @keyframes breathe {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }
</style>