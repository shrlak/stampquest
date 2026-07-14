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

const CategoryMapView = lazy(() => import('../components/CategoryMapView'));

const CATEGORY_META: Record<
  PlaceCategory,
  {
    title: string;
    kicker: string;
    description: string;
    placeholder: string;
    noun: string;
    center: [number, number];
    zoom: number;
    gradient: string;
    accent: string;
    icon: string;
  }
> = {
  landmark: {
    title: 'Landmarks',
    kicker: 'The world’s icons',
    description: 'Wonders, monuments, and landscapes that make a trip unforgettable.',
    placeholder: 'Search landmarks…',
    noun: 'landmarks',
    center: [20, 10],
    zoom: 2,
    gradient: 'from-[#b8dcff] via-[#e1f1ff] to-[#f7fbff]',
    accent: 'text-[#116bc0]',
    icon: 'M12 2 7 9h2v11h6V9h2L12 2Zm-1 9h2v7h-2v-7ZM5 21h14v1.6H5V21Z',
  },
  city: {
    title: 'Cities',
    kicker: 'Urban chapters',
    description: 'Skylines, neighborhoods, food, and late-night streets from around the globe.',
    placeholder: 'Search cities…',
    noun: 'cities',
    center: [25, 10],
    zoom: 2,
    gradient: 'from-[#ffd99b] via-[#ffebc8] to-[#fff9ed]',
    accent: 'text-[#b9650d]',
    icon: 'M3 21V9l4-2v3l4-2v3l4-2v11H3Zm2-2h2v-2H5v2Zm0-4h2v-2H5v2Zm4 4h2v-2H9v2Zm0-4h2v-2H9v2Zm4 4h2v-2h-2v2ZM17 12h4v9h-4v-9Zm1 5h2v-2h-2v2Z',
  },
  'us-state': {
    title: 'States',
    kicker: 'Big chapters, one stamp',
    description: 'The fifty-state collection, plus the state-level places you add.',
    placeholder: 'Search states…',
    noun: 'states',
    center: [39.5, -98.5],
    zoom: 3,
    gradient: 'from-[#beeacb] via-[#e1f5e7] to-[#f7fcf8]',
    accent: 'text-[#207c44]',
    icon: 'M12 2.5 14.7 9l7 .6-5.3 4.6 1.6 6.8L12 17.5 5.9 21l1.7-6.8L2.3 9.6l7-.6L12 2.5Z',
  },
};

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
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.country.toLowerCase().includes(q) ||
          p.state?.toLowerCase().includes(q),
      )
    : null;

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

  const collected = categoryPlaces?.filter((p) => p.stamp).length ?? 0;
  const progress = categoryPlaces?.length
    ? Math.round((collected / categoryPlaces.length) * 100)
    : 0;

  return (
    <div className="px-4 pt-3 pb-7">
      <section className={`relative overflow-hidden rounded-[32px] bg-gradient-to-br ${meta.gradient} px-5 pt-5 pb-7 shadow-[0_18px_50px_rgba(24,32,52,0.1)]`}>
        <div className="pointer-events-none absolute -top-14 -right-14 h-44 w-44 rounded-full border-[30px] border-white/28" />
        <div className="pointer-events-none absolute right-5 bottom-4 opacity-[0.1]">
          <svg viewBox="0 0 24 24" className="h-28 w-28 fill-ink" aria-hidden>
            <path d={meta.icon} />
          </svg>
        </div>

        <motion.button
          type="button"
          onClick={() => navigate('/')}
          whileTap={{ scale: 0.88 }}
          className="relative z-10 flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/70 bg-white/65 text-2xl shadow-sm backdrop-blur-xl"
          aria-label="Back to home"
          data-testid="back-button"
        >
          ‹
        </motion.button>

        <div className="relative z-10 mt-6 max-w-[78%]">
          <p className={`eyebrow ${meta.accent}`}>{meta.kicker}</p>
          <h1 className="mt-1.5 font-display text-[38px] leading-none">{meta.title}</h1>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{meta.description}</p>
        </div>

        <div className="relative z-10 mt-5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold text-ink-soft">
              <span>{collected} collected</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/8">
              <div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(progress, 2)}%` }} />
            </div>
          </div>
          <span className="rounded-full border border-white/70 bg-white/58 px-3 py-1.5 text-[10px] font-bold text-ink-soft backdrop-blur-xl">
            {categoryPlaces ? `${categoryPlaces.length} places` : 'Loading…'}
          </span>
        </div>
      </section>

      {categoryPlaces && categoryPlaces.length > 0 && (
        <div className="glass-panel relative z-10 mx-2 -mt-3 mb-5 rounded-[22px] p-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex-1">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={meta.placeholder}
                data-testid={`${category}-search`}
              />
            </div>
            <div className="flex shrink-0 rounded-[15px] bg-black/5 p-1" role="group" aria-label="View">
              {(['cards', 'map'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  data-testid={`${category}-view-${v}`}
                  className={`rounded-[11px] px-3 py-2 text-[11px] font-bold transition-all ${
                    view === v ? 'bg-ink text-white shadow-sm' : 'text-ink-soft'
                  }`}
                >
                  {v === 'cards' ? 'Cards' : 'Map'}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 px-1 text-[10px] font-medium text-ink-soft">
            {position ? 'Sorted by distance from you' : 'Sorted alphabetically · photo collection available'}
          </p>
        </div>
      )}

      {sorted && sorted.length === 0 && (
        <div className="glass-panel mt-6 rounded-[24px] px-5 py-10 text-center">
          <p className="font-display text-lg">No passport match</p>
          <p className="mt-1 text-sm text-ink-soft">No {meta.noun} match “{query}”.</p>
        </div>
      )}

      {view === 'cards' ? (
        sorted &&
        sorted.length > 0 && (
          <div className="rounded-[28px] border border-white/65 bg-white/48 px-3 pt-4 pb-6 shadow-[0_16px_45px_rgba(24,32,52,0.07)] backdrop-blur-lg">
            <div className="grid grid-cols-2 gap-x-4 gap-y-6" data-testid={`${category}-cards`}>
              {sorted.map(({ place }, i) => (
                <StampCard key={place.id} place={place} index={i} />
              ))}
            </div>
          </div>
        )
      ) : (
        <div
          className="h-[65vh] overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_18px_50px_rgba(24,32,52,0.12)]"
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
