import { NavLink } from 'react-router';
import { motion } from 'framer-motion';

const tabs = [
  {
    to: '/',
    label: 'Passport',
    icon: (
      // passport book
      <path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm5.5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 1.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4ZM8 18h7v1.4H8Z" />
    ),
  },
  {
    to: '/explore',
    label: 'Explore',
    icon: (
      // compass
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 1.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4Zm4.2 4-6 2.4-2.4 6 6-2.4 2.4-6ZM12 10.9a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z" />
    ),
  },
  {
    to: '/add',
    label: 'Add',
    icon: (
      // plus in stamp frame
      <path d="M4 4h16v16H4V4Zm1.8 1.8v12.4h12.4V5.8H5.8ZM11 8h2v3h3v2h-3v3h-2v-3H8v-2h3V8Z" />
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (
      // person
      <path d="M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 1.8a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4ZM12 13c3.9 0 7 2.2 7 5.4V21H5v-2.6C5 15.2 8.1 13 12 13Zm0 1.8c-3 0-5.2 1.6-5.2 3.6v.8h10.4v-.8c0-2-2.2-3.6-5.2-3.6Z" />
    ),
  },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-ink/10 bg-paper-light/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className="relative">
            {({ isActive }) => (
              <motion.div
                whileTap={{ scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] tracking-wide transition-colors duration-200 ${
                  isActive ? 'text-terracotta' : 'text-ink-soft'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="bottom-nav-pill"
                    className="absolute inset-x-3 inset-y-1 rounded-xl bg-terracotta/10"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <svg viewBox="0 0 24 24" className="relative h-6 w-6 fill-current" aria-hidden>
                  {tab.icon}
                </svg>
                <span className="relative">{tab.label}</span>
              </motion.div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
