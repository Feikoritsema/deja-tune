import { test, expect } from '@playwright/test';
import { demoHome, startCardsGame, readCardsState, correctGapFor } from './helpers';

test.describe('timeline cards mode', () => {
  test('judges inline on the board, then grows boards to a champion', async ({ page }) => {
    await demoHome(page);
    await startCardsGame(page, 6);

    // turn 1 (Player 1) — the mystery title stays hidden while playing…
    let s = await readCardsState(page);
    expect(s.activeSeat).toBe(0);
    expect(s.sizes).toEqual([1, 1]); // starters dealt
    await expect(page.getByText(s.mysteryTitle, { exact: true })).toHaveCount(0); // spoiler guard

    // …a deliberately wrong gap judges inline: verdict names the full name,
    // the card is discarded, and the turn passes — no page switches
    const wrong = s.mysteryYear > s.boardYears[0]! ? 0 : s.boardYears.length;
    await page.getByTestId(`gap-${wrong}`).click();
    const verdict = page.getByTestId('verdict');
    await expect(verdict).toContainText('Player 1');
    await expect(verdict).toContainText('discarded');
    await expect(page.getByTestId('reveal-screen')).toHaveCount(0);
    await expect(page.getByTestId('ministrip-0')).toContainText('1/6'); // P1 still at starter
    await expect(page.getByTestId('board-1')).toBeVisible(); // Player 2's turn, same screen

    // now play every turn correctly — Player 1 burned turn 1 on the discard,
    // so Player 2 reaches 6 cards first and takes the crown
    for (let k = 0; k < 12; k++) {
      s = await readCardsState(page);
      await expect(page.getByText(s.mysteryTitle, { exact: true })).toHaveCount(0);
      await page.getByTestId(`gap-${correctGapFor(s.boardYears, s.mysteryYear)}`).click();
      // either the inline verdict lands or the win ceremony starts (board unmounts)
      await expect(page.getByTestId('verdict').or(page.getByTestId('reveal-screen'))).toBeVisible({ timeout: 5_000 });
      if (await page.getByTestId('reveal-screen').isVisible().catch(() => false)) break; // won
      await expect(verdict).toContainText('slotted');
      await expect(page.getByTestId('reveal-screen')).toHaveCount(0); // still no detours
    }

    // only the winning placement takes the reveal → champion ceremony
    await expect(page.getByTestId('reveal-screen')).toBeVisible();
    await expect(page.getByTestId('continue')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('champion')).toBeVisible();
    await expect(page.getByTestId('champion')).toContainText('Player 2');
  });
});
