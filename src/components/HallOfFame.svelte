<script lang="ts">
  // Hall of Fame — local records.
  import { hofStore } from '../lib/services/storage';
  import type { HoFEntry } from '../lib/services/storage';

  let { } = $props();

  let tab = $state<'legends' | 'solo' | 'recent'>('legends');
  const entries = $derived(hofStore.load());

  const legends = $derived(() => {
    const wins = new Map<string, number>();
    for (const e of entries) if (!e.solo) wins.set(e.winnerName, (wins.get(e.winnerName) ?? 0) + 1);
    return [...wins.entries()].sort((a, b) => b[1] - a[1]);
  });

  const solos = $derived(() => entries.filter((e) => e.solo).sort((a, b) => b.score - a.score || a.rounds - b.rounds));

  const recents = $derived(() => [...entries].sort((a, b) => b.date - a.date));

  function fmtDate(ts: number): string {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
</script>

<div class="hof">
  <div class="tabs">
    <button class="tab" class:sel={tab === 'legends'} onclick={() => (tab = 'legends')}>Legends</button>
    <button class="tab" class:sel={tab === 'solo'} onclick={() => (tab = 'solo')}>Solo</button>
    <button class="tab" class:sel={tab === 'recent'} onclick={() => (tab = 'recent')}>Recent</button>
  </div>

  <div class="list">
    {#if tab === 'legends'}
      {#if legends().length === 0}
        <p class="empty">No legends yet. Win one.</p>
      {:else}
        {#each legends() as [name, wins], i (name)}
          <div class="row rich-card" class:top={i === 0}>
            <span class="rank">{i + 1}</span>
            <span class="nm">{name}</span>
            <span class="wins tnum">{wins} {wins === 1 ? 'win' : 'wins'}</span>
          </div>
        {/each}
      {/if}
    {:else if tab === 'solo'}
      {#if solos().length === 0}
        <p class="empty">Practice makes par.</p>
      {:else}
        {#each solos() as e (e.id)}
          <div class="row rich-card">
            <span class="nm">{e.winnerName}</span>
            <span class="wins tnum">{e.score} pts · {e.rounds} rounds</span>
          </div>
        {/each}
      {/if}
    {:else}
      {#if recents().length === 0}
        <p class="empty">Nothing yet — go play.</p>
      {:else}
        {#each recents() as e (e.id)}
          <div class="row rich-card">
            <span class="nm">{e.winnerName} {e.solo ? '🎯' : ''}</span>
            <span class="wins mut">{e.players.length}p · {e.mode} · {fmtDate(e.date)}</span>
          </div>
        {/each}
      {/if}
    {/if}
  </div>
</div>

<style>
  .hof {
    width: 100%;
    max-width: 620px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .tabs {
    display: flex;
    gap: 8px;
  }
  .tab {
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: var(--card);
    border-radius: var(--r-pill);
    padding: 10px 18px;
    font-weight: 700;
  }
  .tab.sel {
    background: var(--cta);
    border-color: transparent;
    color: #fff;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
  }
  .row.top {
    border-color: var(--amber);
  }
  .rank {
    width: 30px;
    font-weight: 800;
    color: var(--text-mut);
  }
  .nm {
    font-weight: 700;
    flex: 1;
  }
  .wins {
    font-weight: 800;
    color: var(--amber);
    font-variant-numeric: tabular-nums;
  }
  .mut {
    color: var(--text-mut);
    font-weight: 500;
  }
  .empty {
    color: var(--text-mut);
    text-align: center;
    padding: 40px 0;
  }
</style>