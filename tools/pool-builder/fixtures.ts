// Deterministic fixture pools — used when no live build is available (CI/dev).
// Fixture tracks have no preview source, so they only play in demo mode (?demo).
// The live builder (index.ts live) replaces these with real Deezer-backed pools.
import type { Category, Track } from '../../src/lib/core/types';

interface FixtureSeed {
  title: string;
  artist: string;
  year: number;
}

const POP: FixtureSeed[] = [
  ['Billie Jean', 'Michael Jackson', 1982],
  ['Like a Prayer', 'Madonna', 1989],
  ['Toxic', 'Britney Spears', 2003],
  ['Umbrella', 'Rihanna', 2007],
  ['Rolling in the Deep', 'Adele', 2010],
  ['Shape of You', 'Ed Sheeran', 2017],
  ['Blinding Lights', 'The Weeknd', 2019],
  ['Shake It Off', 'Taylor Swift', 2014],
  ['Get Lucky', 'Daft Punk', 2013],
  ['Feel Good Inc.', 'Gorillaz', 2005]
].map(([title, artist, year]) => ({ title, artist, year })) as FixtureSeed[];

const ROCK: FixtureSeed[] = [
  ['Bohemian Rhapsody', 'Queen', 1975],
  ['Stairway to Heaven', 'Led Zeppelin', 1971],
  ['Sweet Child O’ Mine', "Guns N' Roses", 1987],
  ['Smells Like Teen Spirit', 'Nirvana', 1991],
  ['Wonderwall', 'Oasis', 1995],
  ['Creep', 'Radiohead', 1992],
  ['The Pretender', 'Foo Fighters', 2007],
  ['Mr. Brightside', 'The Killers', 2003],
  ['Sex on Fire', 'Kings of Leon', 2008],
  ['Seven Nation Army', 'The White Stripes', 2003]
].map(([title, artist, year]) => ({ title, artist, year })) as FixtureSeed[];

const GUILTY: FixtureSeed[] = [
  ['Macarena', 'Los Del Rio', 1995],
  ['Barbie Girl', 'Aqua', 1997],
  ['Mambo No. 5 (A Little Bit of...)', 'Lou Bega', 1999],
  ['Blue (Da Ba Dee)', 'Eiffel 65', 1999],
  ['Cotton Eye Joe', 'Rednex', 1994],
  ['Gangnam Style', 'PSY', 2012],
  ['Never Gonna Give You Up', 'Rick Astley', 1987],
  ['Call Me Maybe', 'Carly Rae Jepsen', 2011],
  ['Who Let the Dogs Out', 'Baha Men', 2000],
  ['Tubthumping', 'Chumbawamba', 1997]
].map(([title, artist, year]) => ({ title, artist, year })) as FixtureSeed[];

const SETS: Record<Category, FixtureSeed[]> = { pop: POP, rock: ROCK, guilty: GUILTY };

export function fixturePool(cat: Category): Track[] {
  return SETS[cat].map((s, i) => ({
    id: `fx-${cat}-${i}`,
    deezerId: null,
    itunesId: null,
    title: s.title,
    artist: s.artist,
    year: s.year,
    category: cat,
    hasDeezer: false,
    itunesPreviewUrl: null
  }));
}