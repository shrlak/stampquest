import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useGeo } from '../hooks/useGeolocation';
import { usePlaces } from '../hooks/usePlaces';
import { CONTINENT_COUNT, continentOf } from '../lib/continents';
import { StampSVG } from '../art/StampSVG';
import type { PlaceCategory } from '../types';

const CATEGORY_CARDS: {
  category: PlaceCategory;
  to: string;
  title: string;
  blurb: string;
  chapter: string;
  gradient: string;
  accent: string;
  icon: string;
}[] = [
  {
    category: 'landmark',
    to: '/landmarks',
    title: 'Landmarks',
    blurb: 'Icons, wonders, and places that define a journey.',
    chapter: 'Chapter 01',
    gradient: 'from-[#d8ecff] via-[#edf7ff] to-[#f9fcff]',
    accent: 'bg-[#1479d4]',
    icon: 'M12 2 7 9h2v11h6V9h2L12 2Zm-1 9h2v7h-2v-7ZM5 21h14v1.6H5V21Z',
  },
  {
    category: 'city',
    to: '/cities',
    title: 'Cities',
    blurb: 'Neighborhoods, skylines, and streets worth remembering.',
    chapter: 'Chapter 02',
    gradient: 'from-[#ffe7bf] via-[#fff2da] to-[#fffaf1]',
    accent: 'bg-[#d77918]',
    icon: 'M3 21V9l4-2v3l4-2v3l4-2v11H3Zm2-2h2v-2H5v2Zm0-4h2v-2H5v2Zm4 4h2v-2H9v2Zm0-4h2v-2H9v2Zm4 4h2v-2h-2v2ZM17 12h4v9h-4v-9Zm1 5h2v-2h-2v2Z',
  },
  {
    category: 'us-state',
    to: '/us-states',
    title: 'States',
    blurb: 'State-sized chapters, from coastlines to mountain summits.',
    chapter: 'Chapter 03',
    gradient: 'from-[#d9f4e2] via-[#ecf9f0] to-[#f8fdf9]',
    accent: 'bg-[#248d4d]',
    icon: 'M12 2.5 14.7 9l7 .6-5.3 4.6 1.6 6.8L12 17.5 5.9 21l1.7-6.8L2.3 9.6l7-.6L12 2.5Z',
  },
];

