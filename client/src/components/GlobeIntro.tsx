import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const AUTO_DISMISS_MS = 2800;

const PINS = [
  { x: 84, y: 76, color: 'var(--color-terracotta)', delay: 0.4 },
  { x: 152, y: 92, color: 'var(--color-mustard)', delay: 0.52 },
  { x: 68, y: 146, color: 'var(--color-teal)', delay: 0.64 },
  { x: 130, y: 160, color: 'var(--color-terracotta)', delay: 0.76 },
  { x: 170, y: 138, color: 'var(--color-mustard)', delay: 0.88 },
];

const CONTINENT_BLOBS = [
  'M78 62 q14 -10 26 -2 q10 8 2 18 q-10 10 -22 4 q-12 -6 -6 -20 Z',
  'M148 70 q16 -6 22 6 q4 10 -8 16 q-14 6 -20 -6 q-4 -10 6 -16 Z',
  'M64 118 q12 -8 22 0 q8 8 -2 18 q-10 8 -20 0 q-8 -8 0 -18 Z',
  'M126 132 q18 -8 28 4 q8 10 -6 18 q-16 8 -26 -4 q-6 -8 4 -18 Z',
  'M96 168 q14 -8 24 2 q6 8 -6 14 q-12 6 -20 -4 q-6 -6 2 -12 Z',
];

/** One-shot brand splash: a spinning globe with landmarks lighting up and a
 * plane orbiting past, then it fades to reveal the real app underneath
 * (which mounts in parallel — this never gates data loading). */
export function GlobeIntro({ onDone }: { onDone: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      onDone();
      return;
    }
    const t = setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [reducedMotion, onDone]);

  if (reducedMotion) return null;

  return (
    <AnimatePresence onExitComplete={onDone}>
      {!dismissed && (
        <motion.div
          role="presentation"
          aria-hidden="true"
          onClick={() => setDismissed(true)}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-paper"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <svg viewBox="0 0 240 240" className="w-56 max-w-[70vw]" role="img" aria-label="">
            <defs>
              <radialGradient id="intro-globe" cx="35%" cy="30%" r="75%">
                <stop offset="0%" stopColor="var(--color-paper-light)" />
                <stop offset="55%" stopColor="#9fc4bc" />
                <stop offset="100%" stopColor="var(--color-teal)" />
              </radialGradient>
            </defs>

            {/* corner sparkles */}
            {[
              [22, 30],
              [214, 26],
              [26, 208],
              [216, 214],
            ].map(([x, y], i) => (
              <motion.circle
                key={i}
                cx={x}
                cy={y}
                r={2}
                fill="var(--color-mustard)"
                initial={{ opacity: 0.15 }}
                animate={{ opacity: [0.15, 0.8, 0.15] }}
                transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.3, ease: 'easeInOut' }}
              />
            ))}

            <circle cx={120} cy={120} r={82} fill="url(#intro-globe)" stroke="var(--color-ink)" strokeWidth={1.5} />

            <g className="animate-globe-spin" style={{ clipPath: 'circle(82px at 120px 120px)' }}>
              <ellipse cx={120} cy={120} rx={82} ry={22} fill="none" stroke="var(--color-ink)" strokeWidth={0.75} opacity={0.3} />
              <ellipse cx={120} cy={120} rx={28} ry={82} fill="none" stroke="var(--color-ink)" strokeWidth={0.75} opacity={0.3} />
              <ellipse cx={120} cy={120} rx={58} ry={82} fill="none" stroke="var(--color-ink)" strokeWidth={0.75} opacity={0.3} />
              {CONTINENT_BLOBS.map((d, i) => (
                <path key={i} d={d} fill="var(--color-olive)" opacity={0.75} />
              ))}
            </g>

            {/* orbiting flight path + plane */}
            <path
              id="intro-orbit"
              d="M16 120 A104 48 0 1 1 224 120 A104 48 0 1 1 16 120"
              fill="none"
              stroke="var(--color-terracotta)"
              strokeWidth={1.5}
              strokeDasharray="3 6"
              opacity={0.55}
              transform="rotate(-14 120 120)"
            />
            <g fill="var(--color-terracotta)">
              <path d="M-6,-4 L9,0 L-6,4 L-2,0 Z">
                <animateMotion dur="3.2s" repeatCount="indefinite" rotate="auto">
                  <mpath href="#intro-orbit" />
                </animateMotion>
              </path>
            </g>

            {/* landmark pins lighting up across the world */}
            {PINS.map((p, i) => (
              <g key={i}>
                <motion.circle
                  cx={p.x}
                  cy={p.y}
                  r={3.5}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={1.5}
                  initial={{ opacity: 0 }}
                  animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: p.delay + 0.3, ease: 'easeOut' }}
                />
                <motion.circle
                  cx={p.x}
                  cy={p.y}
                  r={3.5}
                  fill={p.color}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: p.delay, type: 'spring', stiffness: 320, damping: 16 }}
                />
              </g>
            ))}
          </svg>

          <motion.h1
            className="mt-2 font-display text-3xl text-ink"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            StampQuest
          </motion.h1>
          <motion.p
            className="mt-1 text-sm text-ink-soft"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.32, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            Your passport to the world
          </motion.p>
          <motion.p
            className="mt-8 text-xs text-ink-soft/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.9, duration: 0.6 }}
          >
            Tap to explore
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
