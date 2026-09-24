import { test, expect } from '@playwright/test';
import { demoHome, startPartyGame, readTruth } from './helpers';

test.describe('skip song', () => {
  test('a hold skips, a quick tap teaches the hold gesture instead', async ({ page }) => {
    await demoHome(page);
    await startPartyGame(page);

    const t1 = await readTruth(page);
    const skip = page.getByTestId('skip');
    await expect(skip).toBeVisible();

    // genuine hold → song swaps, label stays plain
    const box = (await skip.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await expect(skip).toContainText('⏭ Skip song');
    const t2 = await readTruth(page);
    expect(t2.title).not.toBe(t1.title); // didn't guess with the old track

    // quick tap → no skip, but teaches the hold gesture
    await skip.click();
    await expect(skip).toContainText('hold to skip');
    const t3 = await readTruth(page);
    expect(t3.title).toBe(t2.title); // song still playing
  });
});