export default function PassportPage() {
  const { user } = useAuth();
  const { position } = useGeo();
  const { places, error } = usePlaces();

  const collected = places?.filter((p) => p.stamp) ?? [];
  const countries = new Set(collected.map((p) => p.country));
  const continents = new Set(
    collected.map((p) => continentOf(p.country)).filter((c) => c !== undefined),
  );
  const nextPlace = places?.find((p) => !p.stamp) ?? places?.[0];
  const overallProgress = places?.length ? Math.round((collected.length / places.length) * 100) : 0;

  return (
    <div className="px-4 pt-3 pb-8">
      <header className="mb-4 px-1">
        <p className="eyebrow text-teal">Welcome back, {user?.username}</p>
        <h1 className="mt-1.5 font-display text-[36px] leading-[1.02]">Your world, collected.</h1>
      </header>

      <motion.section
        className="relative min-h-[220px] overflow-hidden rounded-[32px] bg-midnight px-5 py-5 text-white shadow-[0_24px_70px_rgba(20,25,39,0.26)]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="pointer-events-none absolute -top-24 -right-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,#367fc9_0%,#245989_38%,transparent_70%)] opacity-90" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,#d77952_0%,#92513e_36%,transparent_70%)] opacity-55" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-55" viewBox="0 0 360 220" preserveAspectRatio="none" aria-hidden>
          <path d="M-20 172 C64 110 113 202 187 126 S292 44 382 93" fill="none" stroke="white" strokeWidth="1.2" strokeDasharray="5 8" className="animate-route-dash" />
          <circle cx="79" cy="137" r="4" fill="white" />
          <circle cx="291" cy="77" r="4" fill="white" />
        </svg>

        <div className="relative z-10 max-w-[56%]">
          <p className="eyebrow text-white/55">Passport progress</p>
          <p className="mt-3 font-display text-[38px] leading-none">{overallProgress}%</p>
          <p className="mt-2 text-[13px] leading-relaxed text-white/68">
            Every stamp is a place, a memory, and a story only you can tell.
          </p>
        </div>

        {nextPlace && (
          <motion.div
            className="absolute top-3 -right-1 w-[130px] rotate-[7deg]"
            animate={{ y: [0, -6, 0], rotate: [7, 5.8, 7] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <StampSVG
              subject={nextPlace}
              photoUrl={nextPlace.stamp?.photoUrl}
              className="w-full drop-shadow-[0_14px_20px_rgba(0,0,0,0.3)]"
            />
          </motion.div>
        )}

        <div className="absolute bottom-4 left-5 flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-2 text-[11px] font-semibold backdrop-blur-xl">
          <span className={`h-2 w-2 rounded-full ${position ? 'bg-[#5ce07e]' : 'bg-white/35'}`} />
          {position ? 'Nearby sorting is on' : 'Collect with photo evidence'}
        </div>
      </motion.section>

      {places && (
        <div
          className="glass-panel relative z-10 mx-3 -mt-3 mb-7 grid grid-cols-3 divide-x divide-black/6 rounded-[22px] px-1 py-3.5"
          data-testid="stats-strip"
        >
          <Stat value={`${collected.length} / ${places.length}`} label="Stamps" />
          <Stat value={String(countries.size)} label="Countries" />
          <Stat value={`${continents.size} / ${CONTINENT_COUNT}`} label="Continents" />
        </div>
      )}

      {error && <p className="mt-8 text-center text-sm text-terracotta">{error}</p>}
      {!places && !error && (
        <p className="mt-8 text-center text-sm text-ink-soft">Opening your passport…</p>
      )}

      {places && (
        <section data-testid="home-cards">
          <div className="mb-3 flex items-end justify-between px-1">
            <div>
              <p className="eyebrow text-ink-soft">Explore the collection</p>
              <h2 className="mt-1 font-display text-[24px]">Choose a chapter</h2>
            </div>
            <span className="text-xs text-ink-soft">{places.length} places</span>
          </div>

          <div className="flex flex-col gap-3.5">
            {CATEGORY_CARDS.map((c, i) => {
              const all = places.filter((p) => p.category === c.category);
              const got = all.filter((p) => p.stamp).length;
              const preview = all.find((p) => !p.stamp) ?? all[0];
              const progress = all.length ? Math.round((got / all.length) * 100) : 0;
              return (
                <motion.div
                  key={c.category}
                  className="animate-card-in"
                  style={{ animationDelay: `${i * 70}ms` }}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                >
                  <Link
                    to={c.to}
                    data-testid={`home-card-${c.category}`}
                    className={`group relative block min-h-[154px] overflow-hidden rounded-[28px] border border-white/70 bg-gradient-to-br ${c.gradient} p-5 shadow-[0_15px_42px_rgba(24,32,52,0.09)]`}
                  >
                    <div className="pointer-events-none absolute -right-11 -bottom-14 h-40 w-40 rounded-full border-[28px] border-white/28" />
                    <div className="relative z-10 max-w-[62%]">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-8 w-8 items-center justify-center rounded-[11px] ${c.accent} text-white shadow-sm`}>
                          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-current" aria-hidden>
                            <path d={c.icon} />
                          </svg>
                        </span>
                        <span className="eyebrow text-ink-soft">{c.chapter}</span>
                      </div>
                      <h3 className="mt-3 font-display text-[25px] leading-none">{c.title}</h3>
                      <p className="mt-2 text-[12px] leading-snug text-ink-soft">{c.blurb}</p>
                      <div className="mt-3 flex items-center gap-2.5">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/8">
                          <div className={`h-full rounded-full ${c.accent}`} style={{ width: `${Math.max(progress, 3)}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-ink-soft">{got}/{all.length}</span>
                      </div>
                    </div>

                    {preview && (
                      <div className="absolute top-1/2 right-1 w-[108px] -translate-y-1/2 rotate-[5deg] transition-transform duration-300 group-hover:rotate-[2deg] group-hover:scale-[1.03]">
                        <StampSVG
                          subject={preview}
                          photoUrl={preview.stamp?.photoUrl}
                          className="w-full drop-shadow-[0_10px_16px_rgba(0,0,0,0.18)]"
                        />
                      </div>
                    )}
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-1 text-center">
      <p className="font-display text-[18px] leading-none tracking-tight">{value}</p>
      <p className="mt-1.5 text-[8px] font-bold tracking-[0.1em] text-ink-soft uppercase">{label}</p>
    </div>
  );
}
