import { useCallback, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/Button';
import { StampSVG } from '../art/StampSVG';
import { ApiError, IS_LOCAL_BACKEND } from '../lib/api';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

const ERROR_COPY: Record<string, string> = {
  INVALID_CREDENTIALS: 'Wrong email or password.',
  EMAIL_TAKEN: 'An account with this email already exists — try signing in.',
  INVALID_EMAIL: 'That doesn’t look like a valid email address.',
  WEAK_PASSWORD: 'Password must be at least 8 characters.',
  INVALID_GOOGLE_TOKEN: 'Google sign-in didn’t go through — try again.',
  GOOGLE_EMAIL_UNVERIFIED: 'That Google account’s email isn’t verified.',
  GOOGLE_LOGIN_UNAVAILABLE: 'Google sign-in isn’t configured on this server.',
};

// Baked in at build time; unset in the static GitHub Pages demo, which has
// no real per-account backend for Google to sign into.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export default function AuthPage() {
  const { user, loading, signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const handleGoogleCredential = useCallback(
    (credential: string) => {
      setBusy(true);
      setError(null);
      signInWithGoogle(credential)
        .then(() => navigate('/', { replace: true }))
        .catch((err) => {
          setError(
            err instanceof ApiError
              ? (ERROR_COPY[err.code] ?? 'Something went wrong. Try again.')
              : 'Could not reach the server. Are you online?',
          );
        })
        .finally(() => setBusy(false));
    },
    [signInWithGoogle, navigate],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await signIn(email, password);
      else await signUp(email, password, displayName);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (ERROR_COPY[err.code] ?? 'Something went wrong. Try again.')
          : 'Could not reach the server. Are you online?',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="mx-auto mb-4 w-28"
        initial={{ opacity: 0, scale: 0.8, rotate: -3 }}
        animate={{ opacity: 1, scale: 1, rotate: -3 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <StampSVG
          subject={{ id: 'welcome', name: 'StampQuest', country: 'Your travel passport', artKey: 'eiffel' }}
          illustrated
          className="w-full drop-shadow-[0_3px_6px_rgba(47,42,36,0.25)]"
        />
      </motion.div>
      <h1 className="text-center font-display text-4xl">StampQuest</h1>
      <p className="mt-1 text-center text-sm text-ink-soft">
        Collect stamps from the places you visit.
      </p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
        {mode === 'signup' && (
          <input
            className="input"
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            maxLength={40}
          />
        )}
        <input
          className="input"
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          className="input"
          type="password"
          required
          minLength={8}
          placeholder="Password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        />
        {error && (
          <p className="rounded-lg bg-terracotta/10 px-3 py-2 text-sm text-terracotta" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} data-testid="auth-submit">
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
      </form>

      {GOOGLE_CLIENT_ID && !IS_LOCAL_BACKEND && (
        <>
          <div className="mt-5 flex items-center gap-3 text-xs text-ink-soft">
            <div className="h-px flex-1 bg-ink/10" />
            <span>or</span>
            <div className="h-px flex-1 bg-ink/10" />
          </div>
          <div className="mt-4">
            <GoogleSignInButton clientId={GOOGLE_CLIENT_ID} onCredential={handleGoogleCredential} />
          </div>
        </>
      )}

      <button
        type="button"
        className="mt-4 text-center text-sm text-ink-soft underline underline-offset-2"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
        }}
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </motion.div>
  );
}
