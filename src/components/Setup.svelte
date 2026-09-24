<script lang="ts">
  import { store, startGame } from '../lib/store.svelte';
  import { lastPlayersStore } from '../lib/services/storage';
  import { CATEGORIES } from '../lib/services/registry';
  import { BUZZ_PRESETS } from '../lib/core/settings';
  import { isHowtoDismissed, dismissHowto, reopenHowto } from '../lib/services/howto';
  import HowToPlay from './HowToPlay.svelte';
  import { fade } from 'svelte/transition';
  import type { Category, Mode, Strictness } from '../lib/core/types';
  import { takeSfx } from '../lib/services/ui';

  let { } = $props();

  const MODES: Array<{ key: Mode; label: string; desc: string; icon: string; grad: string }> = [
    { key: 'timeline', label: 'Timeline', desc: 'Place each song on the year ruler. Closest guess wins the crown.', icon: '📈', grad: 'linear-gradient(135deg,#FF7A59,#FFB020)' },
    { key: 'buzz', label: 'Buzz!', desc: 'Beat everyone to the button. Name the song. Dodge the −1.', icon: '🔔', grad: 'linear-gradient(135deg,#FF5D8F,#A475FF)' },
    { key: 'race', label: 'Opening Bars', desc: 'Clip grows 0.7s → 12s. Buzz early for max points.', icon: '🏁', grad: 'linear-gradient(135deg,#FFB020,#FF5D8F)' },
    { key: 'first', label: 'Which came first?', desc: 'Two clips, one question: which one is older?', icon: '🍑', grad: 'linear-gradient(135deg,#4DA6FF,#2ED3B6)' },
    { key: 'cards', label: 'Timeline Cards', desc: 'Build your own board: slot each mystery song into your timeline. First to 10 cards.', icon: '🃏', grad: 'linear-gradient(135deg,#5CD68B,#4DA6FF)' }
  ];

  let mode = $state<Mode>(store.settings.mode);
  let cats = $state<Category[]>([...store.settings.categories]);
  let names = $state<string[]>(lastPlayersStore.load().length ? lastPlayersStore.load() : ['Player 1', 'Player 2']);
  let stashedNames = $state<string[]>([]);
  let target = $state(store.settings.targetScore);
  let cards = $state(store.settings.targetCards);
  let solo = $state(store.settings.solo);
  let adv = $state(false);
  let nameInput = $state('');
  let nameErr = $state('');

  let listens = $state(store.settings.listenLoops);
  let perPlayerTimer = $state(store.settings.perPlayerTimer);
  let strictness = $state<Strictness>(store.settings.strictness);
  let yearMin = $state(store.settings.yearMin);
  let yearMax = $state(store.settings.yearMax);
  let frDays = $state(store.settings.freshnessDays);
  let frCount = $state(store.settings.freshnessCount);
  let hideGuesses = $state(store.settings.hideGuesses);
  let allowNegative = $state(store.settings.allowNegative);
  let mercyBands = $state(store.settings.mercyBands);
  let buzzPreset = $state(store.settings.buzzScoring.preset);
  let bBoth = $state(store.settings.buzzScoring.rightBoth);
  let bTitle = $state(store.settings.buzzScoring.rightTitle);
  let bArtist = $state(store.settings.buzzScoring.rightArtist);
  let bWrong = $state(store.settings.buzzScoring.wrong);
  let bFloor = $state(store.settings.buzzScoring.floor);

  const playerLimit = $derived(solo ? 1 : 8);
  const minPlayers = $derived(solo ? 1 : 2);
  const canStart = $derived(cats.length > 0 && names.length >= minPlayers && names.length <= playerLimit && !store.loading);

  // How-to-play card for the selected mode (dismiss persists per mode).
  let howtoOpen = $state(false);
  $effect(() => {
    howtoOpen = !isHowtoDismissed(mode);
    void mode;
  });
  function closeHowto(): void {
    dismissHowto(mode);
    howtoOpen = false;
  }
  function openHowto(): void {
    reopenHowto(mode);
    howtoOpen = true;
  }

  function toggleCat(c: Category): void {
    takeSfx('vote');
    if (cats.includes(c)) {
      if (cats.length > 1) cats = cats.filter((x) => x !== c);
    } else {
      cats = [...cats, c];
    }
  }

  function addName(): void {
    const n = nameInput.trim().slice(0, 16).replace(/[\u0000-\u001F\u007F]/g, '');
    if (!n) return;
    if (names.some((x) => x.toLowerCase() === n.toLowerCase())) {
      nameErr = 'That name is already at the table.';
      return;
    }
    if (names.length >= 8) {
      nameErr = 'Max 8 players.';
      return;
    }
    names = [...names, n];
    nameInput = '';
    nameErr = '';
  }

  function removeName(i: number): void {
    names = names.filter((_, k) => k !== i);
  }

  function pickTarget(t: number): void {
    takeSfx('vote');
    target = t;
  }

  function pickCards(t: number): void {
    takeSfx('vote');
    cards = t;
  }

  function setSolo(on: boolean): void {
    takeSfx('vote');
    if (on) {
      stashedNames = [...names];
      names = names.slice(0, 1);
    } else if (stashedNames.length >= 2) {
      names = [...stashedNames];
      stashedNames = [];
    } else if (names.length < 2) {
      names = [...names, 'Player 2'];
    }
    solo = on;
  }

  function onPresetChange(): void {
    if (buzzPreset !== 'custom') {
      const p = BUZZ_PRESETS[buzzPreset] ?? BUZZ_PRESETS.standard!;
      bBoth = p.rightBoth;
      bTitle = p.rightTitle;
      bArtist = p.rightArtist;
      bWrong = p.wrong;
      bFloor = p.floor;
    }
    takeSfx('vote');
  }

  async function start(): Promise<void> {
    if (!canStart) return;
    takeSfx('lock');
    const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v) || lo));
    const settings = { ...store.settings };
    settings.mode = mode;
    settings.categories = [...cats]; // plain array — $state proxies break structuredClone
    settings.targetScore = clampNum(target, 3, 50);
    settings.targetCards = clampNum(cards, 2, 20);
    settings.solo = solo;
    settings.listenLoops = clampNum(listens, 1, 9);
    settings.perPlayerTimer = perPlayerTimer;
    settings.strictness = strictness;
    settings.yearMin = clampNum(Math.min(yearMin, yearMax), 1900, 2027);
    settings.yearMax = clampNum(Math.max(yearMin, yearMax), 1900, 2027);
    settings.freshnessDays = clampNum(frDays, 1, 30);
    settings.freshnessCount = clampNum(frCount, 5, 200);
    settings.hideGuesses = hideGuesses;
    settings.allowNegative = allowNegative;
    settings.mercyBands = mercyBands;
    settings.buzzScoring = {
      preset: buzzPreset,
      rightBoth: clampNum(bBoth, 0, 10),
      rightTitle: clampNum(bTitle, 0, 10),
      rightArtist: clampNum(bArtist, 0, 10),
      wrong: clampNum(bWrong, -10, 0),
      floor: clampNum(Math.min(bFloor, bWrong), -20, 0)
    };
    await startGame(names.map((n) => n.trim().slice(0, 16) || 'Player'), settings);
  }

  function goBack(): void {
    takeSfx('chime');
    store.screen = 'home';
  }
