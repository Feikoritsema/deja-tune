import { test, expect } from '@playwright/test';
import { demoHome, startPartyGame, placeYear, readTruth, readHof } from './helpers';

test.describe('timeline party game', () => {
  test('plays a full game to champion without leaking song titles early', async ({ page }) => {
    await demoHome(page);
    await startPartyGame(page);

    // round 1 — the truth must stay hidden while playing
    const t1 = await readTruth(page);
    await expect(page.getByTestId('ruler')).toBeVisible();
    await expect(page.getByText(t1.title, { exact: true })).toHaveCount(0); // spoiler guard

    // far year on the opposite side of the window: +40 clamps into the 2026 edge
    // and can land on the truth when the truth is near the top of the window.
    const far1 = t1.year > 1990 ? t1.year - 40 : t1.year + 40;
    await placeYear(page, t1.year); // Player 1 nails it → 6 pts
    await placeYear(page, far1); // Player 2 way off → 0 pts

    // reveal shows the exact truth card
    await expect(page.getByTestId('reveal-screen')).toBeVisible();
    await expect(page.getByTestId('reveal-title')).toBeVisible();
    await expect(page.getByTestId('reveal-title')).toHaveText(t1.title);

    // 6 < target 10 → standings, then round 2
    await expect(page.getByTestId('scoreboard').or(page.getByTestId('champion'))).toBeVisible({ timeout: 15_000 });
    if (!(await page.getByTestId('champion').isVisible().catch(() => false))) {
      await page.getByTestId('next-round').click();

      const t2 = await readTruth(page);
      await expect(page.getByText(t2.title, { exact: true })).toHaveCount(0);
      const far2 = t2.year > 1990 ? t2.year - 40 : t2.year + 40;
      await placeYear(page, t2.year);
      await placeYear(page, far2);

      await expect(page.getByTestId('reveal-screen')).toBeVisible();
      await expect(page.getByTestId('scoreboard').or(page.getByTestId('champion'))).toBeVisible({ timeout: 15_000 });
      if (!(await page.getByTestId('champion').isVisible().catch(() => false))) {
        await page.getByTestId('next-round').click();
        const t3 = await readTruth(page);
        const far3 = t3.year > 1990 ? t3.year - 40 : t3.year + 40;
        await placeYear(page, t3.year);
        await placeYear(page, far3);
        await expect(page.getByTestId('scoreboard').or(page.getByTestId('champion'))).toBeVisible({ timeout: 15_000 });
      }
    }

    await expect(page.getByTestId('champion')).toBeVisible();
    await expect(page.getByTestId('champion')).toContainText('Player 1');

    // champion clears the resume snapshot; the game lands in the hall of fame
    const hof = await readHof(page);
    expect(hof.length).toBeGreaterThanOrEqual(1);
    expect(hof[0]!.winnerName).toBe('Player 1');
  });
});