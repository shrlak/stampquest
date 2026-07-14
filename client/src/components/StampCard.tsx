import { Link } from 'react-router';
import { motion } from 'framer-motion';
import type { Place } from '../types';
import { StampSVG } from '../art/StampSVG';
import { fnv1a } from '../lib/hash';
import { formatCollectedDate } from '../lib/api';

export function StampCard({ place, index = 0 }: { place: Place; index?: number }) {
  const collected = place.stamp !== null;
  // pasted-in-the-album tilt, deterministic per place
  const rotation = collected ? ((fnv1a(place.id) >> 8) % 5) - 2 : 0;

  return (
    <div className="animate-card-in" style={{ animationDelay: `${Math.min(index, 24) * 16}ms` }}>
      <motion.div
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      >
        <Link
          to={`/place/${place.id}`}
          className="block"
          data-testid="stamp-card"
          data-collected={collected}
        >
          <div className="relative" style={{ transform: `rotate(${rotation}deg)` }}>
            <StampSVG
              subject={place}
              photoUrl={place.stamp?.photoUrl}
              className={`w-full ${
                collected
                  ? 'drop-shadow-[0_3px_6px_rgba(47,42,36,0.25)]'
                  : 'opacity-55 grayscale contrast-[0.85]'
              }`}
            />
            {!collected && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/70">
                  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-paper-light" aria-hidden>
                    <path d="M12 2a5 5 0 0 1 5 5v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v3h6V7a3 3 0 0 0-3-3Zm0 8.5a1.8 1.8 0 0 0-.9 3.36V18h1.8v-2.14A1.8 1.8 0 0 0 12 12.5Z" />
                  </svg>
                </div>
              </div>
            )}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-ink-soft">
            {collected ? `Collected ${formatCollectedDate(place.stamp!.collectedAt)}` : 'Not yet collected'}
          </p>
        </Link>
      </motion.div>
    </div>
  );
}
