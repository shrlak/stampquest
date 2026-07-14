import { AnimatePresence, motion } from 'framer-motion';

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  'data-testid': testId,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  'data-testid'?: string;
}) {
  return (
    <div className="relative">
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 fill-ink-soft"
        aria-hidden
      >
        <path d="M11 3a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm7.36 12.95 3.1 3.1-1.42 1.4-3.09-3.09Z" />
      </svg>
      <input
        type="text"
        inputMode="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        data-testid={testId}
        className="w-full rounded-xl border border-ink/10 bg-paper-light py-2.5 pr-9 pl-9 font-sans text-sm text-ink placeholder:text-ink-soft transition-shadow duration-200 focus:outline-none focus:ring-2 focus:ring-teal"
      />
      <AnimatePresence>
        {value && (
          <motion.button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            whileTap={{ scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1.5 text-ink-soft active:bg-ink/10"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
              <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4Z" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
