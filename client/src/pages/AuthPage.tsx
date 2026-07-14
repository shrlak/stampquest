import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/Button';
import { BrandMark } from '../components/BrandMark';
import { ApiError } from '../lib/api';

const ERROR_COPY: Record<string, string> = {
  INVALID_CREDENTIALS: 'Wrong username or password.',
  USERNAME_TAKEN: 'That username is already taken — try signing in, or pick another.',
  INVALID_USERNAME: 'Usernames are 3–24 characters: letters, numbers, and underscores only.',
  WEAK_PASSWORD: 'Password must be at least 8 characters.',
};

export default function AuthPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await signIn(username, password);
      else await signUp(username, password);
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
    <motion.main
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="mx-auto mb-5 rounded-[18px] shadow-[0_14px_36px_rgba(74,56,44,0.2)]"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <BrandMark size={76} />
      </motion.div>
      <h1 className="text-center font-display text-[38px] leading-tight">StampQuest</h1>
      <p className="mx-auto mt-2 max-w-72 text-center text-[15px] leading-relaxed text-ink-soft">
        Turn the places you visit into a passport that is entirely yours.
      </p>

      <form
        onSubmit={submit}
        className="mt-8 flex flex-col gap-3 rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_18px_50px_rgba(0,0,0,0.08)]"
      >
        <div className="mb-1">
          <p className="font-display text-xl">
            {mode === 'signin' ? 'Welcome back' : 'Create your passport'}
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {mode === 'signin'
              ? 'Sign in to continue your collection.'
              : 'Your collection stays private to your account.'}
          </p>
        </div>
        <input
          className="input"
          required
          placeholder="Username"
          minLength={3}
          maxLength={24}
          pattern="[a-zA-Z0-9_]+"
          title="Letters, numbers, and underscores only"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          data-testid="auth-username"
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
          data-testid="auth-password"
        />
        {error && (
          <p className="rounded-xl bg-terracotta/8 px-3 py-2.5 text-sm text-terracotta" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="mt-1 w-full" data-testid="auth-submit">
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
      </form>

      <button
        type="button"
        className="mt-5 text-center text-sm font-medium text-teal transition-opacity hover:opacity-70"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
        }}
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </motion.main>
  );
}
