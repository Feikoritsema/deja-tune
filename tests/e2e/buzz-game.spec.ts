import { test, expect } from '@playwright/test';
import { demoHome, startPartyGame, readTruth } from './helpers';

test.describe('buzz mode', () => {
  test('buzzer answers correctly and advances to champion', async ({ page }) => {
    await demoHome(page);

    await page.getByRole('button', { name: /party game/i }).click();
    await page.getByTestId('mode-buzz').click();
    await page.getByTestId('start-game').click();
    await page.getByTestId('soundcheck').click();
    await expect(page.getByTestId('go')).toBeVisible();
    await page.getByTestId('go').click();

    for (let i = 0; i < 4; i++) {
      if (await page.getByTestId('champion').isVisible().catch(() => false)) break;

      await expect(page.getByTestId('zone-0')).toBeVisible();
      const t = await readTruth(page);

      await page.getByTestId('zone-0').click();
      await expect(page.getByTestId('buzz-winner')).toBeVisible();
      await page.getByTestId('buzz-input').fill(t.title);
      await page.getByTestId('buzz-submit').click();

      // reveal verdict then standings/champion
      const scr = page.getByTestId('scoreboard');
      const champ = page.getByTestId('champion');
      await expect(scr.or(champ)).toBeVisible({ timeout: 15_000 });
      if (!(await champ.isVisible().catch(() => false))) {
        await scr.getByTestId('next-round').click();
      }
    }

    await expect(page.getByTestId('champion')).toBeVisible();
    await expect(page.getByTestId('champion')).toContainText('Player 1');
  });
});