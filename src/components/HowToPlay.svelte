<script lang="ts">
  // Step-wise how-to-play card, one per game mode. Always dismissible right
  // away (X + primary button, no forced wait), non-modal so it never blocks play.
  import type { Mode } from '../lib/core/types';
  import { takeSfx } from '../lib/services/ui';

  let { mode, onclose }: { mode: Mode; onclose?: () => void } = $props();

  const COPY: Record<Mode, { icon: string; title: string; steps: string[] }> = {
    timeline: {
      icon: '📈',
      title: 'Timeline — how it works',
      steps: [
        'Listen to the clip — it loops while you think.',
        'Drag the ruler, tap a decade chip, or nudge ±1/±10 to pick a year.',
        'Hit 🔒 Lock — turns pass clockwise until everyone placed.',
        'Reveal: closest guess scores most + 👑 crown bonus. First to the target wins.'
      ]
    },
    buzz: {
      icon: '🔔',
      title: 'Buzz! — how it works',
      steps: [
        'The clip loops — slap your color zone the moment you know it.',
        'Type the title (“title” or “artist - title”) and hit Check.',
        'Right = points, wrong = −1 and you’re locked out for the round.',
        'Stuck with the floor? Give up releases it. You have 25s to answer.'
      ]
    },
    race: {
      icon: '🏁',
      title: 'Opening Bars — how it works',
      steps: [
        'One mystery song. The snippet starts tiny (0.7s) and grows to 12s.',
        'Buzz whenever you know it — earlier buzz = more points (8 → 3).',
        'Wrong answer = locked out, and the clip keeps growing for the rest.',
        'Nobody gets it after 12s? The round ends with no points.'
      ]
    },
    first: {
      icon: '🍑',
      title: 'Which came first? — how it works',
      steps: [
        'Play clip A, then clip B (the vote opens after you heard B).',
        'Each player votes in turn: which song is older?',
        'Correct vote = +2, plus a streak bonus from 3 in a row.',
        'Most points at the target score takes the game.'
      ]
    },
    cards: {
      icon: '🃏',
      title: 'Timeline Cards — how it works',
      steps: [
        'You start with one card on your own timeline board.',
        'Hear the mystery song, then tap a gap to slot it in year order.',
        'Right = the card stays, wrong = it’s discarded forever.',
        'First to fill your board (6/10/14 cards) wins.'
      ]
    }
  };

  const copy = $derived(COPY[mode] ?? COPY.timeline);

  function close(): void {
    takeSfx('chime');
    onclose?.();
  }
</script>

<div class="howto rich-card" data-testid="howto-card">
  <div class="h-head">
    <span class="h-icon" aria-hidden="true">{copy.icon}</span>
    <strong class="h-title font-display">{copy.title}</strong>
    <button class="h-x" onclick={close} aria-label="Dismiss how to play" data-testid="howto-close">×</button>
  </div>
  <ol class="h-steps">
    {#each copy.steps as s, i (i)}
      <li><span class="h-n">{i + 1}</span><span>{s}</span></li>
    {/each}
  </ol>
  <button class="pill pill--cta h-go" onclick={close} data-testid="howto-gotit">Got it — let’s play →</button>
</div>

<style>
  .howto {
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    animation: pop-in var(--dur) var(--ease-out);
  }
  .h-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .h-icon {
    font-size: 1.4rem;
  }
  .h-title {
    font-size: 1.05rem;
    flex: 1;
    min-width: 0;
  }
  .h-x {
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    width: 32px;
    height: 32px;
    font-size: 1.2rem;
    line-height: 1;
    color: var(--text-mut);
    flex: none;
  }
  .h-steps {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .h-steps li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 0.92rem;
    line-height: 1.4;
  }
  .h-n {
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--cta);
    color: #fff;
    font-size: 0.78rem;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .h-go {
    align-self: flex-start;
  }
</style>
