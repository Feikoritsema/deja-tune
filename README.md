# Déjà Tune

A multiplayer music-guessing party game for **one shared iPad**. Everyone listens to the
same clip; players guess years, buzz in with song titles, or vote on which song came first.
No accounts, no server, no build-time secrets — the whole game runs as a static PWA with
all state in the browser.

## Game modes

| Mode | How it plays |
|---|---|
| **Timeline** | Place each song on the year ruler. Closest guess scores most, plus a crown bonus. |
| **Buzz!** | Slap your color zone, then type the title (`title` or `artist - title`; fuzzy matched). Wrong answers lock you out. |
| **Opening Bars** | The clip grows 0.7s → 12s. Buzz early for max points. |
| **Which came first?** | Two clips, one question: which song is older? Streaks earn bonus points. |
| **Timeline Cards** | Slot each mystery song into your own timeline board. First to fill it wins. |

Plus: solo practice with a hint ladder, per-game freshness (no repeats in a game, recent songs avoided across games), local Hall of Fame, and full resume-after-crash via `localStorage` snapshots.

## Quickstart

Requirements: Node 22+.

```sh
npm install
npm run dev        # dev server (http://localhost:5173, add ?demo for offline fixtures)
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end tests (Playwright, iPad profile)
npm run check      # typecheck (svelte-check)
npm run build      # production build → dist/
```

## Project structure

```
src/
  App.svelte            # screen router (home → setup → soundcheck → game)
  main.ts
  components/           # Home, Setup, SoundCheck, Game, Rail, boards per mode,
                        # Reveal, Scoreboard, Champion, HallOfFame, …
  lib/
    core/               # pure game logic: engine, fuzzy judge, scoring,
                        # freshness, RNG, settings (fully unit-tested)
    services/           # audio bus, song-pool registry, localStorage stores
    store.svelte.ts     # screen routing + engine handle + resume
    styles/             # design tokens
public/pool/            # song pools per category (pop / rock / guilty)
tools/pool-builder/     # pool pipeline: seeds → enrich → validate → emit JSON
tests/
  unit/                 # Vitest: judge, engine, scoring, freshness, …
  e2e/                  # Playwright incl. visual regression baselines
```

## Song pools

Pools are static JSON built by `tools/pool-builder/` (Deezer charts/playlists + iTunes
fallback, original-release-year rule, era balancing):

```sh
npm run pool:fixtures   # fixture pools for tests / offline demo
npm run pool:build      # live build (needs network)
npm run pool:check      # validate pools
```

At runtime only 30-second preview clips stream (resolved at point of use, never stored);
covers link to CDN artwork with local fallbacks.

## Deploy

Push to `main` — `.github/workflows/deploy.yml` builds and publishes the static bundle
to GitHub Pages. No environment variables or backend required.

## Tech

Vite + Svelte 5 + TypeScript · Vitest + Playwright · `vite-plugin-pwa` · WebAudio-synthesized
sound effects (zero audio assets) · deterministic seeded RNG so games are replay-testable.

## License

MIT — see [LICENSE](./LICENSE).
