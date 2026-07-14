import type { User } from '../types';

export function Avatar({ user, size = 36 }: { user: User | null; size?: number }) {
  const initial = user?.username?.[0]?.toUpperCase() ?? '?';
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink/15 bg-ink/10 font-display text-ink-soft"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {user?.photoUrl ? (
        <img src={user.photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}
