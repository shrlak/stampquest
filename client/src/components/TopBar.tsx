import { Link } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from './Avatar';

export function TopBar() {
  const { user } = useAuth();
  return (
    <header className="fixed top-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-b border-ink/10 bg-paper-light/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between px-4">
        <Link to="/" className="font-display text-lg tracking-wide" data-testid="topbar-home">
          StampQuest
        </Link>
        <Link to="/profile" aria-label="Profile" data-testid="topbar-profile">
          <Avatar user={user} size={36} />
        </Link>
      </div>
    </header>
  );
}
