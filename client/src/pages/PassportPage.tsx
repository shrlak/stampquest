import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { usePlaces } from '../hooks/usePlaces';
import { CONTINENT_COUNT, continentOf } from '../lib/continents';
import type { PlaceCategory } from '../types';

const CATEGORY_CARDS: {
  category: PlaceCategory;
  to: string;
  title: string;
  blurb: string;
  icon: string;
}[] = [
  {
    category: 'landmark',
    to: '/landmarks',
    title: 'Landmarks',
    blurb: 'World landmarks worth the trip',
    icon: 'M12 2 7 9h2v11h6V9h2L12 2Zm-1 9h2v7h-2v-7ZM5 21h14v1.6H5V21Z',
  },
  {
    category: 'city',
    to: '/cities',
    title: 'Cities',
    blurb: 'Iconic cities to explore',
    icon: 'M3 21V9l4-2v3l4-2v3l4-2v11H3Zm2-2h2v-2H5v2Zm0-4h2v-2H5v2Zm4 4h2v-2H9v2Zm0-4h2v-2H9v2Zm4 4h2v-2h-2v2ZM17 12h4v9h-4v-9Zm1 5h2v-2h-2v2Z',
  },
  {
    category: 'us-state',
    to: '/us-states',
    title: 'US States',
    blurb: 'One iconic stop in all 50 states',
    icon: 'M12 2.5 14.7 9l7 .6-5.3 4.6 1.6 6.8L12 17.5 5.9 21l1.7-6.8L2.3 9.6l7-.6L12 2.5Z',
  },
];

export default function PassportPage() {
  const { user } = useAuth();
  const { places, error } = usePlaces();

  const collected = places?.filter((p) => p.stamp) ?? [];
  const countries = new Set(collected.map((p) => p.country));
  const continents = new Set(
    collected.map((p) => continentOf(p.country)).filter((c) => c !== undefined),
  );

  return (
    <div className="px-4 pt-6 pb-8">
      <header className="mb-1">
        <p className="text-sm text-ink-soft">{user?.username}’s</p>
        <h1 className="font-display text-3xl">Travel Passport</h1>
        <p className="mt-0.5 text-xs tracking-wide text-ink-soft">Your passport to the world</p>
      </header>

      {places && (
        <div className="mt-3 mb-6 flex gap-2" data-testid="stats-strip">
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
          <div className="flex-1 rounded-xl border border-ink/10 bg-paper-light px-3 py-2.5">
            <p className="font-display text-xl leading-none">
              {continents.size}
              <span className="text-sm text-ink-soft"> / {CONTINENT_COUNT}</span>
            </p>
            <p className="mt-1 text-[11px] tracking-wide text-ink-soft uppercase">Continents</p>
          </div>
        </div>
      )}

      {error && <p className="mt-8 text-center text-sm text-terracotta">{error}</p>}
      {!places && !error && (
        <p className="mt-8 text-center text-sm text-ink-soft">Opening your passport…</p>
      )}

      {places && (
        <div className="flex flex-col gap-3" data-testid="home-cards">
          {CATEGORY_CARDS.map((c, i) => {
            const all = places.filter((p) => p.category === c.category);
            const got = all.filter((p) => p.stamp).length;
            return (
              <motion.div
                key={c.category}
                className="animate-card-in"
                style={{ animationDelay: `${i * 60}ms` }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              >
                <Link
                  to={c.to}
                  data-testid={`home-card-${c.category}`}
                  className="flex items-center gap-4 rounded-2xl border border-ink/10 bg-paper-light p-4"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-teal/10">
                    <svg viewBox="0 0 24 24" className="h-7 w-7 fill-teal" aria-hidden>
                      <path d={c.icon} />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-xl">{c.title}</p>
                    <p className="text-xs text-ink-soft">{c.blurb}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {got} / {all.length} collected
                    </p>
                  </div>
                  <span className="text-2xl text-ink-soft">›</span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
