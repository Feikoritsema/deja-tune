import { expect, type Page } from '@playwright/test';

export interface Truth {
  title: string;
  artist: string;
  year: number;
  yearB: number | null;
}

/** Read the live round's truth from the running engine (test instrumentation, demo mode only). */
export async function readTruth(page: Page): Promise<Truth> {
  return page.evaluate(() => {
    const st = (window as unknown as { __dejaTuneStore?: { engine?: { currentRound?: { tracks: Array<{ title?: string; artist?: string; year?: number }> } | null } | null } }).__dejaTuneStore;
    const r = st?.engine?.currentRound;
    return {
      title: r?.tracks[0]?.title ?? '',
      artist: r?.tracks[0]?.artist ?? '',
      year: r?.tracks[0]?.year ?? 0,
      yearB: r?.tracks[1]?.year ?? null
    };
  });
}

export async function demoHome(page: Page): Promise<void> {
  await page.goto('/?demo');
  await expect(page.getByRole('heading', { name: /déjà tune/i })).toBeVisible();
}

/** Party game with defaults; timeline mode is the default. */
export async function startPartyGame(page: Page): Promise<void> {
  await page.getByRole('button', { name: /party game/i }).click();
  await expect(page.getByTestId('start-game')).toBeEnabled();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('soundcheck')).toBeVisible();
  await page.getByTestId('soundcheck').click();
  await expect(page.getByTestId('go')).toBeVisible();
  await page.getByTestId('go').click();
}

/** Drag the ruler to `year` and lock it in for the active player. */
export async function placeYear(page: Page, year: number, yearMin = 1955, yearMax = 2026): Promise<void> {
  const ruler = page.getByTestId('ruler');
  await expect(ruler).toBeVisible();
  const lock = page.getByTestId('lock-year');
  await expect(lock).toBeEnabled();
  const box = (await ruler.boundingBox())!;
  const frac = (year - yearMin) / (yearMax - yearMin);
  const x = box.x + Math.min(0.999, Math.max(0.001, frac)) * box.width;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 3, y + 1, { steps: 2 });
  await page.mouse.up();
  await lock.click();
}

/** Locked guesses stay hidden on the ruler during the answer phase (no peeking at
 * previous locks) — assert absence, and read the persisted guess via the store. */
export async function expectNoPins(page: Page): Promise<void> {
  await expect(page.getByTestId('ruler')).toBeVisible();
  await expect(page.locator('[data-testid^="pin-"]')).toHaveCount(0);
}

/** Years locked in the live round's guesses, keyed by player id. */
export async function readLockedYears(page: Page): Promise<Record<string, number | null>> {
  return page.evaluate(() => {
    const st = (window as unknown as { __dejaTuneStore?: { engine?: { currentRound?: { guesses: Record<string, { year: number | null }> } | null } | null } }).__dejaTuneStore;
    const g = st?.engine?.currentRound?.guesses ?? {};
    return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v?.year ?? null]));
  });
}
export interface HoFEntry {
  id: string;
  winnerName: string;
  players: string[];
  score: number;
}

export async function readHof(page: Page): Promise<HoFEntry[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('deja:tune:hof:v1');
    return raw ? (JSON.parse(raw) as HoFEntry[]) : [];
  });
}

export async function resumeCard(page: Page) {
  return page.getByRole('button', { name: /resume/i });
}

export interface CardsState {
  mysteryTitle: string;
  mysteryYear: number;
  /** years on the active player's board, ascending */
  boardYears: number[];
  activeSeat: number;
  /** board sizes in seat order */
  sizes: number[];
}

/** Live cards-round truth from the running engine (test instrumentation, demo mode only). */
export async function readCardsState(page: Page): Promise<CardsState> {
  return page.evaluate(() => {
    const st = (window as unknown as { __dejaTuneStore?: {
      engine?: {
        currentRound?: { tracks: Array<{ title?: string; year?: number }>; activeSeat: number | null } | null;
        game?: { boards: Record<string, Array<{ year?: number }>>; players: Array<{ player: { id: string; seat: number } }> };
      } | null;
    } }).__dejaTuneStore;
    const e = st?.engine;
    const r = e?.currentRound;
    const active = r?.activeSeat ?? 0;
    const pid = e?.game?.players.find((p) => p.player.seat === active)?.player.id ?? '';
    const board = e?.game?.boards?.[pid] ?? [];
    return {
      mysteryTitle: r?.tracks[0]?.title ?? '',
      mysteryYear: r?.tracks[0]?.year ?? 0,
      boardYears: board.map((t) => t.year ?? 0),
      activeSeat: active,
      sizes: (e?.game?.players ?? []).map((p) => (e?.game?.boards?.[p.player.id] ?? []).length)
    };
  });
}

/** Gap index that keeps an ascending board sorted (ties go after equals). */
export function correctGapFor(boardYears: number[], year: number): number {
  let g = 0;
  while (g < boardYears.length && boardYears[g]! <= year) g++;
  return g;
}

/** Party game in Timeline Cards mode with a small board target (fast e2e). */
export async function startCardsGame(page: Page, target: 6 | 10 | 14 = 6): Promise<void> {
  await page.getByRole('button', { name: /party game/i }).click();
  await page.getByTestId('mode-cards').click();
  await page.getByTestId(`cards-${target}`).click();
  await page.getByTestId('start-game').click();
  await page.getByTestId('soundcheck').click();
  await expect(page.getByTestId('go')).toBeVisible();
  await page.getByTestId('go').click();
  await expect(page.getByTestId('cards-board')).toBeVisible();
}