import { useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { useGeo } from '../hooks/useGeolocation';
import { usePlaces } from '../hooks/usePlaces';
import { haversineMeters } from '../lib/geo';
import { Button } from '../components/Button';
import { DistanceBadge } from '../components/DistanceBadge';
import { SearchInput } from '../components/SearchInput';
import { StampSVG } from '../art/StampSVG';

export default function ExplorePage() {
  const { position, error, loading, request } = useGeo();
  const { places } = usePlaces();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = places
    ? places.filter((p) => !q || p.name.toLowerCase().includes(q) || p.country.toLowerCase().includes(q))
    : null;

  // Sorted by distance once we have a position; otherwise alphabetically, so
  // search is useful even before location is granted.
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
    <div className="px-4 pt-6">
      <header className="mb-4 flex items-end justify-between">
        <h1 className="font-display text-3xl">Explore</h1>
        {position && (
          <button
            type="button"
            onClick={request}
            disabled={loading}
            className="text-sm text-teal underline underline-offset-2 disabled:opacity-50"
          >
            {loading ? 'Locating…' : 'Refresh location'}
          </button>
        )}
      </header>

      {places && places.length > 0 && (
        <div className="mb-4">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search cities or countries…"
            data-testid="explore-search"
          />
        </div>
      )}

      {!position && (
        <div className="mb-5 rounded-2xl border border-ink/10 bg-paper-light p-5 text-center">
          <svg viewBox="0 0 24 24" className="mx-auto h-8 w-8 fill-teal" aria-hidden>
            <path d="M12 2a7 7 0 0 1 7 7c0 4.5-4.7 10.3-6.4 12.2a.8.8 0 0 1-1.2 0C9.7 19.3 5 13.5 5 9a7 7 0 0 1 7-7Zm0 4.4A2.6 2.6 0 1 0 12 11.6 2.6 2.6 0 0 0 12 6.4Z" />
          </svg>
          <h2 className="mt-2 font-display text-lg">Find stamps near you</h2>
          <p className="mx-auto mt-1 max-w-64 text-sm text-ink-soft">
            Enable location to see how far you are from each stamp — get within 500 m to collect.
          </p>
          <Button onClick={request} disabled={loading} className="mt-3" data-testid="enable-location">
            {loading ? 'Locating…' : 'Enable location'}
          </Button>
          {error && <p className="mt-3 text-sm text-terracotta">{error}</p>}
        </div>
      )}

      {sorted && sorted.length === 0 && (
        <p className="mt-10 text-center text-sm text-ink-soft">No places match “{query}”.</p>
      )}

      {sorted && sorted.length > 0 && (
        <ul className="flex flex-col gap-2 pb-6" data-testid="explore-list">
          {sorted.map(({ place, distance }, i) => (
            <li
              key={place.id}
              className="animate-card-in"
              style={{ animationDelay: `${Math.min(i, 24) * 14}ms` }}
            >
              <motion.div
                whileHover={{ x: 3 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              >
                <Link
                  to={`/place/${place.id}`}
                  className="flex items-center gap-3 rounded-xl border border-ink/10 bg-paper-light p-2.5"
                >
                  <div className="w-12 shrink-0">
                    <StampSVG
                      subject={place}
                      photoUrl={place.stamp?.photoUrl}
                      className={place.stamp ? 'w-full' : 'w-full opacity-60 grayscale'}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display">{place.name}</p>
                    <p className="truncate text-xs text-ink-soft">{place.country}</p>
                  </div>
                  {place.stamp ? (
                    <span className="rounded-full bg-mustard/20 px-2.5 py-1 text-[11px] font-medium text-ink">
                      Collected
                    </span>
                  ) : distance !== null ? (
                    <DistanceBadge meters={distance} />
                  ) : null}
                </Link>
              </motion.div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
