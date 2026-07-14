import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePlaces } from '../hooks/usePlaces';
import { StampCard } from '../components/StampCard';
import { SearchInput } from '../components/SearchInput';

export default function PassportPage() {
  const { user } = useAuth();
  const { places, error } = usePlaces();
  const [query, setQuery] = useState('');

  const collected = places?.filter((p) => p.stamp) ?? [];
  const countries = new Set(collected.map((p) => p.country));

  const q = query.trim().toLowerCase();
  const matchesQuery = (p: { name: string; country: string }) =>
    !q || p.name.toLowerCase().includes(q) || p.country.toLowerCase().includes(q);

  const curated = places?.filter((p) => p.isCurated && matchesQuery(p)) ?? [];
  const mine = places?.filter((p) => !p.isCurated && matchesQuery(p)) ?? [];
  const noResults = q !== '' && curated.length === 0 && mine.length === 0;

  return (
    <div className="px-4 pt-6">
      <header className="mb-1">
        <p className="text-sm text-ink-soft">{user?.displayName}’s</p>
        <h1 className="font-display text-3xl">Travel Passport</h1>
      </header>

      {places && (
        <div className="mt-3 mb-5 flex gap-2" data-testid="stats-strip">
          <div className="flex-1 rounded-xl border border-ink/10 bg-paper-light px-3 py-2.5">
            <p className="font-display text-xl leading-none">
              {collected.length}
              <span className="text-sm text-ink-soft"> / {places.length}</span>
            </p>
            <p className="mt-1 text-[11px] tracking-wide text-ink-soft uppercase">Stamps</p>
          </div>
          <div className="flex-1 rounded-xl border border-ink/10 bg-paper-light px-3 py-2.5">
            <p className="font-display text-xl leading-none">{countries.size}</p>
            <p className="mt-1 text-[11px] tracking-wide text-ink-soft uppercase">Countries</p>
          </div>
        </div>
      )}

      {places && places.length > 0 && (
        <div className="mb-5">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search cities or countries…"
            data-testid="passport-search"
          />
        </div>
      )}

      {error && <p className="mt-8 text-center text-sm text-terracotta">{error}</p>}
      {!places && !error && <p className="mt-8 text-center text-sm text-ink-soft">Opening your passport…</p>}

      {places && (
        <>
          {noResults && (
            <p className="mt-10 pb-6 text-center text-sm text-ink-soft">No places match “{query}”.</p>
          )}
          {curated.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 pb-6" data-testid="passport-grid">
              {curated.map((place, i) => (
                <StampCard key={place.id} place={place} index={i} />
              ))}
            </div>
          )}
          {mine.length > 0 && (
            <>
              <h2 className="mb-3 font-display text-xl">My places</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-5 pb-6" data-testid="my-places-grid">
                {mine.map((place, i) => (
                  <StampCard key={place.id} place={place} index={i} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