</script>

<div class="screen screen--wide setup">
  <div class="head">
    <button class="pill pill--ghost" onclick={goBack}>←</button>
    <h1 class="h1">{solo ? 'Solo practice' : 'Set up the game'}</h1>
    <div style="width:64px"></div>
  </div>

  <section class="seg">
    <p class="lab">Mode</p>
    <div class="mode-grid">
      {#each MODES as m (m.key)}
        <button
          class="mode card"
          class:sel={mode === m.key}
          onclick={() => { mode = m.key; takeSfx('vote'); }}
          style={`--mg:${m.grad}`}
          data-testid={`mode-${m.key}`}
        >
          <span class="m-icon">{m.icon}</span>
          <span class="m-label font-display">{m.label}</span>
          <span class="m-desc">{m.desc}</span>
        </button>
      {/each}
    </div>
    {#if howtoOpen}
      <HowToPlay mode={mode} onclose={closeHowto} />
    {:else}
      <button class="pill pill--ghost howto-link" onclick={openHowto} data-testid="howto-reopen">
        ⓘ How to play: {mode}
      </button>
    {/if}
  </section>

  <section class="seg">
    <p class="lab">Categories</p>
    <div class="chips">
      {#each CATEGORIES as c (c.key)}
        <button
          class="cat-chip"
          class:sel={cats.includes(c.key)}
          style={`--cg:${c.gradient}`}
          onclick={() => toggleCat(c.key)}
          data-testid={`cat-${c.key}`}
        >
          {c.label}
        </button>
      {/each}
    </div>
  </section>

  <section class="seg">
    <p class="lab">
      {solo ? 'You' : 'Players'}
      <span class="mut"> · seats lock in clockwise order</span>
    </p>
    <div class="players">
      {#each names as n, i (n + i)}
        <div class="player-chip">
          <span class="dot" style={`background:${['#A475FF', '#FF5D8F', '#FF7A59', '#FFB020', '#5CD68B', '#2ED3B6', '#4DA6FF', '#E6E15C'][i % 8]}`}></span>
          <span class="nm">{n}</span>
          {#if !solo}
            <button class="x" aria-label={`Remove ${n}`} onclick={() => removeName(i)}>×</button>
          {/if}
        </div>
      {/each}
      {#if names.length < 8 && !solo}
        <div class="add-row">
          <input
            placeholder="Add a player…"
            bind:value={nameInput}
            onkeydown={(e) => e.key === 'Enter' && addName()}
            aria-label="Player name"
            data-testid="player-input"
          />
          <button class="pill" onclick={addName} data-testid="add-player">Add</button>
        </div>
      {/if}
    </div>
    {#if nameErr}
      <p class="err">{nameErr}</p>
    {/if}
    {#if names.length > 6 && !solo}
      <p class="warn">⚠ 7–8 players will be cozy — consider Buzz! or the player timer.</p>
    {/if}

    {#if mode === 'cards'}
      <p class="lab" style="margin-top:16px">Cards on the board · first to</p>
      <div class="targets">
        {#each [6, 10, 14] as t (t)}
          <button class="pill target" class:sel={t === cards} onclick={() => pickCards(t)} data-testid={`cards-${t}`}>{t}</button>
        {/each}
        <button class="pill secho" class:sel={solo} onclick={() => setSolo(!solo)}>Solo 🎯</button>
      </div>
    {:else}
      <p class="lab" style="margin-top:16px">Target score · first to</p>
      <div class="targets">
        {#each [5, 10, 15] as t (t)}
          <button class="pill target" class:sel={t === target} onclick={() => pickTarget(t)}>{t}</button>
        {/each}
        <button class="pill secho" class:sel={solo} onclick={() => setSolo(!solo)}>Solo 🎯</button>
      </div>
    {/if}
  </section>

  <section class="seg">
    <button class="adv-toggle pill pill--ghost" onclick={() => { adv = !adv; takeSfx('vote'); }}>
      {adv ? '▾ Advanced settings' : '▸ Advanced settings'}
    </button>
    {#if adv}
      <div class="adv-panel rich-card">
        <div class="frow">
          <span class="f-lab">Clip loops (Buzz!)</span>
          <div class="stepper">
            <button class="step" onclick={() => (listens = Math.max(1, listens - 1))}>−</button>
            <span class="step-val tnum">{listens}</span>
            <button class="step" onclick={() => (listens = Math.min(9, listens + 1))}>+</button>
          </div>
        </div>
        <div class="frow">
          <span class="f-lab">Per-player timer</span>
          <select bind:value={perPlayerTimer}>
            <option value={0}>Off</option>
            <option value={15}>15 s</option>
            <option value={30}>30 s</option>
          </select>
        </div>
        <div class="frow">
          <span class="f-lab">Answer strictness</span>
          <select bind:value={strictness}>
            <option value="lax">Lax (title or artist)</option>
            <option value="normal">Normal (title required)</option>
            <option value="strict">Strict (title + artist)</option>
          </select>
        </div>
        <div class="frow">
          <span class="f-lab">Year window</span>
          <div class="numrow">
            <input type="number" min={1900} max={2026} bind:value={yearMin} />
            –
            <input type="number" min={1900} max={2027} bind:value={yearMax} />
          </div>
        </div>
        <div class="frow">
          <span class="f-lab">Freshness (days / songs)</span>
          <div class="numrow">
            <input type="number" min={1} max={30} bind:value={frDays} />
            <input type="number" min={10} max={200} bind:value={frCount} />
          </div>
        </div>
        <div class="frow">
          <span class="f-lab">Buzz scoring</span>
          <select bind:value={buzzPreset} onchange={onPresetChange}>
            <option value="standard">Standard (+5/+4/+3, wrong −1)</option>
            <option value="gentle">Gentle (no negative)</option>
            <option value="cutthroat">Cutthroat (bigger swings)</option>
            <option value="custom">Custom…</option>
          </select>
        </div>
        {#if buzzPreset === 'custom'}
          <div class="frow">
            <span class="f-lab">Custom points</span>
            <div class="numrow">
              <label>both <input type="number" bind:value={bBoth} /></label>
              <label>title <input type="number" bind:value={bTitle} /></label>
              <label>artist <input type="number" bind:value={bArtist} /></label>
              <label>wrong <input type="number" bind:value={bWrong} /></label>
              <label>floor <input type="number" bind:value={bFloor} /></label>
            </div>
          </div>
        {/if}
        <div class="toggles">
          <label><input type="checkbox" bind:checked={hideGuesses} /> Hide pins until reveal</label>
          <label><input type="checkbox" bind:checked={allowNegative} /> Allow negative buzz scores</label>
          <label><input type="checkbox" bind:checked={mercyBands} /> Coarser bands (easier)</label>
        </div>
      </div>
    {/if}
  </section>

  {#if store.loading}
    <div class="skel-row" aria-hidden="true" transition:fade={{ duration: 200 }}>
      <div class="skel" style="height:56px"></div>
      <div class="skel" style="height:88px"></div>
    </div>
    <div class="loading" transition:fade={{ duration: 200 }}>Loading the song pool…</div>
  {:else}
    <button class="pill pill--cta start" disabled={!canStart} onclick={start} data-testid="start-game" transition:fade={{ duration: 200 }}>
      {solo ? 'Start practice' : 'Start the party'} →
    </button>
  {/if}
  {#if store.loadError}
    <p class="err">{store.loadError}</p>
  {/if}
</div>

<style>
  .setup {
    align-items: stretch;
    gap: 18px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .head .h1 {
    margin: 0;
  }
  .seg {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .lab {
    font-weight: 700;
    color: var(--text-mut);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.8rem;
  }
  .mode-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }
  .howto-link {
    align-self: flex-start;
    font-size: 0.85rem;
  }
  .mode {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 16px;
    text-align: left;
    border: 2px solid transparent;
    transition: border-color var(--dur), transform var(--dur-fast) var(--ease-spring);
    touch-action: manipulation;
  }
  .mode.sel {
    border-color: var(--coral);
    background: var(--card-hi);
    transform: translateY(-2px);
  }
  .m-icon {
    font-size: 1.6rem;
    font-style: normal;
  }
  .m-label {
    font-size: 1.15rem;
  }
  .m-desc {
    color: var(--text-mut);
    font-size: 0.85rem;
    line-height: 1.35;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .cat-chip {
    border: 2px solid rgba(255, 255, 255, 0.14);
    background: var(--card);
    border-radius: var(--r-pill);
    padding: 12px 22px;
    font-weight: 800;
    font-size: 1.05rem;
    transition: background var(--dur-fast), border-color var(--dur-fast), transform var(--dur-fast) var(--ease-spring);
    touch-action: manipulation;
  }
  .cat-chip.sel {
    background: var(--cg);
    border-color: transparent;
    color: #1a101d;
  }
  .cat-chip:active {
    transform: scale(0.95);
  }
  .players {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .player-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--card);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--r-pill);
    padding: 6px 12px 6px 6px;
    font-weight: 700;
  }
  .dot {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    flex: none;
  }
  .x {
    background: none;
    border: none;
    color: var(--text-mut);
    font-size: 1.1rem;
    padding: 0 2px;
  }
  .add-row {
    display: flex;
    gap: 8px;
  }
  .add-row input {
    background: var(--card);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: var(--text);
    border-radius: var(--r-pill);
    padding: 12px 16px;
    font-size: 1rem;
    min-width: 0;
    width: 220px;
  }
  .err {
    color: var(--err);
    font-size: 0.85rem;
    margin: 2px 0 0;
  }
  .warn {
    color: var(--amber);
    font-size: 0.85rem;
    margin: 2px 0 0;
  }
  .targets {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
  }
  .target.sel {
    background: var(--amber);
    color: #1a101d;
  }
  .secho.sel {
    background: var(--mint);
    color: #07110a;
  }
  .adv-panel {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .frow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .f-lab {
    color: var(--text);
    font-weight: 600;
  }
  select,
  input[type='number'] {
    appearance: none;
    -webkit-appearance: none;
    background: var(--ink-2);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: var(--text);
    border-radius: var(--r-pill);
    padding: 10px 14px;
    font-size: 0.95rem;
    font-weight: 600;
    touch-action: manipulation;
  }
  select {
    padding-right: 36px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23a79bb5' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
    max-width: 100%;
  }
  select:focus-visible,
  input[type='number']:focus-visible {
    outline: 2px solid var(--coral);
    outline-offset: 1px;
    border-color: transparent;
  }
  input[type='number'] {
    width: 92px;
  }
  input[type='number']::-webkit-outer-spin-button,
  input[type='number']::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type='number'] {
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .numrow {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .numrow label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85rem;
    color: var(--text-mut);
  }
  .toggles {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 0.95rem;
  }
  .toggles label {
    display: flex;
    gap: 12px;
    align-items: center;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }
  .toggles input[type='checkbox'] {
    appearance: none;
    -webkit-appearance: none;
    flex: none;
    width: 46px;
    height: 27px;
    border-radius: var(--r-pill);
    background: var(--ink-2);
    border: 1px solid rgba(255, 255, 255, 0.2);
    position: relative;
    transition: background var(--dur-fast), border-color var(--dur-fast);
    margin: 0;
  }
  .toggles input[type='checkbox']::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 21px;
    height: 21px;
    border-radius: 50%;
    background: var(--text-mut);
    transition: transform var(--dur-fast) var(--ease-spring), background var(--dur-fast);
  }
  .toggles input[type='checkbox']:checked {
    background: color-mix(in srgb, var(--mint) 35%, var(--ink-2));
    border-color: var(--mint);
  }
  .toggles input[type='checkbox']:checked::after {
    transform: translateX(19px);
    background: var(--mint);
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .step {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: var(--ink-2);
    font-size: 1.1rem;
    line-height: 1;
  }
  .step-val {
    min-width: 2ch;
    text-align: center;
    font-weight: 700;
  }
  .start {
    align-self: center;
    font-size: 1.15rem;
    padding: 18px 34px;
  }
  .loading {
    align-self: center;
    color: var(--text-mut);
  }
  .adv-toggle {
    align-self: flex-start;
    font-size: 0.9rem;
  }
  .mut {
    color: var(--text-mut);
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }
</style>