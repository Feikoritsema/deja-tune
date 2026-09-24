import { test, expect } from '@playwright/test';
import { demoHome, startPartyGame, readTruth } from './helpers';

test.describe('which came first mode', () => {
  test('votes both players and lands on the standings', async ({ page }) => {
    await demoHome(page);

    await page.getByRole('button', { name: /party game/i }).click();
    await page.getByTestId('mode-first').click();
    await page.getByTestId('start-game').click();
    await page.getByTestId('soundcheck').click();
    await expect(page.getByTestId('go')).toBeVisible();
    await page.getByTestId('go').click();

    const t = await readTruth(page);
    expect(t.yearB).not.toBeNull();
    const aOlder = t.year < t.yearB!;
    const firstVote = aOlder ? 'vote-a' : 'vote-b';
    const secondVote = aOlder ? 'vote-b' : 'vote-a';

    // listen to clip B first — the vote opens once both clips have been heard
    await page.getByRole('button', { name: /play b|replay b/i }).click();

    // Player 1 votes — the vchip appears while Player 2 still has the floor
    await expect(page.getByTestId(firstVote)).toBeVisible();
    await page.getByTestId(firstVote).click();
    await expect(page.getByTestId('vote-0')).toBeVisible();
    // Player 2 (last seat) completes the round instantly — straight into the reveal
    await page.getByTestId(secondVote).click();

    await expect(page.getByTestId('reveal-screen')).toBeVisible();
    await expect(page.getByTestId('reveal-title')).toHaveText(t.title);
    await expect(page.getByTestId('scoreboard')).toBeVisible({ timeout: 15_000 });
  });
});