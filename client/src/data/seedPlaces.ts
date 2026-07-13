// Curated landmarks for the static/local build (GitHub Pages demo mode).
// Mirror of server/src/seed.ts — keep the two in sync when adding landmarks.
export interface SeedPlace {
  id: string;
  name: string;
  country: string;
  description: string;
  lat: number;
  lng: number;
  artKey: string;
}

// Stable ids so stamp art (hashed on id) and collected stamps survive reloads.
const p = (
  artKey: string,
  name: string,
  country: string,
  lat: number,
  lng: number,
  description: string,
): SeedPlace => ({ id: `seed-${artKey}`, artKey, name, country, lat, lng, description });

export const SEED_PLACES: SeedPlace[] = [
  p('eiffel', 'Eiffel Tower', 'France', 48.8584, 2.2945, 'Iron lattice reaching for the Paris sky since 1889 — the city of light’s eternal exclamation mark.'),
  p('liberty', 'Statue of Liberty', 'United States', 40.6892, -74.0445, 'Lady Liberty lifts her torch over New York Harbor, greeting travelers as she has since 1886.'),
  p('bigben', 'Big Ben', 'United Kingdom', 51.5007, -0.1246, 'The great bell of Westminster keeps London’s time, chiming above the Thames in Gothic splendour.'),
  p('colosseum', 'Colosseum', 'Italy', 41.8902, 12.4922, 'Rome’s mighty amphitheatre of stone arches, where fifty thousand voices once roared.'),
  p('tajmahal', 'Taj Mahal', 'India', 27.1751, 78.0421, 'A marble love letter on the Yamuna’s banks, glowing rose and ivory at dawn.'),
  p('pyramids', 'Great Pyramid of Giza', 'Egypt', 29.9792, 31.1342, 'Four and a half millennia of desert sun on the last standing wonder of the ancient world.'),
  p('operahouse', 'Sydney Opera House', 'Australia', -33.8568, 151.2153, 'White sails billowing on Bennelong Point — the harbour’s grandest performance.'),
  p('goldengate', 'Golden Gate Bridge', 'United States', 37.8199, -122.4783, 'International-orange towers striding through the fog at the gate of the Pacific.'),
  p('redeemer', 'Christ the Redeemer', 'Brazil', -22.9519, -43.2105, 'Arms open wide above Rio, embracing beaches, samba, and the Sugarloaf below.'),
  p('machu', 'Machu Picchu', 'Peru', -13.1631, -72.545, 'The lost citadel of the Incas, terraced into cloud forest high above the Urubamba.'),
  p('fuji', 'Mount Fuji', 'Japan', 35.3606, 138.7274, 'The sacred snow-capped cone rising in perfect symmetry over lakes and pine.'),
  p('torii', 'Fushimi Inari Shrine', 'Japan', 34.9671, 135.7727, 'Ten thousand vermilion torii gates winding up the wooded slopes of Kyoto.'),
  p('sagrada', 'Sagrada Família', 'Spain', 41.4036, 2.1744, 'Gaudí’s unfinished symphony in stone, its spires still climbing over Barcelona.'),
  p('brandenburg', 'Brandenburg Gate', 'Germany', 52.5163, 13.3777, 'Berlin’s neoclassical triumph, where the Quadriga rides toward a reunited city.'),
  p('burj', 'Burj Khalifa', 'United Arab Emirates', 25.1972, 55.2744, 'A silver needle stitching the Dubai desert to the clouds — the world’s tallest view.'),
  p('petra', 'Petra', 'Jordan', 30.3285, 35.4444, 'The rose-red Treasury carved into a desert canyon, revealed by a crack in the rock.'),
  p('angkor', 'Angkor Wat', 'Cambodia', 13.4125, 103.867, 'Lotus-bud towers mirrored in still water — the largest temple the world has known.'),
  p('greatwall', 'Great Wall at Mutianyu', 'China', 40.4319, 116.5704, 'Watchtowers riding the ridgelines, a stone dragon asleep across the mountains.'),
  p('moai', 'Moai of Rapa Nui', 'Chile', -27.1258, -109.2769, 'Silent stone ancestors gazing inland over the loneliest island in the sea.'),
  p('tablemountain', 'Table Mountain', 'South Africa', -33.9628, 18.4098, 'A flat-topped sentinel draped in its tablecloth of cloud above Cape Town.'),
  p('niagara', 'Niagara Falls', 'Canada', 43.0962, -79.0377, 'A thundering horseshoe of white water on the border of two nations.'),
  p('santorini', 'Oia, Santorini', 'Greece', 36.4618, 25.3753, 'Whitewashed houses and blue domes tumbling down the caldera into the Aegean.'),
  p('neuschwanstein', 'Neuschwanstein Castle', 'Germany', 47.5576, 10.7498, 'The fairy-tale king’s castle of turrets and towers, adrift in Alpine mist.'),
  p('acropolis', 'Acropolis of Athens', 'Greece', 37.9715, 23.7267, 'The Parthenon’s marble columns catching golden light above the ancient city.'),
];
