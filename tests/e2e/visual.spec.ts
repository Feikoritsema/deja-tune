import { test, expect } from '@playwright/test';
import { demoHome, startPartyGame, startCardsGame, placeYear, readTruth } from './helpers';

// Live clip playback, count-up scoring and pulse animations are inherently non-deterministic
// frame-by-frame, so we tolerate tiny (<1.5%) pixel drift while still failing loudly on real
// regressions (missing layout, broken UI, wrong colors at scale).
const noAnim = { animations: 'disabled' as const, maxDiffPixelRatio: 0.015 };

test.describe('visual regression', () => {
  test('home', async ({ page }) => {
    await demoHome(page);
    await expect(page.getByRole('heading', { name: /déjà tune/i })).toBeVisible();
    await expect(page).toHaveScreenshot('home.png', noAnim);
  });

  test('setup', async ({ page }) => {
    await demoHome(page);
    await page.getByRole('button', { name: /party game/i }).click();
    await expect(page.getByTestId('start-game')).toBeEnabled();
    await page.getByRole('button', { name: /advanced settings/i }).click();
    await expect(page.getByText('Buzz scoring')).toBeVisible();
    await expect(page).toHaveScreenshot('setup.png', noAnim);
  });

  test('timeline board', async ({ page }) => {
    await demoHome(page);
    await startPartyGame(page);
    await expect(page.getByTestId('ruler')).toBeVisible();
    await expect(page).toHaveScreenshot('timeline-board.png', noAnim);
  });

  test('timeline reveal', async ({ page }) => {
    await demoHome(page);
    await startPartyGame(page);
    const t = await readTruth(page);
    await placeYear(page, t.year);
    await placeYear(page, t.year + 40);
    await expect(page.getByTestId('reveal-card')).toBeVisible();
    await page.waitForTimeout(2300); // let the score count-up settle before the shot
    await expect(page).toHaveScreenshot('timeline-reveal.png', noAnim);
  });

  test('cards board', async ({ page }) => {
    await demoHome(page);
    await startCardsGame(page, 6);
    await expect(page.getByTestId('cards-board')).toBeVisible();
    await expect(page).toHaveScreenshot('cards-board.png', noAnim);
  });

  test('buzz winner panel', async ({ page }) => {
    await demoHome(page);
    await page.getByRole('button', { name: /party game/i }).click();
    await page.getByTestId('mode-buzz').click();
    await page.getByTestId('start-game').click();
    await page.getByTestId('soundcheck').click();
    await expect(page.getByTestId('go')).toBeVisible();
    await page.getByTestId('go').click();
    await page.getByTestId('zone-0').click();
    await expect(page.getByTestId('buzz-winner')).toBeVisible();
    await expect(page).toHaveScreenshot('buzz-winner.png', noAnim);
  });
});