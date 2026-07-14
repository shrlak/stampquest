import { Link, useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { usePlaces } from '../hooks/usePlaces';
import { Button } from '../components/Button';
import { IS_LOCAL_BACKEND } from '../lib/api';

export default function ProfilePage() {
  const { user, stats, signOut } = useAuth();
  const { places } = usePlaces();
  const navigate = useNavigate();

  const mine = places?.filter((p) => p.isMine) ?? [];

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="font-display text-3xl">Profile</h1>
      <motion.div
        className="mt-4 rounded-2xl border border-ink/10 bg-paper-light p-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="font-display text-xl">{user?.displayName}</p>
        <p className="text-sm text-ink-soft">{user?.email}</p>
        <div className="mt-3 flex gap-4 text-sm">
          <p>
            <span className="font-display text-lg">{stats?.stampCount ?? 0}</span>{' '}
            <span className="text-ink-soft">stamps</span>
          </p>
          <p>
            <span className="font-display text-lg">{stats?.countryCount ?? 0}</span>{' '}
            <span className="text-ink-soft">countries</span>
          </p>
        </div>
      </motion.div>

      <h2 className="mt-6 mb-2 font-display text-xl">My places</h2>
      {mine.length === 0 ? (
        <p className="text-sm text-ink-soft">
          None yet —{' '}
          <Link to="/add" className="underline underline-offset-2">
            add a place you love
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map((p, i) => (
            <li
              key={p.id}
              className="animate-card-in"
              style={{ animationDelay: `${Math.min(i, 24) * 16}ms` }}
            >
              <Link
                to={`/place/${p.id}`}
                className="flex items-center justify-between rounded-xl border border-ink/10 bg-paper-light px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate font-display">{p.name}</span>
                  <span className="block truncate text-xs text-ink-soft">{p.country}</span>
                </span>
                <span className="text-xs text-ink-soft">{p.stamp ? 'Collected' : 'Locked'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {IS_LOCAL_BACKEND ? (
        <div className="mt-8">
          <p className="mb-3 text-center text-xs text-ink-soft">
            Demo mode — your passport is stored on this device only.
          </p>
          <Button
            variant="danger"
            className="w-full"
            onClick={async () => {
              if (
                !window.confirm(
                  'Reset your passport? All stamps and custom places on this device will be erased.',
                )
              ) {
                return;
              }
              const { resetLocalData } = await import('../lib/localBackend');
              resetLocalData();
              window.location.reload();
            }}
          >
            Reset passport
          </Button>
        </div>
      ) : (
        <Button
          variant="danger"
          className="mt-8 w-full"
          onClick={async () => {
            await signOut();
            navigate('/auth', { replace: true });
          }}
          data-testid="sign-out"
        >
          Sign out
        </Button>
      )}
    </div>
  );
}
