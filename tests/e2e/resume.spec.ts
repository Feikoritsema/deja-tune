import { test, expect } from '@playwright/test';
import { demoHome, startPartyGame, placeYear, readTruth, resumeCard, expectNoPins, readLockedYears } from './helpers';

test.describe('resume', () => {
  test('mid-round snapshot survives a reload (local-first)', async ({ page }) => {
    await demoHome(page);
    await startPartyGame(page);

    const t = await readTruth(page);
    await placeYear(page, t.year); // Player 1 placed; Player 2 still to act
    await expectNoPins(page); // locked guesses stay hidden during answer (no peeking)
    expect(Object.values(await readLockedYears(page))).toContain(t.year);

    await page.reload();

    // home shows the resume card computed from the snapshot
    const rc = await resumeCard(page);
    await expect(rc).toBeVisible();
    await rc.click();

    await expect(page.getByTestId('ruler')).toBeVisible();
    await expectNoPins(page); // still hidden after rehydration…
    expect(Object.values(await readLockedYears(page))).toContain(t.year); // …but Player 1's guess persisted
    await expect(page.getByRole('main').getByText('Player 2', { exact: true })).toBeVisible(); // and their turn is preserved

    // and the round can still be finished cleanly after rehydration
    await placeYear(page, t.year + 40);
    await expect(page.getByTestId('reveal-screen')).toBeVisible();
    await expect(page.getByTestId('scoreboard')).toBeVisible({ timeout: 15_000 });
  });
});