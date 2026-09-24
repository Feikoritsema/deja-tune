// Seed registry: per category = genre chart + playlist search queries + hand list.
// Volume comes from the multi-source registry (a single chart caps at ~300).

export interface GenreChartId {
  [key: string]: number | undefined;
}
export const CHARTS: GenreChartId = { pop: 132, rock: 152 };

export const PLAYLIST_QUERIES: Record<string, string[]> = {
  pop: [
    '60s hits',
    '70s hits',
    '80s hits',
    '90s hits',
    '90s pop hits',
    '2000s hits',
    '2000s pop hits',
    '2010s hits',
    '2010s pop hits',
    '2020s hits',
    '2020s pop hits',
    'songs you know by heart',
    'pop classics',
    'oldies',
    'motown hits',
    'disco classics',
    'top hits all time',
    'dance pop hits',
    'happy hits'
  ],
  rock: [
    '60s rock hits',
    '70s rock hits',
    'rock classics',
    'classic rock',
    '80s rock hits',
    '90s rock anthems',
    '90s alternative hits',
    '2000s rock hits',
    '2010s rock hits',
    '2020s rock hits',
    'rock party',
    'best of rock',
    '70s classic rock',
    '80s glam rock',
    'punk rock classics',
    'guitar rock legends',
    'alternative rock hits',
    // expansion batch (2026-09 growth to 3000): target thin decades 60s/70s/90s/2020s
    '60s british invasion rock',
    '70s hard rock essentials',
    '90s grunge essentials',
    '2020s alternative rock',
    '70s southern rock',
    '90s rock ballads'
  ],
  guilty: [
    'guilty pleasures',
    'one hit wonders',
    'karaoke classics',
    'wedding party songs',
    'songs everyone knows',
    '70s hits',
    '80s hits',
    '90s hits',
    '2000s hits',
    '2010s hits',
    '2020s hits',
    'disco hits',
    '70s disco hits',
    '80s one hit wonders',
    '90s dance hits',
    'party anthems 2010s',
    // expansion batch (2026-09 growth to 3000): target thin decades 60s-90s + 2020s
    '70s guilty pleasures',
    '80s guilty pleasures',
    '90s guilty pleasures',
    '2020s party hits',
    '90s eurodance essentials',
    '70s disco party',
    '80s party anthems',
    '2020s viral hits'
  ]
};

export const MAX_PLAYLISTS_PER_QUERY = 2;

/** Hand-seeded guilty pleasures — the honest source for this category. */
export const GUILTY_HAND: Array<[string, string]> = [
  ['It’s Raining Men', 'The Weather Girls'],
  ['Never Gonna Give You Up', 'Rick Astley'],
  ['I’m Too Sexy', 'Right Said Fred'],
  ['Macarena', 'Los Del Rio'],
  ['Mambo No. 5 (A Little Bit of...)', 'Lou Bega'],
  ['Barbie Girl', 'Aqua'],
  ['Cotton Eye Joe', 'Rednex'],
  ['Gangnam Style', 'PSY'],
  ['Cha Cha Slide', 'DJ Casper'],
  ['Blue (Da Ba Dee)', 'Eiffel 65'],
  ['Wannabe', 'Spice Girls'],
  ['What Does the Fox Say?', 'Ylvis'],
  ['Turn Down for What', 'DJ Snake'],
  ['Axel F', 'Crazy Frog'],
  ['All Star', 'Smash Mouth'],
  ['Tubthumping', 'Chumbawamba'],
  ['The Ketchup Song (Aserejé)', 'Las Ketchup'],
  ['Dragostea Din Tei', 'O-Zone'],
  ['Sandstorm', 'Darude'],
  ['Livin’ la Vida Loca', 'Ricky Martin'],
  ['MMMBop', 'Hanson'],
  ['Who Let the Dogs Out', 'Baha Men'],
  ['Friday', 'Rebecca Black'],
  ['Bad Day', 'Daniel Powter'],
  ['Party in the U.S.A.', 'Miley Cyrus'],
  ['Call Me Maybe', 'Carly Rae Jepsen'],
  ['Tik Tok', 'Kesha'],
  ['Cheerleader', 'OMI'],
  ['Happy', 'Pharrell Williams'],
  ['Uptown Funk', 'Mark Ronson'],
  ['I Gotta Feeling', 'The Black Eyed Peas'],
  ['Hey Ya!', 'OutKast'],
  ['Mr. Brightside', 'The Killers'],
  ['Dancing Queen', 'ABBA'],
  ['Sweet Caroline', 'Neil Diamond'],
  ['Don’t Stop Believin’', 'Journey'],
  ['Africa', 'Toto'],
  ['Total Eclipse of the Heart', 'Bonnie Tyler'],
  ['Time Warp', 'Rocky Horror Picture Show'],
  ['Y.M.C.A.', 'Village People'],
  ['The Final Countdown', 'Europe'],
  ['Livin’ on a Prayer', 'Bon Jovi'],
  ['Wake Me Up Before You Go-Go', 'Wham!'],
  ['Take on Me', 'a-ha'],
  ['Cups (Pitch Perfect’s When I’m Gone)', 'Anna Kendrick']
];

export function pickPlaylists(
  summaries: Array<{ id: number; title?: string; nb_tracks?: number; public?: boolean }>,
  max: number
): number[] {
  const elig = summaries.filter((s) => s.public !== false && (s.nb_tracks ?? 0) >= 50 && typeof s.id === 'number');
  elig.sort((a, b) => (b.nb_tracks ?? 0) - (a.nb_tracks ?? 0));
  return elig.slice(0, max).map((s) => s.id);
}