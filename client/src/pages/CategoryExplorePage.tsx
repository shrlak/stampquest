import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { useGeo } from '../hooks/useGeolocation';
import { usePlaces } from '../hooks/usePlaces';
import { useUnits } from '../hooks/useUnits';
import { haversineMeters } from '../lib/geo';
import { SearchInput } from '../components/SearchInput';
import { StampCard } from '../components/StampCard';
import type { PlaceCategory } from '../types';

// Leaflet is a hefty dependency (~150 kB) — only fetch it when someone
// actually switches to map view, not on every page load.
const CategoryMapView = lazy(() => import('../components/CategoryMapView'));

const CATEGORY_META: Record<
  PlaceCategory,
  { title: string; placeholder: string; noun: string; center: [number, number]; zoom: number }
> = {
  landmark: {
    title: 'Landmarks',
    placeholder: 'Search landmarks or countries…',
    noun: 'landmarks',
    center: [20, 10],
    zoom: 2,
  },
  city: {
    title: 'Cities',
    placeholder: 'Search cities or countries…',
    noun: 'cities',
    center: [25, 10],
    zoom: 2,
  },
  'us-state': {
    title: 'US States',
    placeholder: 'Search states…',
    noun: 'states',
    center: [39.5, -98.5],
    zoom: 3,
  },
};

// Reached only by tapping a card on the home page — there's no persistent
// tab for these anymore, so a back chevron is the way home.
export default function CategoryExplorePage({ category }: { category: PlaceCategory }) {
  const meta = CATEGORY_META[category];
  const navigate = useNavigate();
  const { position } = useGeo();
  const { places } = usePlaces();
  const { units } = useUnits();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'cards' | 'map'>('cards');

  const categoryPlaces = useMemo(
    () => places?.filter((p) => p.category === category) ?? null,
    [places, category],
  );

  const q = query.trim().toLowerCase();
  const filtered = categoryPlaces
    ? categoryPlaces.filter(
        (p) => !q || p.name.toLowerCase().includes(q) || p.country.toLowerCase().includes(q),
      )
    : null;

  // Sorted by distance once we have a position (granted from any screen);
  // otherwise alphabetically, so search is useful even before that.
  const sorted = filtered
    ? filtered
        .map((p) => ({
          place: p,
          distance: position ? haversineMeters(position.lat, position.lng, p.lat, p.lng) : null,
        }))
        .sort((a, b) =>
          a.distance !== null && b.distance !== null
            ? a.distance - b.distance
            : a.place.name.localeCompare(b.place.name),
        )
    : null;

  return (
    <div className="px-4 pt-4">
      <motion.button
        type="button"
        onClick={() => navigate('/')}
        whileHover={{ backgroundColor: 'rgba(47, 42, 36, 0.06)' }}
        whileTap={{ scale: 0.88 }}
        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
        className="mb-2 flex h-11 w-11 items-center justify-center rounded-full text-2xl"
        aria-label="Back to home"
        data-testid="back-button"
      >
        ‹
      </motion.button>

      <h1 className="mb-4 font-display text-3xl">{meta.title}</h1>

      {categoryPlaces && categoryPlaces.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <div className="flex-1">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={meta.placeholder}
              data-testid={`${category}-search`}
            />
          </div>
          <div className="flex shrink-0 rounded-xl border border-ink/10 bg-paper-light p-1">
            {(['cards', 'map'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                data-testid={`${category}-view-${v}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === v ? 'bg-ink text-paper-light' : 'text-ink-soft'
                }`}
              >
                {v === 'cards' ? 'Cards' : 'Map'}
              </button>
            ))}
          </div>
        </div>
      )}

      {sorted && sorted.length === 0 && (
        <p className="mt-10 text-center text-sm text-ink-soft">
          No {meta.noun} match “{query}”.
        </p>
      )}

      {view === 'cards' ? (
        sorted &&
        sorted.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 pb-6" data-testid={`${category}-cards`}>
            {sorted.map(({ place }, i) => (
              <StampCard key={place.id} place={place} index={i} />
            ))}
          </div>
        )
      ) : (
        <div
          className="-mx-4 h-[65vh] overflow-hidden border-y border-ink/10"
          data-testid={`${category}-map`}
        >
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-ink-soft">
                Loading map…
              </div>
            }
          >
            <CategoryMapView
              places={sorted ?? []}
              center={meta.center}
              zoom={meta.zoom}
              units={units}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
