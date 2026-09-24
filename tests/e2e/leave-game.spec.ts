import { test, expect } from '@playwright/test';
import { demoHome, startPartyGame, placeYear, readTruth, resumeCard } from './helpers';

test.describe('leave and abandon', () => {
  test('leave keeps the snapshot, abandon clears it instantly', async ({ page }) => {
    await demoHome(page);
    await startPartyGame(page);

    const t = await readTruth(page);
    await placeYear(page, t.year); // Player 1 placed; Player 2 still to act

    // leave via the rail home button — the game is kept for resume
    await page.getByRole('button', { name: /leave to main menu/i }).click();
    await expect(page.getByRole('heading', { name: /déjà tune/i })).toBeVisible();
    const rc = await resumeCard(page);
    await expect(rc).toBeVisible();

    // abandon clears the resume card instantly — no refresh needed
    await page.getByRole('button', { name: /^abandon$/i }).click();
    await expect(page.getByRole('button', { name: /^abandon$/i })).toHaveCount(0);
    await expect(await resumeCard(page)).toHaveCount(0);
  });
});
