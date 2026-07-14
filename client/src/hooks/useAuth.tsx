import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../lib/api';
import type { Stats, User } from '../types';

interface MeResponse {
  user: User;
  stats: Stats;
}

interface AuthContextValue {
  user: User | null;
  stats: Stats | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: (credential: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api.get<MeResponse>('/api/auth/me');
      setUser(me.user);
      setStats(me.stats);
    } catch {
      setUser(null);
      setStats(null);
    }
  }, []);

  useEffect(() => {
    refreshMe().finally(() => setLoading(false));
  }, [refreshMe]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      stats,
      loading,
      signIn: async (email, password) => {
        const me = await api.post<MeResponse>('/api/auth/login', { email, password });
        setUser(me.user);
        setStats(me.stats);
      },
      signUp: async (email, password, displayName) => {
        const me = await api.post<MeResponse>('/api/auth/register', {
          email,
          password,
          displayName,
        });
        setUser(me.user);
        setStats(me.stats);
      },
      signInWithGoogle: async (credential) => {
        const me = await api.post<MeResponse>('/api/auth/google', { credential });
        setUser(me.user);
        setStats(me.stats);
      },
      signOut: async () => {
        await api.post('/api/auth/logout');
        setUser(null);
        setStats(null);
      },
      refreshMe,
    }),
    [user, stats, loading, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
